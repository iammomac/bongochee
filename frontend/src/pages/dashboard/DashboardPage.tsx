import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  KeyRound,
  Package,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { getDashboardSummary } from "../../services/dashboard";
import type { DashboardSummary, RevenueTrendPoint } from "../../services/dashboard";
import { usePermissions } from "../../hooks/usePermissions";

const currency = (value: number) =>
  new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);

const compactCurrency = (value: number) =>
  new Intl.NumberFormat("en-TZ", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const formatTrendDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

interface TrendTooltipEntry {
  dataKey: string;
  name: string;
  value: number;
  color: string;
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TrendTooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm shadow-lg dark:border-gray-800 dark:bg-gray-900">
      <p className="mb-2 text-xs font-medium text-gray-400">{formatTrendDate(label)}</p>
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

function RevenueTrendChart({ trend }: { trend: RevenueTrendPoint[] }) {
  if (!trend.length) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-gray-400">
        Loading trend…
      </div>
    );
  }
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tickFormatter={formatTrendDate}
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
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#c3c2b7", strokeWidth: 1 }} />
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
          <Area
            type="monotone"
            dataKey="profit"
            name="Profit"
            stroke="#22C55E"
            strokeWidth={2}
            fill="#22C55E"
            fillOpacity={0.1}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const cards: Array<{
  key: "todaysSales" | "todaysProfit" | "todaysReturns" | "remainingStock";
  label: string;
  icon: typeof ShoppingCart;
  prefix?: string;
  suffix?: string;
}> = [
  {
    key: "todaysSales",
    label: "Today's Sales",
    icon: ShoppingCart,
    suffix: " units",
  },
  {
    key: "todaysProfit",
    label: "Today's Profit",
    icon: TrendingUp,
    prefix: "TZS ",
  },
  { key: "todaysReturns", label: "Today's Returns", icon: RotateCcw },
  { key: "remainingStock", label: "Remaining Stock", icon: Package },
];

interface PriorityItem {
  key: string;
  message: string;
  link: string;
  icon: typeof AlertTriangle;
  tone: "danger" | "warning" | "primary";
}

function buildPriorityItems(summary: DashboardSummary | null, canManageUsers: boolean): PriorityItem[] {
  if (!summary) return [];
  const items: PriorityItem[] = [];
  if (summary.outOfStock > 0) {
    items.push({
      key: "out-of-stock",
      message: `${summary.outOfStock} phone model${summary.outOfStock === 1 ? "" : "s"} out of stock`,
      link: "/stock",
      icon: AlertTriangle,
      tone: "danger",
    });
  }
  if (summary.lowStock > 0) {
    items.push({
      key: "low-stock",
      message: `${summary.lowStock} phone model${summary.lowStock === 1 ? "" : "s"} low on stock`,
      link: "/stock",
      icon: Package,
      tone: "warning",
    });
  }
  if (summary.pendingReturns > 0) {
    items.push({
      key: "pending-returns",
      message: `${summary.pendingReturns} return${summary.pendingReturns === 1 ? "" : "s"} awaiting review`,
      link: "/returns",
      icon: RotateCcw,
      tone: "warning",
    });
  }
  if (canManageUsers && summary.pendingPasswordRequests > 0) {
    items.push({
      key: "pending-password-requests",
      message: `${summary.pendingPasswordRequests} password reset request${summary.pendingPasswordRequests === 1 ? "" : "s"} pending`,
      link: "/users",
      icon: KeyRound,
      tone: "primary",
    });
  }
  return items;
}

const TONE_STYLES: Record<PriorityItem["tone"], string> = {
  danger: "border-danger/20 bg-danger/5 text-danger",
  warning: "border-warning/20 bg-warning/5 text-warning",
  primary: "border-primary/20 bg-primary/5 text-primary",
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { has } = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    void getDashboardSummary()
      .then(setSummary)
      .catch(() => setError("Unable to load dashboard summary"));
  }, []);

  const trend = summary?.revenueTrend ?? [];
  const today = trend[trend.length - 1];
  const yesterday = trend[trend.length - 2];
  const revenueDelta =
    today && yesterday && yesterday.revenue > 0
      ? ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100
      : null;
  const priorityItems = buildPriorityItems(summary, has("manage_users"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-primary">
            Operations overview
          </p>
          <h1 className="text-3xl font-semibold">Bongo Chee command center</h1>
        </div>
        <div className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
          Live inventory intelligence
        </div>
      </div>

      {error ? (
        <div className="card p-4 text-sm text-danger">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ key, label, icon: Icon, prefix, suffix }) => {
          const value = summary?.[key] ?? 0;
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-5"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{label}</p>
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <Icon size={18} />
                </div>
              </div>
              <p className="mt-4 text-3xl font-semibold">
                {prefix ?? ""}
                {typeof value === "number" ? value.toLocaleString() : value}
                {suffix ?? ""}
              </p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Revenue trend</h2>
              <p className="text-sm text-gray-400">
                A calm view of daily momentum
              </p>
            </div>
            {revenueDelta !== null ? (
              <div
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
                  revenueDelta >= 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                }`}
              >
                {revenueDelta >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                <span>
                  {revenueDelta >= 0 ? "+" : ""}
                  {revenueDelta.toFixed(1)}% vs yesterday
                </span>
              </div>
            ) : null}
          </div>
          <RevenueTrendChart trend={summary?.revenueTrend ?? []} />
        </div>
        <div className="card p-6">
          <h2 className="text-lg font-semibold">Priority items</h2>
          {summary === null ? (
            <p className="mt-4 text-sm text-gray-400">Loading…</p>
          ) : priorityItems.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-gray-200 p-3 text-sm text-gray-500 dark:border-gray-800">
              <CheckCircle2 size={16} className="shrink-0 text-success" />
              All caught up — nothing needs attention right now.
            </div>
          ) : (
            <ul className="mt-4 space-y-3 text-sm">
              {priorityItems.map(({ key, message, link, icon: Icon, tone }) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => navigate(link)}
                    className={`flex w-full items-center gap-2 rounded-2xl border p-3 text-left transition hover:opacity-80 ${TONE_STYLES[tone]}`}
                  >
                    <Icon size={16} className="shrink-0" />
                    {message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
