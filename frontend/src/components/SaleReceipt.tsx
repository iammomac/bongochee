import { MessageCircle, Pencil, Printer, X } from "lucide-react";
import type { Sale } from "../types";
import { openWhatsAppReceipt, saleTotal } from "../lib/whatsapp";
import logo from "../assets/logo-trimmed.png";

const currency = (value: number) => new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);

interface Props {
  sale: Sale;
  onClose: () => void;
  // Shown as an "Edit sale" button when given (only to people who may edit sales).
  onEdit?: () => void;
}

export function SaleReceipt({ sale, onClose, onEdit }: Props) {
  const total = saleTotal(sale);

  // The real send already fires automatically right after the sale completes (see
  // SalesPage's onSubmit) — this button is the fallback for when that got silently
  // blocked as a popup, or the WhatsApp tab/window was closed by mistake.
  const sendViaWhatsApp = () => openWhatsAppReceipt(sale);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="no-print absolute inset-0" onClick={onClose} />
      {/* Capped at the window's height: the buttons stay put and the receipt itself scrolls, so
          a sale with many phones can be read to the end. (Printing lifts the cap -- index.css.) */}
      <div className="receipt relative flex max-h-full w-full max-w-md flex-col rounded-2xl bg-white text-gray-900 shadow-2xl dark:bg-gray-900 dark:text-gray-100">
        <div className="no-print flex shrink-0 flex-wrap items-center justify-end gap-2 px-6 pb-3 pt-4">
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Pencil size={14} />
              Edit sale
            </button>
          ) : null}
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

        <div className="receipt-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-6">
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
    </div>
  );
}
