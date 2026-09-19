import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, HandCoins, Table2 } from "lucide-react";
import { getLoanSummary } from "../services/loans";
import { usePermissions } from "../hooks/usePermissions";
import { formatDayMonth } from "../lib/dates";
import { currency } from "../lib/money";
import type { LoanSummary, LoanTrendPoint } from "../types";

// Revenue blue / profit green match the dashboard's own revenue chart, so the same
// two things read the same colour everywhere. "Owed" is deliberately not a third hue:
// it's the unfilled remainder of the same blue meter, so paid + owed reads as one whole.
const REVENUE = "#25B1FF";
const PROFIT = "#22C55E";
const LOAN_COUNT = "#256abf";
const OWED_TRACK = "rgba(37, 177, 255, 0.22)";

const compactCurrency = (value: number) =>
  new Intl.NumberFormat("en-TZ", { notation: "compact", maximumFractionDigits: 1 }).format(value);

interface TooltipEntry {
  dataKey: string;
  name: string;
  value: number;
  color: string;
  payload: LoanTrendPoint;
}

// Values lead and the series name follows; a short line-key (not a box) carries identity.
function TrendTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm shadow-lg dark:border-gray-800 dark:bg-gray-900">
      <p className="mb-2 text-xs font-medium text-gray-400">{formatDayMonth(point.date)}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {entry.dataKey === "loans" ? entry.value : `TZS ${currency(entry.value)}`}
            </span>
            <span className="text-gray-400">{entry.name}</span>
          </div>
        ))}
        <p className="pt-1 text-xs text-gray-400">
          {point.loans} {point.loans === 1 ? "loan" : "loans"} · {point.units} {point.units === 1 ? "phone" : "phones"}
        </p>
      </div>
    </div>
  );
}

const AXIS_TICK = { fontSize: 11, fill: "#9ca3af" };

