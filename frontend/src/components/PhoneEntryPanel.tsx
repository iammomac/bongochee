import { useState } from "react";
import { SearchCreateCombobox } from "./SearchCreateCombobox";
import { searchAvailableStock } from "../services/sales";
import { currency } from "../lib/money";
import type { AvailablePhone } from "../types";

const IMEI_PATTERN = /^\d{15}$/;

export interface CartLine {
  id: string;
  phone: AvailablePhone;
  imei: string;
  soldPrice: number;
  discount: number;
}

export const netPrice = (line: Pick<CartLine, "soldPrice" | "discount">) => line.soldPrice - line.discount;

interface PhoneEntryPanelProps {
  existingImeis: string[];
  onAddToCart: (lines: CartLine[]) => void;
}

// Shared by the Sales and Loan Sales pages -- picking a phone, bargaining the
// price, and entering per-unit IMEIs works identically for both; only what
// happens to the resulting cart (paid in full vs. owed on credit) differs.
export function PhoneEntryPanel({ existingImeis, onAddToCart }: PhoneEntryPanelProps) {
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
