import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoanCharts } from "./LoanCharts";
import * as loansService from "../services/loans";
import { usePermissions } from "../hooks/usePermissions";
import type { LoanSummary } from "../types";

vi.mock("../services/loans");
vi.mock("../hooks/usePermissions");

function makeSummary(overrides: Partial<LoanSummary> = {}): LoanSummary {
  return {
    days: 14,
    trend: [
      { date: "2026-09-17", loans: 0, units: 0, revenue: 0, expectedProfit: 0 },
      { date: "2026-09-18", loans: 2, units: 3, revenue: 2050000, expectedProfit: 550000 },
      { date: "2026-09-19", loans: 1, units: 1, revenue: 650000, expectedProfit: 150000 },
    ],
    totals: { loans: 3, units: 4, revenue: 2700000, expectedProfit: 700000 },
    receivables: { total: 4000000, paid: 1000000, owed: 3000000, loansOpen: 2, loansPartial: 1, loansPaid: 1 },
    ...overrides,
  };
}

describe("LoanCharts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    vi.mocked(loansService.getLoanSummary).mockResolvedValue(makeSummary());
  });

  it("fetches the requested period and shows the headline numbers", async () => {
    render(<LoanCharts days={30} />);

    expect(await screen.findByText("Loans made")).toBeInTheDocument();
    expect(loansService.getLoanSummary).toHaveBeenCalledWith(30);
    expect(screen.getByText("4 phones")).toBeInTheDocument();
    expect(screen.getByText("TZS 2,700,000")).toBeInTheDocument(); // revenue
    expect(screen.getByText("TZS 700,000")).toBeInTheDocument(); // expected profit
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("splits what's been paid from what's still owed across the whole loan book", async () => {
    render(<LoanCharts days={14} />);

    expect(await screen.findByText(/Paid · 25%/)).toBeInTheDocument();
    expect(screen.getByText(/Still owed · 75%/)).toBeInTheDocument();
    expect(screen.getByText("TZS 1,000,000")).toBeInTheDocument();
    expect(screen.getAllByText("TZS 3,000,000").length).toBeGreaterThan(0);
    expect(screen.getByText("2 unpaid · 1 part-paid · 1 paid off")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /25% of loan sales paid/i })).toBeInTheDocument();
  });

  it("hides expected profit without view_profit", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: () => false, isAdminOrSuper: false });
    vi.mocked(loansService.getLoanSummary).mockResolvedValue(
      makeSummary({ totals: { loans: 3, units: 4, revenue: 2700000 } }),
    );
    render(<LoanCharts days={14} />);

    await screen.findByText("Loans made");
    expect(screen.queryByText("Expected profit")).not.toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
  });

  it("offers a table view of the same data, listing only days with loans", async () => {
    const user = userEvent.setup();
    render(<LoanCharts days={14} />);
    await screen.findByText("Loans made");

    await user.click(screen.getByRole("button", { name: /table/i }));

    expect(screen.getByRole("columnheader", { name: "Expected profit" })).toBeInTheDocument();
    expect(screen.getByText("18 Sep")).toBeInTheDocument();
    expect(screen.getByText("19 Sep")).toBeInTheDocument();
    expect(screen.queryByText("17 Sep")).not.toBeInTheDocument(); // a day with no loans
    expect(screen.getByRole("button", { name: /table/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("says so when there are no loan sales at all", async () => {
    vi.mocked(loansService.getLoanSummary).mockResolvedValue(
      makeSummary({
        trend: [],
        totals: { loans: 0, units: 0, revenue: 0, expectedProfit: 0 },
        receivables: { total: 0, paid: 0, owed: 0, loansOpen: 0, loansPartial: 0, loansPaid: 0 },
      }),
    );
    render(<LoanCharts days={14} />);

    expect(await screen.findByText("No loan sales yet")).toBeInTheDocument();
  });

  it("refetches when the period or the refresh key changes", async () => {
    const { rerender } = render(<LoanCharts days={14} refreshKey={0} />);
    await waitFor(() => expect(loansService.getLoanSummary).toHaveBeenCalledTimes(1));

    rerender(<LoanCharts days={7} refreshKey={0} />);
    await waitFor(() => expect(loansService.getLoanSummary).toHaveBeenLastCalledWith(7));

    rerender(<LoanCharts days={7} refreshKey={1} />);
    await waitFor(() => expect(loansService.getLoanSummary).toHaveBeenCalledTimes(3));
  });

  it("keeps showing the last numbers while a refetch is in flight", async () => {
    const { rerender } = render(<LoanCharts days={14} refreshKey={0} />);
    await screen.findByText("Loans made");

    vi.mocked(loansService.getLoanSummary).mockReturnValue(new Promise(() => {}));
    rerender(<LoanCharts days={14} refreshKey={1} />);

    expect(screen.getByText("Loans made")).toBeInTheDocument();
  });

  it("shows an error instead of crashing when the request fails", async () => {
    vi.mocked(loansService.getLoanSummary).mockRejectedValue(new Error("boom"));
    render(<LoanCharts days={14} />);

    expect(await screen.findByText("Unable to load the loan sales chart")).toBeInTheDocument();
  });
});
