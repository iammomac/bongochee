import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoanCharts } from "./LoanCharts";
import * as loansService from "../services/loans";
import { usePermissions } from "../hooks/usePermissions";
import { LIVE_REFRESH_MS } from "../hooks/useLiveRefresh";
import type { LoanSummary } from "../types";

vi.mock("../services/loans");
vi.mock("../hooks/usePermissions");

const summary = (revenue: number): LoanSummary => ({
  days: 14,
  trend: [{ date: "2026-09-18", loans: 1, units: 1, revenue, expectedProfit: 100000 }],
  totals: { loans: 1, units: 1, revenue, expectedProfit: 100000 },
  receivables: { total: revenue, paid: 0, owed: revenue, loansOpen: 1, loansPartial: 0, loansPaid: 0 },
});

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("LoanCharts stays current on its own", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    vi.mocked(loansService.getLoanSummary).mockResolvedValue(summary(650000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-reads the loan figures on a timer and shows the new ones", async () => {
    render(<LoanCharts days={14} />);
    await tick(0);
    expect(screen.getAllByText("TZS 650,000").length).toBeGreaterThan(0);

    vi.mocked(loansService.getLoanSummary).mockResolvedValue(summary(650010));
    await tick(LIVE_REFRESH_MS);

    expect(screen.getAllByText("TZS 650,010").length).toBeGreaterThan(0);
    expect(screen.queryByText("TZS 650,000")).not.toBeInTheDocument();
  });

  it("keeps what's drawn if a refresh fails", async () => {
    render(<LoanCharts days={14} />);
    await tick(0);

    vi.mocked(loansService.getLoanSummary).mockRejectedValue(new Error("offline"));
    await tick(LIVE_REFRESH_MS);

    expect(screen.getAllByText("TZS 650,000").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Unable to load/)).not.toBeInTheDocument();
  });

  it("asks for the range currently selected, not the one it started with", async () => {
    const { rerender } = render(<LoanCharts days={14} />);
    await tick(0);

    rerender(<LoanCharts days={30} />);
    await tick(0);
    vi.mocked(loansService.getLoanSummary).mockClear();
    await tick(LIVE_REFRESH_MS);

    expect(loansService.getLoanSummary).toHaveBeenCalledWith(30);
    expect(loansService.getLoanSummary).not.toHaveBeenCalledWith(14);
  });
});
