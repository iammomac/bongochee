import { MessageCircle, Printer, X } from "lucide-react";
import type { Sale } from "../types";
import logo from "../assets/logo-trimmed.png";

const currency = (value: number) => new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);

// wa.me needs the full international number, digits only, no leading 0/+.
// Local Tanzanian numbers are usually entered as 0XXXXXXXXX — swap the leading 0
// for the country code; anything already in international form passes through.
function toWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `255${digits.slice(1)}`;
  return digits;
}

function buildReceiptMessage(sale: Sale, total: number) {
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

interface Props {
  sale: Sale;
  onClose: () => void;
}

export function SaleReceipt({ sale, onClose }: Props) {
  const total = sale.items.reduce((sum, item) => sum + (item.sellingPrice - item.discount), 0);

  const sendViaWhatsApp = () => {
    if (!sale.customerPhone) return;
    const number = toWhatsAppNumber(sale.customerPhone);
    const text = encodeURIComponent(buildReceiptMessage(sale, total));
    window.open(`https://wa.me/${number}?text=${text}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="no-print absolute inset-0" onClick={onClose} />
      <div className="receipt relative w-full max-w-md rounded-2xl bg-white p-6 text-gray-900 shadow-2xl dark:bg-gray-900 dark:text-gray-100">
        <div className="no-print mb-4 flex items-center justify-end gap-2">
          {sale.customerPhone ? (
            <button
              type="button"
              onClick={sendViaWhatsApp}
              className="flex items-center gap-2 rounded-xl bg-success px-3 py-1.5 text-sm font-medium text-white"
            >
              <MessageCircle size={14} />
              Send via WhatsApp
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-white"
          >
            <Printer size={14} />
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-center">
          <img src={logo} alt="Bongo Chee" className="mx-auto h-12 w-auto" />
          <p className="text-xs text-gray-400">Mobile phone sales &amp; service</p>
        </div>

        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Invoice</span>
            <span className="font-medium">{sale.invoiceNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Date</span>
            <span>{new Date(sale.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Customer</span>
            <span>{sale.customerName}</span>
          </div>
          {sale.customerPhone ? (
            <div className="flex justify-between">
              <span className="text-gray-400">Phone</span>
              <span>{sale.customerPhone}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-gray-400">Sold by</span>
            <span>{sale.soldByName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Payment</span>
            <span className="capitalize">{sale.paymentMethod.replace("_", " ")}</span>
          </div>
        </div>

        <div className="mt-4 divide-y divide-dashed divide-gray-200 border-y border-dashed border-gray-200 py-2 dark:divide-gray-700 dark:border-gray-700">
          {sale.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium">
                  {item.categoryName} {item.modelName}
                </p>
                {item.imei ? <p className="text-xs text-gray-400">IMEI: {item.imei}</p> : null}
                {item.discount ? (
                  <p className="text-xs text-gray-400">
                    Sold: TZS {currency(item.sellingPrice)} · Discount: TZS {currency(item.discount)}
                  </p>
                ) : null}
              </div>
              <span>TZS {currency(item.sellingPrice - item.discount)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-semibold dark:border-gray-800">
            <span>Total</span>
            <span>TZS {currency(total)}</span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">Thank you for shopping with BONGO CHEE</p>
      </div>
    </div>
  );
}
