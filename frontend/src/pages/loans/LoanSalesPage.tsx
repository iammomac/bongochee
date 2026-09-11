import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Banknote, HandCoins, Pencil, PlusCircle, Trash2, X } from "lucide-react";
import { PhoneEntryPanel, netPrice, type CartLine } from "../../components/PhoneEntryPanel";
import { Select } from "../../components/Select";
import {
  addLoanPayment,
  createLoanSale,
  deleteLoanSale,
  listLoanSales,
  removeLoanPayment,
  updateLoanSale,
} from "../../services/loans";
import { extractErrorMessage } from "../../lib/errors";
import { currency } from "../../lib/money";
import { usePermissions } from "../../hooks/usePermissions";
import type { LoanSale, LoanStatus, PaymentMethod } from "../../types";

const headerSchema = z.object({
  businessName: z.string().min(1, "Required"),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
  invoiceNumber: z.string().min(1, "Required"),
});
type HeaderValues = z.infer<typeof headerSchema>;

function generateInvoiceNumber() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `LOAN-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function defaultHeaderValues(): HeaderValues {
  return { businessName: "", contactPerson: "", contactPhone: "", notes: "", invoiceNumber: generateInvoiceNumber() };
}

function statusBadge(status: LoanStatus) {
  if (status === "paid") return { label: "Paid off", className: "bg-success/10 text-success" };
  if (status === "partial") return { label: "Partially paid", className: "bg-warning/10 text-warning" };
  return { label: "Open", className: "bg-danger/10 text-danger" };
}

const todayISO = () => new Date().toISOString().slice(0, 10);

interface LoanDetailModalProps {
  loan: LoanSale;
  onClose: () => void;
  onChanged: (updated: LoanSale) => void;
  canEdit: boolean;
  canDelete: boolean;
  canRecordPayment: boolean;
  onDeleted: () => void;
}

function LoanDetailModal({ loan, onClose, onChanged, canEdit, canDelete, canRecordPayment, onDeleted }: LoanDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [businessName, setBusinessName] = useState(loan.businessName);
  const [contactPerson, setContactPerson] = useState(loan.contactPerson);
  const [contactPhone, setContactPhone] = useState(loan.contactPhone);
  const [notes, setNotes] = useState(loan.notes);
  const [items, setItems] = useState(loan.items.map((item) => ({ ...item })));
  const [savingHeader, setSavingHeader] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentNotes, setPaymentNotes] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingPaymentId, setRemovingPaymentId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const hasPayments = loan.payments.length > 0;
  const itemsLocked = hasPayments; // matches the backend guard -- can't reprice once money's been paid against the old total

  const handleSaveHeader = async () => {
    setServerError(null);
    setSavingHeader(true);
    try {
      const updated = await updateLoanSale(loan.id, {
        businessName,
        contactPerson,
        contactPhone,
        notes,
        ...(itemsLocked
          ? {}
          : { items: items.map((item) => ({ id: item.id, sellingPrice: item.sellingPrice, discount: item.discount })) }),
      });
      onChanged(updated);
      setEditing(false);
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to save these changes"));
    } finally {
      setSavingHeader(false);
    }
  };

  const handleRecordPayment = async () => {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      setServerError("Enter a payment amount greater than zero");
      return;
    }
    setServerError(null);
    setRecordingPayment(true);
    try {
      const updated = await addLoanPayment(loan.id, {
        amount,
        paymentMethod,
        paidDate: paymentDate,
        notes: paymentNotes,
      });
      onChanged(updated);
      setPaymentAmount("");
      setPaymentNotes("");
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to record this payment"));
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleRemovePayment = async (paymentId: string) => {
    setServerError(null);
    setRemovingPaymentId(paymentId);
    try {
      const updated = await removeLoanPayment(loan.id, paymentId);
      onChanged(updated);
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to remove this payment"));
    } finally {
      setRemovingPaymentId(null);
    }
  };

  const handleDelete = async () => {
    setServerError(null);
    setDeleting(true);
    try {
      await deleteLoanSale(loan.id);
      onDeleted();
      onClose();
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to delete this loan sale"));
    } finally {
      setDeleting(false);
    }
  };

  const status = statusBadge(loan.loanStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Loan sale — {loan.invoiceNumber}</h2>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
          </div>
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

        <div className="mb-4 grid grid-cols-3 gap-3 rounded-2xl bg-background p-3 text-center dark:bg-gray-950">
          <div>
            <p className="text-xs text-gray-400">Total owed</p>
            <p className="font-semibold">TZS {currency(loan.totalOwed)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Paid so far</p>
            <p className="font-semibold text-success">TZS {currency(loan.totalPaid)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Balance</p>
            <p className="font-semibold text-danger">TZS {currency(loan.balance)}</p>
          </div>
        </div>

        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500">Business</h3>
            {canEdit && !editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Pencil size={12} />
                Edit
              </button>
            ) : null}
          </div>
          {editing ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Business name</label>
                  <input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Contact person</label>
                  <input
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Contact phone</label>
                  <input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500">
                  {itemsLocked
                    ? "Item prices are locked -- a payment has already been recorded against this loan."
                    : "Items — price and discount only"}
                </p>
                {items.map((item, index) => (
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
                          disabled={itemsLocked}
                          onChange={(e) => {
                            const next = [...items];
                            next[index] = { ...item, sellingPrice: Number(e.target.value) };
                            setItems(next);
                          }}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">Discount</label>
                        <input
                          type="number"
                          value={item.discount}
                          disabled={itemsLocked}
                          onChange={(e) => {
                            const next = [...items];
                            next[index] = { ...item, discount: Number(e.target.value) };
                            setItems(next);
                          }}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 dark:border-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveHeader()}
                  disabled={savingHeader}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {savingHeader ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm">
              <p className="font-medium">{loan.businessName}</p>
              <p className="text-gray-400">
                {loan.contactPerson || "—"} {loan.contactPhone ? `· ${loan.contactPhone}` : ""}
              </p>
              {loan.notes ? <p className="mt-1 text-xs text-gray-400">{loan.notes}</p> : null}
              <div className="mt-3 space-y-1">
                {loan.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {item.categoryName} {item.modelName} · IMEI: {item.imei || "—"}
                    </span>
                    <span>TZS {currency(item.sellingPrice - item.discount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mb-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-500">Payment history</h3>
          {loan.payments.length === 0 ? (
            <p className="text-xs text-gray-400">No payments recorded yet</p>
          ) : (
            <div className="space-y-1">
              {loan.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-xl bg-background px-3 py-2 text-xs dark:bg-gray-950"
                >
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-200">TZS {currency(payment.amount)}</span>{" "}
                    <span className="text-gray-400">
                      · {payment.paymentMethod.replace("_", " ")} · {payment.paidDate} · {payment.recordedByName}
                    </span>
                    {payment.notes ? <p className="text-gray-400">{payment.notes}</p> : null}
                  </div>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => void handleRemovePayment(payment.id)}
                      disabled={removingPaymentId === payment.id}
                      className="text-gray-400 hover:text-danger disabled:opacity-50"
                      aria-label="Remove payment"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {canRecordPayment && loan.loanStatus !== "paid" ? (
          <div className="mb-4 space-y-3 rounded-2xl border border-gray-100 p-3 dark:border-gray-800">
            <h3 className="flex items-center gap-1 text-sm font-semibold text-gray-500">
              <Banknote size={14} />
              Record a payment
            </h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Amount</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Method</label>
                <Select value={paymentMethod} onChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="card">Card</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                />
              </div>
            </div>
            <input
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
            />
            <button
              type="button"
              onClick={() => void handleRecordPayment()}
              disabled={recordingPayment}
              className="w-full rounded-xl bg-primary py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {recordingPayment ? "Recording…" : "Record payment"}
            </button>
          </div>
        ) : null}

        {canDelete ? (
          <div className="flex justify-end border-t border-gray-100 pt-3 dark:border-gray-800">
            {hasPayments ? (
              <p className="text-xs text-gray-400">
                Can't delete — payments have already been recorded against this loan.
              </p>
            ) : confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Delete this loan sale?</span>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs font-medium text-gray-400 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-danger dark:text-gray-400"
              >
                <Trash2 size={14} />
                Delete loan sale
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function LoanSalesPage() {
  const { has } = usePermissions();
  const canCreate = has("create_loan_sales");
  const canEdit = has("edit_loan_sales");
  const canDelete = has("delete_loan_sales");
  const canRecordPayment = has("record_loan_payments");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loans, setLoans] = useState<LoanSale[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<LoanSale | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HeaderValues>({
    resolver: zodResolver(headerSchema),
    defaultValues: defaultHeaderValues(),
  });

  const loadLoans = () => {
    listLoanSales()
      .then(setLoans)
      .catch(() => setServerError("Unable to load loan sales"));
  };

  useEffect(() => {
    loadLoans();
  }, []);

  const total = cart.reduce((sum, line) => sum + netPrice(line), 0);

  const onSubmit = async (values: HeaderValues) => {
    setServerError(null);
    if (cart.length === 0) {
      setServerError("Add at least one phone to the loan sale");
      return;
    }
    try {
      await createLoanSale({
        invoiceNumber: values.invoiceNumber,
        businessName: values.businessName,
        contactPerson: values.contactPerson,
        contactPhone: values.contactPhone,
        notes: values.notes,
        items: cart.map((line) => ({
          stockItem: line.phone.id,
          imei: line.imei,
          sellingPrice: line.soldPrice,
          discount: line.discount,
        })),
      });
      setCart([]);
      reset(defaultHeaderValues());
      loadLoans();
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to complete this loan sale"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <HandCoins size={22} />
            Loan sales
          </h1>
          <p className="text-sm text-gray-400">
            Wholesale to other businesses, paid off over time — track what's owed, what's paid, and by whom
          </p>
        </div>
      </div>

      {serverError ? <div className="card p-4 text-sm text-danger">{serverError}</div> : null}

      {canCreate ? (
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="card space-y-3 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Business name</label>
                  <input
                    {...register("businessName")}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                  />
                  {errors.businessName ? <p className="mt-1 text-xs text-danger">{errors.businessName.message}</p> : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Contact person</label>
                  <input
                    {...register("contactPerson")}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Contact phone</label>
                  <input
                    {...register("contactPhone")}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
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
            <h2 className="text-lg font-semibold">Loan cart</h2>
            <div className="mt-4 space-y-3 text-sm text-gray-500">
              {cart.map((line) => (
                <div key={line.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-800 dark:text-gray-200">{line.phone.name}</p>
                    <p className="text-xs text-gray-400">IMEI: {line.imei || "—"}</p>
                    <p className="text-xs text-gray-400">
                      Price: TZS {currency(line.soldPrice)}
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
                <span>Total owed</span>
                <span>TZS {currency(total)}</span>
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <PlusCircle size={16} />
              {isSubmitting ? "Completing…" : "Complete loan sale"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Owed</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loans.map((loan) => {
              const status = statusBadge(loan.loanStatus);
              return (
                <tr key={loan.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3">{loan.businessName}</td>
                  <td className="px-4 py-3">{loan.invoiceNumber}</td>
                  <td className="px-4 py-3">TZS {currency(loan.totalOwed)}</td>
                  <td className="px-4 py-3">TZS {currency(loan.totalPaid)}</td>
                  <td className="px-4 py-3">TZS {currency(loan.balance)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedLoan(loan)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              );
            })}
            {loans.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  No loan sales recorded yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedLoan ? (
        <LoanDetailModal
          loan={selectedLoan}
          onClose={() => setSelectedLoan(null)}
          onChanged={(updated) => {
            setSelectedLoan(updated);
            setLoans((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
          }}
          onDeleted={loadLoans}
          canEdit={canEdit}
          canDelete={canDelete}
          canRecordPayment={canRecordPayment}
        />
      ) : null}
    </div>
  );
}
