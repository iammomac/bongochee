import { useEffect, useState, type ReactNode } from "react";
import { Select } from "../../components/Select";
import { currency } from "../../lib/money";
import { DateRangeControls, type DateRange, type DatePreset } from "./DateRangeControls";
import { DetailTable, LOAN_DETAIL_COLUMNS, LOAN_SUMMARY_COLUMNS } from "./DetailTable";
import type { Category, DetailRow, LoanReportRow, LoanSalesReportResponse, PhoneModel, Supplier, User } from "../../types";

// The loan report keeps its own filters, separate from the other reports', so setting one up
// here never disturbs (or is disturbed by) what's chosen on the Sales or Stock tabs.
export interface LoanFilters {
  groupBy: string;
  business: string;
  status: string;
  category: string;
  model: string;
  supplier: string;
  user: string;
}

export const DEFAULT_LOAN_FILTERS: LoanFilters = {
  groupBy: "business",
  business: "",
  status: "",
  category: "",
  model: "",
  supplier: "",
  user: "",
};

export const EMPTY_LOAN_REPORT: LoanSalesReportResponse = {
  rows: [],
  totals: { loans: 0, units: 0, revenue: 0 },
  details: [],
  detailTotals: {},
};

// Loans get longer windows than the other reports: they're repaid slowly, so a month or a
// quarter is the usual view.
export const LOAN_DATE_PRESETS: DatePreset[] = ["today", "week", "month", "last30", "last90", "custom"];

const GROUP_OPTIONS = [
  { value: "business", label: "Business" },
  { value: "day", label: "Day (trend)" },
  { value: "user", label: "Salesperson" },
  { value: "status", label: "Payment status" },
  { value: "category", label: "Brand" },
  { value: "model", label: "Model" },
  { value: "supplier", label: "Supplier" },
];

const PRODUCT_GROUPS = ["category", "model", "supplier"];

interface LoanFilterBarProps {
  range: DateRange;
  filters: LoanFilters;
  onChange: (patch: Partial<LoanFilters>) => void;
  categories: Category[];
  models: PhoneModel[];
  suppliers: Supplier[];
  users: User[];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="w-44">
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

export function LoanFilterBar({ range, filters, onChange, categories, models, suppliers, users }: LoanFilterBarProps) {
  // Typing a business name shouldn't fire a request per keystroke.
  const [businessText, setBusinessText] = useState(filters.business);
  useEffect(() => {
    const id = setTimeout(() => {
      if (businessText.trim() !== filters.business) onChange({ business: businessText.trim() });
    }, 350);
    return () => clearTimeout(id);
  }, [businessText, filters.business, onChange]);

  return (
    <div className="card no-print flex flex-wrap items-end gap-3 p-4">
      <DateRangeControls range={range} presets={LOAN_DATE_PRESETS} />

      <Field label="Group by">
        <Select value={filters.groupBy} onChange={(v) => onChange({ groupBy: v })}>
          {GROUP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Business">
        <input
          value={businessText}
          onChange={(e) => setBusinessText(e.target.value)}
          placeholder="Name contains…"
          aria-label="Business"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
        />
      </Field>

      <Field label="Payment status">
        <Select value={filters.status} onChange={(v) => onChange({ status: v })}>
          <option value="">All</option>
          <option value="open">Open (nothing paid)</option>
          <option value="partial">Partially paid</option>
          <option value="paid">Paid off</option>
        </Select>
      </Field>

      <Field label="Category">
        <Select value={filters.category} onChange={(v) => onChange({ category: v })}>
          <option value="">All</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Model">
        <Select value={filters.model} onChange={(v) => onChange({ model: v })}>
          <option value="">All</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Supplier">
        <Select value={filters.supplier} onChange={(v) => onChange({ supplier: v })}>
          <option value="">All</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Salesperson">
        <Select value={filters.user} onChange={(v) => onChange({ user: v })}>
          <option value="">All</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName || u.username}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  Open: "bg-danger/10 text-danger",
  "Partially paid": "bg-warning/10 text-warning",
  "Paid off": "bg-success/10 text-success",
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 whitespace-nowrap text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

export function LoanReportView({
  report,
  groupBy,
  canViewProfit,
}: {
  report: LoanSalesReportResponse;
  groupBy: string;
  canViewProfit: boolean;
}) {
  const { totals } = report;
  const paymentsHidden = totals.paid === undefined || PRODUCT_GROUPS.includes(groupBy);
  const summaryTitle = GROUP_OPTIONS.find((opt) => opt.value === groupBy)?.label ?? "Summary";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Loans made" value={String(totals.loans)} hint={`${totals.units} ${totals.units === 1 ? "phone" : "phones"}`} />
        <Kpi label="Revenue" value={`TZS ${currency(totals.revenue)}`} />
        {canViewProfit && totals.expectedProfit !== undefined ? (
          <Kpi label="Expected profit" value={`TZS ${currency(totals.expectedProfit)}`} />
        ) : null}
        {totals.paid !== undefined ? <Kpi label="Paid so far" value={`TZS ${currency(totals.paid)}`} /> : null}
        {totals.outstanding !== undefined ? (
          <Kpi label="Still owed" value={`TZS ${currency(totals.outstanding)}`} />
        ) : null}
      </div>

      {paymentsHidden ? (
        <p className="no-print rounded-2xl bg-gray-50 px-4 py-2.5 text-xs text-gray-500 dark:bg-gray-950">
          Payment figures aren't broken down by product — a payment belongs to the whole loan, not to one phone. Group
          by business, day, salesperson or status to see what's paid and owed.
        </p>
      ) : null}

      <DetailTable
        title={`By ${summaryTitle.toLowerCase()}`}
        countNoun="group"
        rows={report.rows}
        columns={LOAN_SUMMARY_COLUMNS.map((c) => (c.key === "label" ? { ...c, label: summaryTitle } : c))}
        getKey={(row: LoanReportRow) => row.key}
        canViewProfit={canViewProfit}
        emptyMessage="No loan sales in this range"
      />

      <DetailTable
        title="Loan sales"
        countNoun="loan"
        rows={report.details}
        columns={LOAN_DETAIL_COLUMNS}
        getKey={(row: DetailRow) => row.key}
        totals={report.detailTotals}
        canViewProfit={canViewProfit}
        emptyMessage="No loan sales in this range"
        renderCell={(column, row) =>
          column.key === "status" ? (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[String(row.status)] ?? "bg-gray-100 text-gray-500"}`}
            >
              {String(row.status)}
            </span>
          ) : undefined
        }
      />
    </div>
  );
}
