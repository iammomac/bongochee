import { useEffect, useMemo, useState } from "react";
import { Database, Download, FileText, Printer } from "lucide-react";
import { Select } from "../../components/Select";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  downloadFullBackup,
  downloadReportExport,
  getLossReport,
  getReturnsSummary,
  getSalesSummary,
  getStockSummary,
  getSupplierSummary,
  type ExportableReport,
  type ReportFilters,
} from "../../services/reports";
import { listAllModels, searchCategories } from "../../services/catalog";
import { searchSuppliers } from "../../services/suppliers";
import { listUsers } from "../../services/users";
import { usePermissions } from "../../hooks/usePermissions";
import { PersonReportPanel } from "./PersonReportPanel";
import type {
  Category,
  LossReportRow,
  PhoneModel,
  ReturnsSummaryRow,
  SalesSummaryResponse,
  StockSummaryRow,
  Supplier,
  SupplierSummaryRow,
  User,
} from "../../types";

const currency = (value: number) => new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);
const compactCurrency = (value: number) =>
  new Intl.NumberFormat("en-TZ", { notation: "compact", maximumFractionDigits: 1 }).format(value);

type ReportKind = ExportableReport | "person";
type DatePreset = "today" | "week" | "month" | "custom";

const REPORT_TABS: { key: ReportKind; label: string }[] = [
  { key: "sales", label: "Sales & Profit" },
  { key: "stock", label: "Stock" },
  { key: "supplier", label: "Supplier" },
  { key: "returns", label: "Returns" },
  { key: "loss", label: "Loss" },
  { key: "person", label: "Person" },
];

const SALES_GROUP_OPTIONS = [
  { value: "day", label: "Day (trend)" },
  { value: "category", label: "Brand" },
  { value: "model", label: "Model" },
  { value: "user", label: "Salesperson" },
  { value: "payment_method", label: "Payment method" },
  { value: "supplier", label: "Supplier" },
];
const STOCK_GROUP_OPTIONS = [
  { value: "category", label: "Brand" },
  { value: "model", label: "Model" },
  { value: "supplier", label: "Supplier" },
];
const RETURNS_GROUP_OPTIONS = [
  { value: "category", label: "Return category" },
  { value: "model", label: "Model" },
];

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset: DatePreset) {
  const today = new Date();
  if (preset === "week") {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return { from: toIso(start), to: toIso(today) };
  }
  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toIso(start), to: toIso(today) };
  }
  return { from: toIso(today), to: toIso(today) };
}

interface TooltipEntry {
  dataKey: string;
  name: string;
  value: number;
  color: string;
}

function CurrencyTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm shadow-lg dark:border-gray-800 dark:bg-gray-900">
      <p className="mb-2 text-xs font-medium text-gray-400">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="font-semibold text-gray-900 dark:text-gray-100">TZS {currency(entry.value)}</span>
            <span className="text-gray-400">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CountTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm shadow-lg dark:border-gray-800 dark:bg-gray-900">
      <p className="mb-2 text-xs font-medium text-gray-400">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-semibold text-gray-900 dark:text-gray-100">{entry.value}</span>
          <span className="text-gray-400">{entry.name}</span>
        </div>
      ))}
    </div>
  );
}

