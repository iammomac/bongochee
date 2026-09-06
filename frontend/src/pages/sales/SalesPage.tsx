import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, PlusCircle, Receipt as ReceiptIcon, Trash2, X } from "lucide-react";
import { SearchCreateCombobox } from "../../components/SearchCreateCombobox";
import { SaleReceipt } from "../../components/SaleReceipt";
import { Select } from "../../components/Select";
import { searchAvailableStock, createSale, listRecentSales, updateSale } from "../../services/sales";
import { extractErrorMessage } from "../../lib/errors";
import { openWhatsAppReceipt } from "../../lib/whatsapp";
import { usePermissions } from "../../hooks/usePermissions";
import type { AvailablePhone, PaymentMethod, Sale } from "../../types";

const IMEI_PATTERN = /^\d{15}$/;

const headerSchema = z.object({
  customerName: z.string().min(1, "Required"),
  customerPhone: z.string().optional(),
  paymentMethod: z.enum(["cash", "mobile_money", "card"]),
  notes: z.string().optional(),
  invoiceNumber: z.string().min(1, "Required"),
});
type HeaderValues = z.infer<typeof headerSchema>;

interface CartLine {
  id: string;
  phone: AvailablePhone;
  imei: string;
  soldPrice: number;
  discount: number;
}

const netPrice = (line: Pick<CartLine, "soldPrice" | "discount">) => line.soldPrice - line.discount;

const currency = (value: number) => new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);

