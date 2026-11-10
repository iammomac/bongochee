import type { LoanSale, Sale } from "../types";

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
//
// Without a customer phone, wa.me opens WhatsApp's contact picker instead, so the
// receipt can still be sent to whoever it's for.
export function openWhatsAppReceipt(sale: Sale) {
  const number = sale.customerPhone ? toWhatsAppNumber(sale.customerPhone) : "";
  const text = encodeURIComponent(buildReceiptMessage(sale, saleTotal(sale)));
  window.open(`https://wa.me/${number}?text=${text}`, "_blank", "noopener,noreferrer");
}

const paymentMethodLabel = (method: string) => method.replace("_", " ");

// The statement a loan customer gets: what they took, every payment so far, and what's left.
export function buildLoanReceiptMessage(loan: LoanSale) {
  const statusLine =
    loan.loanStatus === "paid" ? "Status: PAID IN FULL" : loan.loanStatus === "partial" ? "Status: Partially paid" : "Status: Not yet paid";
  const lines = [
    "BONGO CHEE — Loan statement",
    `Invoice: ${loan.invoiceNumber}`,
    `Business: ${loan.businessName}`,
    `Date issued: ${new Date(loan.createdAt).toLocaleDateString()}`,
    "",
    "Phones:",
    ...loan.items.map((item) => {
      const net = item.sellingPrice - item.discount;
      const imei = item.imei ? ` (IMEI ${item.imei})` : "";
      return `- ${item.categoryName} ${item.modelName}${imei} — TZS ${currency(net)}`;
    }),
    "",
    loan.payments.length ? "Payments received:" : "Payments received: none yet",
    ...loan.payments.map(
      (p) => `- ${p.paidDate} — TZS ${currency(p.amount)} (${paymentMethodLabel(p.paymentMethod)})`,
    ),
    "",
    `Total owed: TZS ${currency(loan.totalOwed)}`,
    `Paid so far: TZS ${currency(loan.totalPaid)}`,
    `BALANCE DUE: TZS ${currency(loan.balance)}`,
    statusLine,
    "",
    "Thank you for doing business with BONGO CHEE",
  ];
  return lines.join("\n");
}

// Same deep-link behaviour as openWhatsAppReceipt: WhatsApp opens with the text ready,
// and a person still presses Send. Without a contact phone it opens WhatsApp's
// contact picker so the statement can still be forwarded to whoever needs it.
export function openWhatsAppLoanReceipt(loan: LoanSale) {
  const text = encodeURIComponent(buildLoanReceiptMessage(loan));
  const number = loan.contactPhone ? toWhatsAppNumber(loan.contactPhone) : "";
  window.open(`https://wa.me/${number}?text=${text}`, "_blank", "noopener,noreferrer");
}
