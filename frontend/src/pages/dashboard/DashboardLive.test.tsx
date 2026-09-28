import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage";
import * as dashboardService from "../../services/dashboard";
import { usePermissions } from "../../hooks/usePermissions";
import { LIVE_REFRESH_MS } from "../../hooks/useLiveRefresh";
import type { DashboardSummary } from "../../services/dashboard";

vi.mock("../../services/dashboard");
vi.mock("../../services/loans");
vi.mock("../../hooks/usePermissions");

// Two weeks ending today, a flat 1,000,000 a day -- so the last fortnight is 14,000,000.
function summary(overrides: { todayRevenue?: number; earlierDayRevenue?: number } = {}): DashboardSummary {
  const days = Array.from({ length: 14 }, (_, i) => ({
    date: `2026-09-${String(15 + i).padStart(2, "0")}`,
    revenue: 1_000_000,
    profit: 100_000,
  }));
  days[13].revenue = overrides.todayRevenue ?? 1_000_000;
  days[11].revenue = overrides.earlierDayRevenue ?? 1_000_000;
  return {
    todaysSales: 3,
    todaysProfit: 250_000,
    todaysReturns: 0,
    remainingStock: 40,
    totalStockValue: 0,
    lowStock: 0,
    outOfStock: 0,
    pendingReturns: 0,
    pendingPasswordRequests: 0,
    revenueTrend: days,
  };
}

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("Dashboard is live", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(usePermissions).mockReturnValue({ has: () => false, isAdminOrSuper: false });
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValue(summary());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderDashboard = async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    await tick(0);
  };

  it("shows today's revenue and the last fortnight's, exact to the shilling", async () => {
    await renderDashboard();

    expect(screen.getByText("Today's Revenue")).toBeInTheDocument();
    expect(screen.getByText("TZS 1,000,000")).toBeInTheDocument();
    expect(screen.getByText("Revenue, last 14 days")).toBeInTheDocument();
    expect(screen.getByText("TZS 14,000,000")).toBeInTheDocument();
  });

  it("picks up an edit made elsewhere on its own -- even a TZS 10 change to an earlier day", async () => {
    await renderDashboard();
    expect(screen.getByText("TZS 14,000,000")).toBeInTheDocument();

    // A sale from two days ago is corrected by TZS 10 while this page sits open.
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValue(summary({ earlierDayRevenue: 1_000_010 }));
    await tick(LIVE_REFRESH_MS);

    expect(screen.getByText("TZS 14,000,010")).toBeInTheDocument();
    expect(screen.queryByText("TZS 14,000,000")).not.toBeInTheDocument();
  });

  it("updates today's figures too", async () => {
    await renderDashboard();
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValue(summary({ todayRevenue: 1_250_000 }));
    await tick(LIVE_REFRESH_MS);

    expect(screen.getByText("TZS 1,250,000")).toBeInTheDocument();
  });

  it("loads normally the first time and marks the timed refreshes as background ones", async () => {
    await renderDashboard();
    expect(dashboardService.getDashboardSummary).toHaveBeenLastCalledWith({ live: false });

    await tick(LIVE_REFRESH_MS);
    expect(dashboardService.getDashboardSummary).toHaveBeenLastCalledWith({ live: true });
  });

  it("says when it last updated", async () => {
    await renderDashboard();
    expect(screen.getByText(/Live · updated \d/)).toBeInTheDocument();
  });

  it("keeps the numbers on screen when a refresh fails, and recovers on the next one", async () => {
    await renderDashboard();

    vi.mocked(dashboardService.getDashboardSummary).mockRejectedValue(new Error("offline"));
    await tick(LIVE_REFRESH_MS);
    expect(screen.getByText("TZS 14,000,000")).toBeInTheDocument();
    expect(screen.queryByText(/Unable to load dashboard summary/)).not.toBeInTheDocument();

    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValue(summary({ earlierDayRevenue: 1_000_010 }));
    await tick(LIVE_REFRESH_MS);
    expect(screen.getByText("TZS 14,000,010")).toBeInTheDocument();
  });

  it("does still report a failed first load, since there is nothing to show", async () => {
    vi.mocked(dashboardService.getDashboardSummary).mockRejectedValue(new Error("offline"));
    await renderDashboard();

    expect(screen.getByText("Unable to load dashboard summary")).toBeInTheDocument();
  });
});