function SalesReportView({
  data,
  groupBy,
  canViewProfit,
}: {
  data: SalesSummaryResponse;
  groupBy: string;
  canViewProfit: boolean;
}) {
  const isTrend = groupBy === "day";
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-gray-400">Units sold</p>
          <p className="mt-2 text-2xl font-semibold">{data.totals.units}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-400">Revenue</p>
          <p className="mt-2 text-2xl font-semibold">TZS {currency(data.totals.revenue)}</p>
        </div>
        {canViewProfit && data.totals.profit !== undefined ? (
          <div className="card p-5">
            <p className="text-sm text-gray-400">Profit</p>
            <p className="mt-2 text-2xl font-semibold">TZS {currency(data.totals.profit)}</p>
          </div>
        ) : null}
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">{isTrend ? "Sales & profit trend" : "Breakdown"}</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            {isTrend ? (
              <AreaChart data={data.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tickFormatter={(v: number) => compactCurrency(v)}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={<CurrencyTooltip />} cursor={{ stroke: "#c3c2b7", strokeWidth: 1 }} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={24}
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12, color: "#6b7280" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#25B1FF"
                  strokeWidth={2}
                  fill="#25B1FF"
                  fillOpacity={0.1}
                />
                {canViewProfit ? (
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Profit"
                    stroke="#22C55E"
                    strokeWidth={2}
                    fill="#22C55E"
                    fillOpacity={0.1}
                  />
                ) : null}
              </AreaChart>
            ) : (
              <BarChart data={data.rows.slice(0, 10)} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tickFormatter={(v: number) => compactCurrency(v)}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={<CurrencyTooltip />} cursor={{ fill: "rgba(108,99,255,0.05)" }} />
                <Bar dataKey="revenue" name="Revenue" fill="#25B1FF" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
            <tr>
              <th className="px-4 py-3">{isTrend ? "Date" : "Group"}</th>
              <th className="px-4 py-3">Units</th>
              <th className="px-4 py-3">Revenue</th>
              {canViewProfit ? <th className="px-4 py-3">Profit</th> : null}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.key} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-4 py-3">{row.label}</td>
                <td className="px-4 py-3">{row.units}</td>
                <td className="px-4 py-3">TZS {currency(row.revenue)}</td>
                {canViewProfit && row.profit !== undefined ? (
                  <td className="px-4 py-3">TZS {currency(row.profit)}</td>
                ) : null}
              </tr>
            ))}
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  No data for this range
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockReportView({ rows, canViewProfit }: { rows: StockSummaryRow[]; canViewProfit: boolean }) {
  return (
    <div className="card overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
          <tr>
            <th className="px-4 py-3">Group</th>
            <th className="px-4 py-3">Quantity</th>
            {canViewProfit ? <th className="px-4 py-3">Stock value</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-4 py-3">{row.label}</td>
              <td className="px-4 py-3">{row.quantity}</td>
              {canViewProfit && row.value !== undefined ? (
                <td className="px-4 py-3">TZS {currency(row.value)}</td>
              ) : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">
                No stock data
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function SupplierReportView({ rows, canViewProfit }: { rows: SupplierSummaryRow[]; canViewProfit: boolean }) {
  return (
    <div className="card overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
          <tr>
            <th className="px-4 py-3">Supplier</th>
            <th className="px-4 py-3">Quantity imported</th>
            {canViewProfit ? <th className="px-4 py-3">Value</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-4 py-3">{row.label}</td>
              <td className="px-4 py-3">{row.quantity}</td>
              {canViewProfit && row.value !== undefined ? (
                <td className="px-4 py-3">TZS {currency(row.value)}</td>
              ) : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">
                No imports in this range
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ReturnsReportView({ rows }: { rows: ReturnsSummaryRow[] }) {
  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Most returned</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.slice(0, 10)} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
              <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip content={<CountTooltip />} cursor={{ fill: "rgba(108,99,255,0.05)" }} />
              <Bar dataKey="count" name="Returns" fill="#25B1FF" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
            <tr>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-4 py-3 capitalize">{row.label}</td>
                <td className="px-4 py-3">{row.count}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-sm text-gray-400">
                  No returns in this range
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LossReportView({ rows }: { rows: LossReportRow[] }) {
  return (
    <div className="card overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Net price</th>
            <th className="px-4 py-3">Type</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-4 py-3">{new Date(row.date).toLocaleDateString()}</td>
              <td className="px-4 py-3">{row.invoiceNumber}</td>
              <td className="px-4 py-3">{row.customerName}</td>
              <td className="px-4 py-3">
                {row.categoryName} {row.modelName}
              </td>
              <td className="px-4 py-3">TZS {currency(row.netPrice)}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    row.lossType === "below_buying_price" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
                  }`}
                >
                  {row.lossTypeDisplay}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                No losses in this range
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const { has, isAdminOrSuper } = usePermissions();
  const canViewProfit = has("view_profit");
  const canExport = has("export_reports");
  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  const handleFullBackup = async () => {
    setBackingUp(true);
    setBackupError(null);
    try {
      await downloadFullBackup();
    } catch {
      setBackupError("Unable to download the full backup");
    } finally {
      setBackingUp(false);
    }
  };

  const [reportKind, setReportKind] = useState<ReportKind>("sales");
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [dateFrom, setDateFrom] = useState(() => presetRange("today").from);
  const [dateTo, setDateTo] = useState(() => presetRange("today").to);
  const [groupBy, setGroupBy] = useState("day");

  const [categories, setCategories] = useState<Category[]>([]);
  const [models, setModels] = useState<PhoneModel[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");

  const [salesData, setSalesData] = useState<SalesSummaryResponse | null>(null);
  const [stockRows, setStockRows] = useState<StockSummaryRow[]>([]);
  const [supplierRows, setSupplierRows] = useState<SupplierSummaryRow[]>([]);
  const [returnsRows, setReturnsRows] = useState<ReturnsSummaryRow[]>([]);
  const [lossRows, setLossRows] = useState<LossReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    searchCategories("").then(setCategories).catch(() => {});
    listAllModels().then(setModels).catch(() => {});
    searchSuppliers("").then(setSuppliers).catch(() => {});
    listUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (datePreset === "custom") return;
    const range = presetRange(datePreset);
    setDateFrom(range.from);
    setDateTo(range.to);
  }, [datePreset]);

  useEffect(() => {
    setGroupBy(reportKind === "sales" ? "day" : "category");
  }, [reportKind]);

  const filters: ReportFilters = useMemo(
    () => ({
      dateFrom,
      dateTo,
      category: categoryFilter || undefined,
      model: modelFilter || undefined,
      supplier: supplierFilter || undefined,
      user: userFilter || undefined,
      paymentMethod: paymentMethodFilter || undefined,
      groupBy,
    }),
    [dateFrom, dateTo, categoryFilter, modelFilter, supplierFilter, userFilter, paymentMethodFilter, groupBy],
  );

  useEffect(() => {
    setError(null);
    if (reportKind === "sales") {
      getSalesSummary(filters).then(setSalesData).catch(() => setError("Unable to load this report"));
    } else if (reportKind === "stock") {
      getStockSummary(filters).then(setStockRows).catch(() => setError("Unable to load this report"));
    } else if (reportKind === "supplier") {
      getSupplierSummary(filters).then(setSupplierRows).catch(() => setError("Unable to load this report"));
    } else if (reportKind === "returns") {
      getReturnsSummary(filters).then(setReturnsRows).catch(() => setError("Unable to load this report"));
    } else if (reportKind === "loss") {
      getLossReport(filters).then(setLossRows).catch(() => setError("Unable to view the loss report"));
    }
  }, [reportKind, filters]);

  const handleExport = async (format: "xlsx" | "pdf") => {
    if (reportKind === "person") return;
    setExporting(true);
    setError(null);
    try {
      await downloadReportExport(reportKind, filters, format);
    } catch {
      setError("Unable to export this report");
    } finally {
      setExporting(false);
    }
  };

  const groupOptions =
    reportKind === "sales" ? SALES_GROUP_OPTIONS : reportKind === "stock" ? STOCK_GROUP_OPTIONS : RETURNS_GROUP_OPTIONS;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-gray-400">Daily, weekly, monthly, and return-driven analytics</p>
        </div>
        {reportKind !== "person" ? (
          <div className="flex gap-2">
            {canExport ? (
              <>
                <button
                  onClick={() => void handleExport("xlsx")}
                  disabled={exporting}
                  className="flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-800"
                >
                  <Download size={16} /> Excel
                </button>
                <button
                  onClick={() => void handleExport("pdf")}
                  disabled={exporting}
                  className="flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-800"
                >
                  <FileText size={16} /> PDF
                </button>
              </>
            ) : null}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-2xl bg-primary px-3 py-2 text-sm font-medium text-white"
            >
              <Printer size={16} /> Print
            </button>
          </div>
        ) : null}
      </div>

      {isAdminOrSuper ? (
        <div className="no-print card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2 text-primary">
              <Database size={18} />
            </div>
            <div>
              <p className="text-sm font-medium">Full system backup</p>
              <p className="text-xs text-gray-400">
                Every stock, sale, return, user, and role record in one spreadsheet — for offline
                backup or if the system goes down
              </p>
            </div>
          </div>
          <button
            onClick={() => void handleFullBackup()}
            disabled={backingUp}
            className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Download size={16} />
            {backingUp ? "Preparing…" : "Download full backup"}
          </button>
        </div>
      ) : null}
      {backupError ? <div className="no-print card p-4 text-sm text-danger">{backupError}</div> : null}

      <div className="no-print flex flex-wrap gap-2 border-b border-gray-100 pb-2 dark:border-gray-800">
        {REPORT_TABS.filter((tab) => tab.key !== "loss" || canViewProfit).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setReportKind(tab.key)}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
              reportKind === tab.key
                ? "bg-primary text-white"
                : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}

      {reportKind === "person" ? (
        <PersonReportPanel dateFrom={dateFrom} dateTo={dateTo} />
      ) : (
        <div className="printable space-y-6">
          <div className="card no-print flex flex-wrap items-end gap-3 p-4">
            <div className="w-44">
              <label className="mb-1 block text-xs font-medium text-gray-500">Date range</label>
              <Select value={datePreset} onChange={(v) => setDatePreset(v as DatePreset)}>
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
                <option value="custom">Custom</option>
              </Select>
            </div>
            {datePreset === "custom" ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
                  />
                </div>
              </>
            ) : null}

            {reportKind === "sales" || reportKind === "stock" || reportKind === "returns" ? (
              <div className="w-44">
                <label className="mb-1 block text-xs font-medium text-gray-500">Group by</label>
                <Select value={groupBy} onChange={setGroupBy}>
                  {groupOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {reportKind === "sales" || reportKind === "stock" || reportKind === "returns" ? (
              <div className="w-44">
                <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
                <Select value={categoryFilter} onChange={setCategoryFilter}>
                  <option value="">All</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {reportKind === "sales" || reportKind === "stock" || reportKind === "returns" || reportKind === "loss" ? (
              <div className="w-44">
                <label className="mb-1 block text-xs font-medium text-gray-500">Model</label>
                <Select value={modelFilter} onChange={setModelFilter}>
                  <option value="">All</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {reportKind === "sales" || reportKind === "stock" || reportKind === "supplier" || reportKind === "loss" ? (
              <div className="w-44">
                <label className="mb-1 block text-xs font-medium text-gray-500">Supplier</label>
                <Select value={supplierFilter} onChange={setSupplierFilter}>
                  <option value="">All</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {reportKind === "sales" || reportKind === "returns" || reportKind === "loss" ? (
              <div className="w-44">
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  {reportKind === "returns" ? "Processed by" : "Salesperson"}
                </label>
                <Select value={userFilter} onChange={setUserFilter}>
                  <option value="">All</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.username}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {reportKind === "sales" ? (
              <div className="w-44">
                <label className="mb-1 block text-xs font-medium text-gray-500">Payment method</label>
                <Select value={paymentMethodFilter} onChange={setPaymentMethodFilter}>
                  <option value="">All</option>
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="card">Card</option>
                </Select>
              </div>
            ) : null}
          </div>

          {reportKind === "sales" && salesData ? (
            <SalesReportView data={salesData} groupBy={groupBy} canViewProfit={canViewProfit} />
          ) : null}
          {reportKind === "stock" ? <StockReportView rows={stockRows} canViewProfit={canViewProfit} /> : null}
          {reportKind === "supplier" ? (
            <SupplierReportView rows={supplierRows} canViewProfit={canViewProfit} />
          ) : null}
          {reportKind === "returns" ? <ReturnsReportView rows={returnsRows} /> : null}
          {reportKind === "loss" ? <LossReportView rows={lossRows} /> : null}
        </div>
      )}
    </div>
  );
}
