import { api } from "./api";

export interface RevenueTrendPoint {
  date: string;
  revenue: number;
  profit: number;
}

export interface DashboardSummary {
  todaysSales: number;
  todaysProfit: number;
  todaysReturns: number;
  remainingStock: number;
  totalStockValue: number;
  lowStock: number;
  outOfStock: number;
  pendingReturns: number;
  pendingPasswordRequests: number;
  revenueTrend: RevenueTrendPoint[];
}

// `live` marks a timed background refresh, which the server doesn't write to the activity log
// (opening the dashboard is the thing worth logging).
export async function getDashboardSummary({ live = false }: { live?: boolean } = {}) {
  const { data } = await api.get<DashboardSummary>("/reports/dashboard-summary/", {
    params: live ? { live: 1 } : undefined,
  });
  return data;
}
