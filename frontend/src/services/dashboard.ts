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

export async function getDashboardSummary() {
  const { data } = await api.get<DashboardSummary>(
    "/reports/dashboard-summary/",
  );
  return data;
}