function AmountsChart({ trend, showProfit }: { trend: LoanTrendPoint[]; showProfit: boolean }) {
  return (
    <div className="h-56" role="img" aria-label="Loan sale revenue and expected profit per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDayMonth}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => compactCurrency(v)}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(37, 177, 255, 0.06)" }} />
          <Legend
            verticalAlign="top"
            align="right"
            height={24}
            iconType="rect"
            iconSize={10}
            wrapperStyle={{ fontSize: 12, color: "#6b7280" }}
          />
          <Bar dataKey="revenue" name="Revenue" fill={REVENUE} radius={[4, 4, 0, 0]} maxBarSize={24} />
          {showProfit ? (
            <Bar dataKey="expectedProfit" name="Expected profit" fill={PROFIT} radius={[4, 4, 0, 0]} maxBarSize={24} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// A count and a TZS amount can't honestly share one axis, so loans-per-day is its own chart.
function LoansPerDayChart({ trend }: { trend: LoanTrendPoint[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Loans per day</p>
      <div className="h-28" role="img" aria-label="Number of loan sales made per day">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDayMonth}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={48} />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(37, 99, 191, 0.06)" }} />
            <Bar dataKey="loans" name="Loans" fill={LOAN_COUNT} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PaidVsOwed({ receivables }: { receivables: LoanSummary["receivables"] }) {
  const { total, paid, owed, loansOpen, loansPartial, loansPaid } = receivables;
  const paidPct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const owedPct = total > 0 ? 100 - paidPct : 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Paid vs still owed</p>
        <p className="text-xs text-gray-400">Across all loan sales, not just this period</p>
      </div>

      {total === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-3 text-sm text-gray-400 dark:border-gray-800">
          No loan sales yet
        </p>
      ) : (
        <>
          <div
            role="img"
            aria-label={`${paidPct}% of loan sales paid: TZS ${currency(paid)} paid, TZS ${currency(owed)} still owed`}
            className="flex h-3 w-full gap-0.5"
          >
            {paidPct > 0 ? (
              <div className="rounded-full" style={{ width: `${paidPct}%`, backgroundColor: REVENUE }} />
            ) : null}
            {owedPct > 0 ? <div className="flex-1 rounded-full" style={{ backgroundColor: OWED_TRACK }} /> : null}
          </div>

          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-gray-500">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: REVENUE }} />
                Paid · {paidPct}%
              </dt>
              <dd className="font-semibold">TZS {currency(paid)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-gray-500">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: OWED_TRACK }} />
                Still owed · {owedPct}%
              </dt>
              <dd className="font-semibold">TZS {currency(owed)}</dd>
            </div>
          </dl>

          <p className="text-xs text-gray-400">
            {loansOpen} unpaid · {loansPartial} part-paid · {loansPaid} paid off
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-background p-3 dark:bg-gray-950">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 whitespace-nowrap text-base font-semibold sm:text-lg">{value}</p>
      {hint ? <p className="text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

function TrendTable({ trend, showProfit }: { trend: LoanTrendPoint[]; showProfit: boolean }) {
  const active = trend.filter((point) => point.loans > 0);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs text-gray-500">
          <tr>
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Loans</th>
            <th className="py-2 pr-4 font-medium">Phones</th>
            <th className="py-2 pr-4 font-medium">Revenue</th>
            {showProfit ? <th className="py-2 font-medium">Expected profit</th> : null}
          </tr>
        </thead>
        <tbody>
          {active.map((point) => (
            <tr key={point.date} className="border-t border-gray-100 dark:border-gray-800">
              <td className="py-2 pr-4">{formatDayMonth(point.date)}</td>
              <td className="py-2 pr-4">{point.loans}</td>
              <td className="py-2 pr-4">{point.units}</td>
              <td className="py-2 pr-4">TZS {currency(point.revenue)}</td>
              {showProfit ? <td className="py-2">TZS {currency(point.expectedProfit ?? 0)}</td> : null}
            </tr>
          ))}
          {active.length === 0 ? (
            <tr>
              <td colSpan={showProfit ? 5 : 4} className="py-6 text-center text-gray-400">
                No loan sales in this period
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

interface LoanChartsProps {
  days: number;
  // Bump to refetch after something the chart shows has changed (a loan or payment saved).
  refreshKey?: number;
  // The dashboard skips the small loans-per-day chart; the loan sales page shows it.
  showLoansPerDay?: boolean;
}

export function LoanCharts({ days, refreshKey = 0, showLoansPerDay = false }: LoanChartsProps) {
  const { has } = usePermissions();
  const [summary, setSummary] = useState<LoanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLoanSummary(days)
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load the loan sales chart");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, refreshKey]);

  // The backend omits profit for users without view_profit; check both so a stale or
  // partial payload can never draw an empty profit series.
  const showProfit = has("view_profit") && summary?.totals.expectedProfit !== undefined;

  return (
    <section className="card space-y-5 p-6" aria-label="Loan sales overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <HandCoins size={18} className="text-primary" />
            Loan sales
          </h2>
          <p className="text-sm text-gray-400">Last {days} days</p>
        </div>
        <div className="flex rounded-xl border border-gray-200 p-0.5 text-xs dark:border-gray-800" role="group" aria-label="View as">
          {(
            [
              ["chart", "Chart", BarChart3],
              ["table", "Table", Table2],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium ${
                view === key ? "bg-primary/10 text-primary" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {summary ? (
        // A refetch keeps the previous render on screen, dimmed, instead of blanking it.
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className={`grid grid-cols-2 gap-3 ${showProfit ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            <Stat
              label="Loans made"
              value={String(summary.totals.loans)}
              hint={`${summary.totals.units} ${summary.totals.units === 1 ? "phone" : "phones"}`}
            />
            <Stat label="Revenue" value={`TZS ${currency(summary.totals.revenue)}`} />
            {showProfit ? (
              <Stat label="Expected profit" value={`TZS ${currency(summary.totals.expectedProfit ?? 0)}`} />
            ) : null}
            <Stat label="Still owed" value={`TZS ${currency(summary.receivables.owed)}`} hint="all loan sales" />
          </div>

          {view === "chart" ? (
            <div className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
              <div className="space-y-4">
                <AmountsChart trend={summary.trend} showProfit={showProfit} />
                {showLoansPerDay ? <LoansPerDayChart trend={summary.trend} /> : null}
              </div>
              <PaidVsOwed receivables={summary.receivables} />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
              <TrendTable trend={summary.trend} showProfit={showProfit} />
              <PaidVsOwed receivables={summary.receivables} />
            </div>
          )}
        </div>
      ) : error ? null : (
        <p className="py-10 text-center text-sm text-gray-400">Loading loan sales…</p>
      )}
    </section>
  );
}
