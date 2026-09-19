import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "./ReportsPage";
import * as reportsService from "../../services/reports";
import * as catalogService from "../../services/catalog";
import * as supplierService from "../../services/suppliers";
import * as userService from "../../services/users";
import { usePermissions } from "../../hooks/usePermissions";
import type { LoanSalesReportResponse } from "../../types";

vi.mock("../../services/reports");
vi.mock("../../services/catalog");
vi.mock("../../services/suppliers");
vi.mock("../../services/users");
vi.mock("../../hooks/usePermissions");

const pad = (n: number) => String(n).padStart(2, "0");
const localIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function report(overrides: Partial<LoanSalesReportResponse> = {}): LoanSalesReportResponse {
  return {
    rows: [
      { key: "k", label: "Kariakoo Phones", loans: 2, units: 3, revenue: 1900000, expectedProfit: 400000, paid: 1100000, outstanding: 800000 },
      { key: "m", label: "Mwanza Mobile", loans: 1, units: 1, revenue: 380000, expectedProfit: 80000, paid: 0, outstanding: 380000 },
    ],
    totals: { loans: 3, units: 4, revenue: 2280000, expectedProfit: 480000, paid: 1100000, outstanding: 1180000 },
    details: [
      {
        key: "l1", date: "2026-09-19", time: "14:32", invoiceNumber: "LOAN-A", businessName: "Kariakoo Phones",
        contact: "Juma · 255711", soldByName: "Amina Seller", models: "Galaxy A56 ×2", categories: "Samsung",
        suppliers: "Blue Telecom", units: 2, revenue: 1300000, cost: 1000000, expectedProfit: 300000,
        paid: 500000, balance: 800000, status: "Partially paid", lastPayment: "2026-09-19", notes: "Pays Friday",
      },
    ],
    detailTotals: { units: 2, revenue: 1300000, cost: 1000000, expectedProfit: 300000, paid: 500000, balance: 800000 },
    ...overrides,
  };
}

async function openLoanTab() {
  const user = userEvent.setup();
  render(<ReportsPage />);
  await user.click(await screen.findByRole("button", { name: "Loan sales" }));
  return user;
}

