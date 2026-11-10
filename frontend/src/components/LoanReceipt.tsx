import { useState, type ReactNode } from "react";
import { Check, Copy, MessageCircle, Printer, X } from "lucide-react";
import type { LoanSale } from "../types";
import { buildLoanReceiptMessage, openWhatsAppLoanReceipt } from "../lib/whatsapp";
import logo from "../assets/logo-trimmed.png";

const currency = (value: number) => new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);

const STATUS_LABEL = { paid: "Paid in full", partial: "Partially paid", open: "Not yet paid" } as const;

interface Props {
  loan: LoanSale;
  onClose: () => void;
}

/** A customer-facing loan statement: phones taken, every payment so far, and the balance still owed. */
export function LoanReceipt({ loan, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(buildLoanReceiptMessage(loan));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (e.g. non-HTTPS); WhatsApp and Print still work.
    }
  };

  const buttonClass = "flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="no-print absolute inset-0" onClick={onClose} />
      <div className="receipt relative flex max-h-full w-full max-w-md flex-col rounded-2xl bg-white text-gray-900 shadow-2xl dark:bg-gray-900 dark:text-gray-100">
        <div className="no-print flex shrink-0 flex-wrap items-center justify-end gap-2 px-6 pb-3 pt-4">
          <button type="button" onClick={() => openWhatsAppLoanReceipt(loan)} className={`${buttonClass} bg-success text-white`}>
            <MessageCircle size={14} />
            Send via WhatsApp
          </button>
          <button
            type="button"
            onClick={() => void copyText()}
            className={`${buttonClass} border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy text"}
          </button>
          <button type="button" onClick={() => window.print()} className={`${buttonClass} bg-primary text-white`}>
            <Printer size={14} />
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close receipt"
          >
            <X size={16} />
          </button>
        </div>

        <div className="receipt-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <div className="text-center">
            <img src={logo} alt="Bongo Chee" className="mx-auto h-12 w-auto" />
            <p className="text-xs text-gray-400">Loan statement</p>
          </div>

          <div className="mt-4 space-y-1 text-sm">
            <Row label="Invoice" value={<span className="font-medium">{loan.invoiceNumber}</span>} />
            <Row label="Date issued" value={new Date(loan.createdAt).toLocaleDateString()} />
            <Row label="Business" value={loan.businessName} />
            {loan.contactPerson ? <Row label="Contact" value={loan.contactPerson} /> : null}
            {loan.contactPhone ? <Row label="Phone" value={loan.contactPhone} /> : null}
            <Row label="Status" value={<span className="font-medium">{STATUS_LABEL[loan.loanStatus]}</span>} />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Phones</p>
          <div className="mt-1 divide-y divide-dashed divide-gray-200 border-y border-dashed border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {loan.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">
                    {item.categoryName} {item.modelName}
                  </p>
                  {item.imei ? <p className="text-xs text-gray-400">IMEI: {item.imei}</p> : null}
                  {item.discount ? (
                    <p className="text-xs text-gray-400">
                      Price: TZS {currency(item.sellingPrice)} · Discount: TZS {currency(item.discount)}
                    </p>
                  ) : null}
                </div>
                <span>TZS {currency(item.sellingPrice - item.discount)}</span>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Payments received</p>
          <div className="mt-1 divide-y divide-dashed divide-gray-200 border-y border-dashed border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {loan.payments.length === 0 ? (
              <p className="py-2 text-sm text-gray-400">No payments yet</p>
            ) : (
              loan.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {payment.paidDate} <span className="text-xs capitalize text-gray-400">· {payment.paymentMethod.replace("_", " ")}</span>
                  </span>
                  <span>TZS {currency(payment.amount)}</span>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 space-y-1 text-sm">
            <Row label="Total owed" value={`TZS ${currency(loan.totalOwed)}`} />
            <Row label="Paid so far" value={`TZS ${currency(loan.totalPaid)}`} />
            <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-semibold dark:border-gray-800">
              <span>Balance due</span>
              <span>TZS {currency(loan.balance)}</span>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">Thank you for doing business with BONGO CHEE</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
