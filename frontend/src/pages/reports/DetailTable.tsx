import type { ReactNode } from "react";
import { currency } from "../../lib/money";

type DetailKind = "text" | "date" | "money" | "number" | "note";

export interface DetailColumn {
  key: string;
  label: string;
  kind?: DetailKind;
  // Hidden without view_profit -- the backend already strips these fields, this just
  // keeps an empty column from being drawn.
  profit?: boolean;
}

// Shared shape of the money-and-people columns every sales-derived report carries,
// so the same fields read the same way whichever report you're on.
const SALE_TAIL: DetailColumn[] = [
  { key: "units", label: "Units", kind: "number" },
  { key: "priceSold", label: "Price sold", kind: "money" },
];

export const SALES_DETAIL_COLUMNS: DetailColumn[] = [
  { key: "date", label: "Date", kind: "date" },
  { key: "time", label: "Time" },
  { key: "invoiceNumber", label: "Invoice" },
  { key: "soldByName", label: "Salesperson" },
  { key: "customerName", label: "Customer" },
  { key: "categoryName", label: "Category" },
  { key: "modelName", label: "Model" },
  { key: "supplierName", label: "Supplier" },
  ...SALE_TAIL,
  { key: "discount", label: "Discount", kind: "money" },
  { key: "revenue", label: "Revenue", kind: "money" },
  { key: "profit", label: "Profit", kind: "money", profit: true },
  { key: "condition", label: "Condition", kind: "note" },
  { key: "saleNotes", label: "Sale notes", kind: "note" },
];

export const RETURNS_DETAIL_COLUMNS: DetailColumn[] = [
  { key: "date", label: "Return date", kind: "date" },
  { key: "time", label: "Time" },
  { key: "invoiceNumber", label: "Invoice" },
  { key: "processedByName", label: "Processed by" },
  { key: "customerName", label: "Customer" },
  { key: "categoryName", label: "Category" },
  { key: "modelName", label: "Model" },
  { key: "supplierName", label: "Supplier" },
  ...SALE_TAIL,
  { key: "revenue", label: "Revenue", kind: "money" },
  { key: "profit", label: "Profit", kind: "money", profit: true },
  { key: "condition", label: "Condition", kind: "note" },
  { key: "issue", label: "Issue" },
  { key: "status", label: "Status" },
  { key: "description", label: "Description", kind: "note" },
];

export const STOCK_DETAIL_COLUMNS: DetailColumn[] = [
  { key: "date", label: "Date added", kind: "date" },
  { key: "time", label: "Time" },
  { key: "addedByName", label: "Added by" },
  { key: "supplierName", label: "Supplier" },
  { key: "categoryName", label: "Category" },
  { key: "modelName", label: "Model" },
  { key: "quantity", label: "Qty imported", kind: "number" },
  { key: "quantityRemaining", label: "Qty remaining", kind: "number" },
  { key: "unitsSold", label: "Units sold", kind: "number" },
  { key: "buyingPrice", label: "Buying price", kind: "money", profit: true },
  { key: "stockValue", label: "Stock value", kind: "money", profit: true },
  { key: "revenue", label: "Revenue", kind: "money" },
  { key: "profit", label: "Profit", kind: "money", profit: true },
  { key: "condition", label: "Condition", kind: "note" },
];

export const LOSS_DETAIL_COLUMNS: DetailColumn[] = [
  { key: "date", label: "Date", kind: "date" },
  { key: "time", label: "Time" },
  { key: "invoiceNumber", label: "Invoice" },
  { key: "soldByName", label: "Salesperson" },
  { key: "customerName", label: "Customer" },
  { key: "categoryName", label: "Category" },
  { key: "modelName", label: "Model" },
  { key: "supplierName", label: "Supplier" },
  { key: "imei", label: "IMEI" },
  ...SALE_TAIL,
  { key: "discount", label: "Discount", kind: "money" },
  { key: "netPrice", label: "Revenue", kind: "money" },
  { key: "buyingPrice", label: "Buying price", kind: "money" },
  { key: "minSellingPrice", label: "Min price", kind: "money" },
  { key: "profit", label: "Profit", kind: "money" },
  { key: "lossTypeDisplay", label: "Loss type" },
  { key: "condition", label: "Condition", kind: "note" },
  { key: "saleNotes", label: "Sale notes", kind: "note" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-09-19" -> "19 Sep 2026". Built from the parts rather than new Date(iso) so a
// browser west of UTC can't shift a plain calendar date back a day, and from a fixed
// month list rather than Intl so every browser's locale data renders the same text.
function formatDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

function formatCell(kind: DetailKind, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "money") return currency(Number(value));
  if (kind === "date") return formatDate(String(value));
  return String(value);
}

interface DetailTableProps<Row extends object> {
  title?: string;
  rows: Row[];
  columns: DetailColumn[];
  getKey: (row: Row) => string;
  totals?: Record<string, number>;
  canViewProfit: boolean;
  emptyMessage: string;
  // Lets a report swap in richer markup for one cell (e.g. the loss-type badge).
  renderCell?: (column: DetailColumn, row: Row) => ReactNode | undefined;
}

export function DetailTable<Row extends object>({
  title = "Detailed transactions",
  rows,
  columns,
  getKey,
  totals,
  canViewProfit,
  emptyMessage,
  renderCell,
}: DetailTableProps<Row>) {
  const visibleColumns = columns.filter((column) => canViewProfit || !column.profit);
  const showTotals = totals && rows.length > 0 && visibleColumns.some((column) => totals[column.key] !== undefined);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-baseline justify-between px-4 py-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-gray-400">
          {rows.length} {rows.length === 1 ? "line" : "lines"} · amounts in TZS
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.key} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getKey(row)} className="border-t border-gray-100 align-top dark:border-gray-800">
                {visibleColumns.map((column) => {
                  const custom = renderCell?.(column, row);
                  const kind = column.kind ?? "text";
                  const value = (row as Record<string, unknown>)[column.key];
                  return (
                    <td
                      key={column.key}
                      className={`px-3 py-2 ${
                        kind === "note" ? "min-w-[10rem] max-w-[16rem] whitespace-normal text-gray-500" : "whitespace-nowrap"
                      }`}
                    >
                      {custom ?? formatCell(kind, value)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-sm text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
          {showTotals ? (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold dark:border-gray-700 dark:bg-gray-950">
                {visibleColumns.map((column, index) => {
                  const total = totals?.[column.key];
                  return (
                    <td key={column.key} className="whitespace-nowrap px-3 py-2.5">
                      {index === 0
                        ? "Total"
                        : total === undefined
                          ? ""
                          : column.kind === "money"
                            ? currency(total)
                            : total}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