describe("Reports > Loan sales tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    vi.mocked(catalogService.searchCategories).mockResolvedValue([{ id: "cat-1", name: "Samsung", createdAt: "" }]);
    vi.mocked(catalogService.listAllModels).mockResolvedValue([]);
    vi.mocked(supplierService.searchSuppliers).mockResolvedValue([]);
    vi.mocked(userService.listUsers).mockResolvedValue([]);
    vi.mocked(reportsService.getSalesSummary).mockResolvedValue({
      rows: [], totals: { units: 0, revenue: 0, profit: 0 }, details: [], detailTotals: {},
    });
    vi.mocked(reportsService.getLoanSalesReport).mockResolvedValue(report());
  });

  it("only appears for someone who works with loan sales", async () => {
    // Every single permission is granted except the "any loan permission" check (an array).
    vi.mocked(usePermissions).mockReturnValue({ has: (code) => !Array.isArray(code), isAdminOrSuper: false });
    render(<ReportsPage />);
    await screen.findByRole("button", { name: "Sales & Profit" });
    expect(screen.queryByRole("button", { name: "Loan sales" })).not.toBeInTheDocument();
  });

  it("shows the headline numbers, the grouped summary and one line per loan", async () => {
    await openLoanTab();

    expect(await screen.findByText("Loans made")).toBeInTheDocument();
    expect(screen.getByText("TZS 2,280,000")).toBeInTheDocument(); // revenue
    expect(screen.getByText("TZS 480,000")).toBeInTheDocument(); // expected profit
    expect(screen.getByText("TZS 1,180,000")).toBeInTheDocument(); // still owed

    const summary = screen.getByText("By business").closest(".card") as HTMLElement;
    expect(within(summary).getByText("Kariakoo Phones")).toBeInTheDocument();
    expect(within(summary).getByText("Mwanza Mobile")).toBeInTheDocument();

    const detail = screen.getByText("Loan sales", { selector: "h2" }).closest(".card") as HTMLElement;
    expect(within(detail).getByText("LOAN-A")).toBeInTheDocument();
    expect(within(detail).getByText("Juma · 255711")).toBeInTheDocument();
    expect(within(detail).getByText("Galaxy A56 ×2")).toBeInTheDocument();
    expect(within(detail).getByText("Partially paid")).toBeInTheDocument();
    expect(within(detail).getByText("Pays Friday")).toBeInTheDocument();
  });

  it("asks for its own date range (this month by default) and groups by business", async () => {
    await openLoanTab();

    const now = new Date();
    await waitFor(() =>
      expect(reportsService.getLoanSalesReport).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: localIso(new Date(now.getFullYear(), now.getMonth(), 1)),
          dateTo: localIso(now),
          groupBy: "business",
        }),
      ),
    );
  });

  it("keeps its date range and filters separate from the other reports'", async () => {
    const user = await openLoanTab();
    await screen.findByText("Loans made");

    // Give the loan report a different range...
    await user.click(screen.getAllByRole("button", { name: /this month/i })[0]);
    await user.click(await screen.findByRole("option", { name: "Last 90 days" }));
    await waitFor(() => {
      const last = vi.mocked(reportsService.getLoanSalesReport).mock.calls.at(-1)![0];
      expect(last.dateFrom).not.toBe(last.dateTo);
    });

    // ...and the Sales tab still asks for today, not the loan report's range.
    await user.click(screen.getByRole("button", { name: "Sales & Profit" }));
    await waitFor(() => {
      const last = vi.mocked(reportsService.getSalesSummary).mock.calls.at(-1)![0];
      expect(last.dateFrom).toBe(localIso(new Date()));
      expect(last.dateTo).toBe(localIso(new Date()));
    });
  });

  it("filters by payment status and by business name (after a short pause)", async () => {
    const user = await openLoanTab();
    await screen.findByText("Loans made");

    const statusField = screen.getByText("Payment status").closest("div") as HTMLElement;
    await user.click(within(statusField).getByRole("button"));
    await user.click(await screen.findByRole("option", { name: "Open (nothing paid)" }));
    await waitFor(() =>
      expect(reportsService.getLoanSalesReport).toHaveBeenLastCalledWith(expect.objectContaining({ status: "open" })),
    );

    await user.type(screen.getByLabelText("Business"), "Kari");
    await waitFor(() =>
      expect(reportsService.getLoanSalesReport).toHaveBeenLastCalledWith(expect.objectContaining({ business: "Kari" })),
    );
  });

  it("leaves out the payment columns when the server does, and says why", async () => {
    vi.mocked(reportsService.getLoanSalesReport).mockResolvedValue(
      report({
        rows: [{ key: "s", label: "Samsung", loans: 2, units: 3, revenue: 1900000, expectedProfit: 400000 }],
        details: [{ ...report().details[0], paid: undefined as never, balance: undefined as never }],
        totals: { loans: 2, units: 3, revenue: 1900000, expectedProfit: 400000 },
      }),
    );
    await openLoanTab();
    await screen.findByText("Loans made");

    expect(screen.queryByRole("columnheader", { name: "Paid" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Still owed" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Balance" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: "Revenue" })).toHaveLength(2); // summary + per-loan table
    expect(screen.getByText(/Payment figures aren't broken down by product/)).toBeInTheDocument();
  });

  it("hides expected profit and cost without view_profit", async () => {
    vi.mocked(usePermissions).mockReturnValue({
      has: (code) => (Array.isArray(code) ? true : code !== "view_profit"),
      isAdminOrSuper: false,
    });
    vi.mocked(reportsService.getLoanSalesReport).mockResolvedValue(
      report({
        totals: { loans: 3, units: 4, revenue: 2280000, paid: 1100000, outstanding: 1180000 },
        rows: [{ key: "k", label: "Kariakoo Phones", loans: 2, units: 3, revenue: 1900000, paid: 1100000, outstanding: 800000 }],
        details: [
          {
            ...report().details[0],
            cost: undefined as never,
            expectedProfit: undefined as never,
          },
        ],
      }),
    );
    await openLoanTab();
    await screen.findByText("Loans made");

    expect(screen.queryByText("Expected profit")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Expected profit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Cost" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Balance" })).toBeInTheDocument();
  });

  it("exports the loan report with the loan report's own filters", async () => {
    vi.mocked(reportsService.downloadReportExport).mockResolvedValue(undefined);
    const user = await openLoanTab();
    await screen.findByText("Loans made");

    await user.click(screen.getByRole("button", { name: /excel/i }));

    await waitFor(() =>
      expect(reportsService.downloadReportExport).toHaveBeenCalledWith(
        "loans",
        expect.objectContaining({ groupBy: "business" }),
        "xlsx",
      ),
    );
  });
});