function generateInvoiceNumber() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `INV-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function defaultHeaderValues(): HeaderValues {
  return {
    customerName: "",
    customerPhone: "",
    paymentMethod: "cash",
    notes: "",
    invoiceNumber: generateInvoiceNumber(),
  };
}

interface PhoneEntryPanelProps {
  existingImeis: string[];
  onAddToCart: (lines: CartLine[]) => void;
}

function PhoneEntryPanel({ existingImeis, onAddToCart }: PhoneEntryPanelProps) {
  const [phone, setPhone] = useState<AvailablePhone | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [soldPrice, setSoldPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [imeis, setImeis] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const resetPanel = () => {
    setPhone(null);
    setQuantity(1);
    setSoldPrice(0);
    setDiscount(0);
    setImeis(null);
    setError(null);
    setWarning(null);
  };

  const handleSelectPhone = (selected: AvailablePhone) => {
    setPhone(selected);
    setQuantity(1);
    setSoldPrice(selected.maxSellingPrice);
    setDiscount(0);
    setImeis(null);
    setError(null);
    setWarning(null);
  };

  const handleContinue = () => {
    if (!phone) return;
    if (quantity < 1 || quantity > phone.quantityRemaining) {
      setError(`Quantity must be between 1 and ${phone.quantityRemaining}`);
      return;
    }
    setError(null);
    // Below the floor isn't blocked — just flagged. It'll show up on the Loss Report.
    const net = soldPrice - discount;
    setWarning(
      net < phone.minSellingPrice
        ? `Below the minimum of TZS ${currency(phone.minSellingPrice)} — this sale will show up on the Loss Report`
        : null,
    );
    setImeis(Array(quantity).fill(""));
  };

  const handleAddToCart = () => {
    if (!phone || !imeis) return;
    // Blank is fine (IMEI isn't required) -- only reject one that's actually been typed
    // but doesn't look like a real IMEI.
    if (imeis.some((imei) => imei.trim() !== "" && !IMEI_PATTERN.test(imei))) {
      setError("Each IMEI must be exactly 15 digits, or left blank");
      return;
    }
    const nonBlankNew = imeis.filter((imei) => imei.trim() !== "");
    const allImeis = [...existingImeis.filter((imei) => imei), ...nonBlankNew];
    if (new Set(allImeis).size !== allImeis.length) {
      setError("Duplicate IMEI — check the numbers entered");
      return;
    }
    onAddToCart(
      imeis.map((imei) => ({
        id: `${phone.id}-${imei}-${Date.now()}`,
        phone,
        imei,
        soldPrice,
        discount,
      })),
    );
    resetPanel();
  };

  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-sm font-semibold text-gray-500">Search a phone</h2>
      <SearchCreateCombobox<AvailablePhone>
        value={phone}
        onSelect={handleSelectPhone}
        search={searchAvailableStock}
        placeholder="Search by category or model…"
      />
      {phone ? (
        <div className="rounded-2xl bg-background p-3 text-sm dark:bg-gray-950">
          <p className="font-medium">{phone.name}</p>
          <p className="text-gray-400">
            {phone.quantityRemaining} available · floor TZS {currency(phone.minSellingPrice)} · asking TZS{" "}
            {currency(phone.maxSellingPrice)}
          </p>
          {phone.notes ? <p className="mt-1 text-xs text-gray-400">Condition: {phone.notes}</p> : null}
        </div>
      ) : null}

      {phone && imeis === null ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Sold price</label>
            <input
              type="number"
              value={soldPrice || ""}
              onChange={(e) => setSoldPrice(Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Discount (optional)</label>
            <input
              type="number"
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="button"
              onClick={handleContinue}
              className="w-full rounded-xl bg-primary py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {phone && imeis ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">Enter one IMEI per unit (optional)</p>
          {imeis.map((value, i) => (
            <input
              key={i}
              value={value}
              onChange={(e) => {
                const next = [...imeis];
                next[i] = e.target.value;
                setImeis(next);
              }}
              placeholder={`IMEI #${i + 1} (optional, 15 digits)`}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
            />
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setImeis(null)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 dark:border-gray-800"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleAddToCart}
              className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Add to sale
            </button>
          </div>
        </div>
      ) : null}

      {warning ? <p className="text-xs text-warning">{warning}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

const editHeaderSchema = z.object({
  customerName: z.string().min(1, "Required"),
  customerPhone: z.string().optional(),
  paymentMethod: z.enum(["cash", "mobile_money", "card"]),
  notes: z.string().optional(),
});
type EditHeaderValues = z.infer<typeof editHeaderSchema>;

interface EditSaleModalProps {
  sale: Sale;
  onClose: () => void;
  onSaved: () => void;
}

function EditSaleModal({ sale, onClose, onSaved }: EditSaleModalProps) {
  const [items, setItems] = useState(sale.items.map((item) => ({ ...item })));
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EditHeaderValues>({
    resolver: zodResolver(editHeaderSchema),
    defaultValues: {
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      paymentMethod: sale.paymentMethod,
      notes: sale.notes,
    },
  });

  const setItemField = (id: string, field: "sellingPrice" | "discount", value: number) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const onSubmit = async (values: EditHeaderValues) => {
    setServerError(null);
    try {
      await updateSale(sale.id, {
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        paymentMethod: values.paymentMethod as PaymentMethod,
        notes: values.notes,
        items: items.map((item) => ({
          id: item.id,
          stockItem: item.stockItem,
          imei: item.imei,
          sellingPrice: item.sellingPrice,
          discount: item.discount,
        })),
      });
      onSaved();
      onClose();
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to save these changes"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit sale — {sale.invoiceNumber}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {serverError ? <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{serverError}</p> : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Customer name</label>
              <input
                {...register("customerName")}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
              />
              {errors.customerName ? <p className="mt-1 text-xs text-danger">{errors.customerName.message}</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Customer phone</label>
              <input
                {...register("customerPhone")}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Payment method</label>
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field }) => (
                  <Select value={field.value} onChange={field.onChange}>
                    <option value="cash">Cash</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="card">Card</option>
                  </Select>
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
              <input
                {...register("notes")}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500">Items — price and discount only; phone/IMEI can't change here</p>
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 p-3 dark:border-gray-800">
                <p className="text-sm font-medium">
                  {item.categoryName} {item.modelName}
                </p>
                <p className="mb-2 text-xs text-gray-400">IMEI: {item.imei || "—"}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Sold price</label>
                    <input
                      type="number"
                      value={item.sellingPrice}
                      onChange={(e) => setItemField(item.id, "sellingPrice", Number(e.target.value))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Discount</label>
                    <input
                      type="number"
                      value={item.discount}
                      onChange={(e) => setItemField(item.id, "discount", Number(e.target.value))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 dark:border-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SalesPage() {
  const { has } = usePermissions();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const canEdit = has("edit_sales");

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<HeaderValues>({
    resolver: zodResolver(headerSchema),
    defaultValues: defaultHeaderValues(),
  });

  const loadRecentSales = () => {
    listRecentSales()
      .then(setRecentSales)
      .catch(() => setServerError("Unable to load recent sales"));
  };

  useEffect(() => {
    loadRecentSales();
  }, []);

  const total = cart.reduce((sum, line) => sum + netPrice(line), 0);

  const onSubmit = async (values: HeaderValues) => {
    setServerError(null);
    if (cart.length === 0) {
      setServerError("Add at least one phone to the sale");
      return;
    }
    try {
      const sale = await createSale({
        invoiceNumber: values.invoiceNumber,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        paymentMethod: values.paymentMethod as PaymentMethod,
        notes: values.notes,
        items: cart.map((line) => ({
          stockItem: line.phone.id,
          imei: line.imei,
          sellingPrice: line.soldPrice,
          discount: line.discount,
        })),
      });
      // Fired here, immediately after the same click that submitted the form —
      // not later (e.g. when the receipt below mounts) — since browsers are prone
      // to silently blocking a window.open() the further it drifts from the
      // original user gesture. The receipt's own button is the manual fallback if
      // this one gets blocked.
      if (sale.customerPhone) openWhatsAppReceipt(sale);
      setReceiptSale(sale);
      setCart([]);
      reset(defaultHeaderValues());
      loadRecentSales();
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to complete this sale"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Point of sale</h1>
          <p className="text-sm text-gray-400">Fast multi-step sales capture with optional IMEI verification</p>
        </div>
      </div>

      {serverError ? <div className="card p-4 text-sm text-danger">{serverError}</div> : null}

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="card space-y-3 p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Customer name</label>
                <input
                  {...register("customerName")}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                />
                {errors.customerName ? <p className="mt-1 text-xs text-danger">{errors.customerName.message}</p> : null}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Customer phone</label>
                <input
                  {...register("customerPhone")}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Payment method</label>
                <Controller
                  control={control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <Select value={field.value} onChange={field.onChange}>
                      <option value="cash">Cash</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="card">Card</option>
                    </Select>
                  )}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Invoice number</label>
                <input
                  {...register("invoiceNumber")}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
                <input
                  {...register("notes")}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                />
              </div>
            </div>
          </div>

          <PhoneEntryPanel
            existingImeis={cart.map((line) => line.imei)}
            onAddToCart={(lines) => setCart((prev) => [...prev, ...lines])}
          />
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold">Sale cart</h2>
          <div className="mt-4 space-y-3 text-sm text-gray-500">
            {cart.map((line) => (
              <div key={line.id} className="flex items-center justify-between">
                <div>
                  <p className="text-gray-800 dark:text-gray-200">{line.phone.name}</p>
                  <p className="text-xs text-gray-400">IMEI: {line.imei || "—"}</p>
                  <p className="text-xs text-gray-400">
                    Sold: TZS {currency(line.soldPrice)}
                    {line.discount ? ` · Discount: TZS ${currency(line.discount)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span>TZS {currency(netPrice(line))}</span>
                  <button
                    type="button"
                    onClick={() => setCart((prev) => prev.filter((l) => l.id !== line.id))}
                    className="rounded-full p-1 text-gray-400 hover:bg-danger/10 hover:text-danger"
                    aria-label="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {cart.length === 0 ? <p className="text-gray-400">No phones added yet</p> : null}
            <div className="flex items-center justify-between border-t border-gray-100 pt-3 font-semibold text-gray-800 dark:border-gray-800 dark:text-gray-100">
              <span>Total</span>
              <span>TZS {currency(total)}</span>
            </div>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <PlusCircle size={16} />
            {isSubmitting ? "Completing…" : "Complete sale"}
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {recentSales.map((sale) => {
              const saleTotal = sale.items.reduce((sum, item) => sum + (item.sellingPrice - item.discount), 0);
              return (
                <tr key={sale.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3">{sale.invoiceNumber}</td>
                  <td className="px-4 py-3">{sale.customerName}</td>
                  <td className="px-4 py-3">{new Date(sale.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 capitalize">{sale.paymentMethod.replace("_", " ")}</td>
                  <td className="px-4 py-3">TZS {currency(saleTotal)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setReceiptSale(sale)}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <ReceiptIcon size={14} />
                        View receipt
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => setEditingSale(sale)}
                          className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:underline dark:text-gray-400"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {recentSales.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  No sales recorded yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {receiptSale ? <SaleReceipt sale={receiptSale} onClose={() => setReceiptSale(null)} /> : null}
      {editingSale ? (
        <EditSaleModal sale={editingSale} onClose={() => setEditingSale(null)} onSaved={loadRecentSales} />
      ) : null}
    </div>
  );
}
