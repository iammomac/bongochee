import type { Sale } from "../types";

const currency = (value: number) => new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);

// wa.me needs the full international number, digits only, no leading 0/+.
// Local Tanzanian numbers are usually entered as 0XXXXXXXXX — swap the leading 0
// for the country code; anything already in international form passes through.
export function toWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `255${digits.slice(1)}`;
  return digits;
}

export function saleTotal(sale: Sale) {
  return sale.items.reduce((sum, item) => sum + (item.sellingPrice - item.discount), 0);
}

export function buildReceiptMessage(sale: Sale, total: number) {
  const lines = [
    "BONGO CHEE — Receipt",
    `Invoice: ${sale.invoiceNumber}`,
    `Date: ${new Date(sale.createdAt).toLocaleString()}`,
    "",
    ...sale.items.map((item) => {
      const net = item.sellingPrice - item.discount;
      const discountNote = item.discount ? ` (discount TZS ${currency(item.discount)})` : "";
      return `${item.categoryName} ${item.modelName} — TZS ${currency(net)}${discountNote}`;
    }),
    "",
    `Total: TZS ${currency(total)}`,
    "",
    "Thank you for shopping with BONGO CHEE",
  ];
  return lines.join("\n");
}

// Opens a wa.me deep link with the receipt pre-filled in the message box — this is
// NOT a silent send. WhatsApp itself always requires a human to press Send once it
// opens; there's no way around that from here. Browsers also tend to block a
// window.open() that isn't a direct result of a user gesture, so call this as early
// as possible in the same click handler that triggered the sale (see SalesPage's
// onSubmit) rather than later (e.g. on the receipt mounting) — the further removed
// from the original click, the more likely it silently fails.
export function openWhatsAppReceipt(sale: Sale) {
  if (!sale.customerPhone) return;
  const number = toWhatsAppNumber(sale.customerPhone);
  const text = encodeURIComponent(buildReceiptMessage(sale, saleTotal(sale)));
  window.open(`https://wa.me/${number}?text=${text}`, "_blank", "noopener,noreferrer");
}
