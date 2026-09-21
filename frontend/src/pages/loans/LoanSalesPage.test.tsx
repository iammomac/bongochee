import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoanSalesPage from "./LoanSalesPage";
import * as loansService from "../../services/loans";
import * as salesService from "../../services/sales";
import { usePermissions } from "../../hooks/usePermissions";
import type { AvailablePhone, LoanSale, LoanSummary } from "../../types";

vi.mock("../../services/loans");
vi.mock("../../services/sales");
vi.mock("../../hooks/usePermissions");

// The details window, so its labels aren't confused with the chart's own (which also
// says "Revenue" and "Expected profit").
const detailsWindow = () =>
  within(screen.getByRole("heading", { name: /loan sale — loan-1/i }).closest("div.relative") as HTMLElement);

const phone: AvailablePhone = {
  id: "stock-1",
  category: "cat-1",
  categoryName: "Samsung",
  model: "model-1",
  modelName: "Galaxy A56",
  supplier: "sup-1",
  supplierName: "Blue Telecom",
  invoiceNumber: "",
  batchSize: 1,
  importDate: "2026-01-01",
  quantity: 5,
  quantityRemaining: 5,
  notes: "",
  buyingPrice: 500000,
  minSellingPrice: 600000,
  maxSellingPrice: 700000,
  name: "Samsung Galaxy A56",
};

function makeLoan(overrides: Partial<LoanSale> = {}): LoanSale {
  return {
    id: "loan-1",
    invoiceNumber: "LOAN-1",
    businessName: "Kariakoo Phones Ltd",
    contactPerson: "Juma",
    contactPhone: "255711111111",
    notes: "",
    items: [
      {
        id: "item-1",
        stockItem: "stock-1",
        modelName: "Galaxy A56",
        categoryName: "Samsung",
        imei: "111111111111111",
        sellingPrice: 650000,
        discount: 0,
      },
    ],
    payments: [],
    soldBy: "u1",
    soldByName: "Dealer",
    totalOwed: 650000,
    totalPaid: 0,
    balance: 650000,
    loanStatus: "open",
    revenue: 650000,
    cost: 500000,
    expectedProfit: 150000,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const emptySummary: LoanSummary = {
  days: 14,
  trend: [],
  totals: { loans: 0, units: 0, revenue: 0, expectedProfit: 0 },
  receivables: { total: 0, paid: 0, owed: 0, loansOpen: 0, loansPartial: 0, loansPaid: 0 },
};

describe("LoanSalesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loansService.listLoanSales).mockResolvedValue([]);
    vi.mocked(loansService.getLoanSummary).mockResolvedValue(emptySummary);
    vi.mocked(salesService.searchAvailableStock).mockResolvedValue([phone]);
    vi.mocked(usePermissions).mockReturnValue({
      has: () => true,
      isAdminOrSuper: true,
    });
  });

  it("hides the create form without create_loan_sales permission, but still lists loans", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: (code) => code === "record_loan_payments", isAdminOrSuper: false });
    vi.mocked(loansService.listLoanSales).mockResolvedValue([makeLoan()]);
    render(<LoanSalesPage />);

    expect(await screen.findByText("Kariakoo Phones Ltd")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /complete loan sale/i })).not.toBeInTheDocument();
  });

  it("creates a loan sale with the picked phone and refreshes the list", async () => {
    vi.mocked(loansService.createLoanSale).mockResolvedValue(makeLoan());
    const user = userEvent.setup();
    render(<LoanSalesPage />);

    const businessNameInput = screen.getAllByRole("textbox")[0];
    await user.type(businessNameInput, "Kariakoo Phones Ltd");

    const searchInput = screen.getByPlaceholderText(/search by category or model/i);
    await user.click(searchInput);
    await user.type(searchInput, "Galaxy");
    const resultButton = await screen.findByRole("button", { name: "Samsung Galaxy A56" });
    await user.click(resultButton);

    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /add to sale/i }));
    await user.click(screen.getByRole("button", { name: /complete loan sale/i }));

    await waitFor(() => expect(loansService.createLoanSale).toHaveBeenCalled());
    expect(loansService.createLoanSale).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: "Kariakoo Phones Ltd",
        items: [expect.objectContaining({ stockItem: "stock-1", sellingPrice: 700000 })],
      }),
    );
    await waitFor(() => expect(loansService.listLoanSales).toHaveBeenCalledTimes(2));
  }, 15000);

  describe("loan detail", () => {
    beforeEach(() => {
      vi.mocked(loansService.listLoanSales).mockResolvedValue([makeLoan()]);
    });

    it("shows the balance and lets a permitted user record a payment", async () => {
      vi.mocked(loansService.addLoanPayment).mockResolvedValue(
        makeLoan({ payments: [], totalPaid: 200000, balance: 450000, loanStatus: "partial" }),
      );
      const user = userEvent.setup();
      render(<LoanSalesPage />);

      await user.click(await screen.findByRole("button", { name: /details/i }));
      expect((await screen.findAllByText(/TZS 650,000/)).length).toBeGreaterThan(0);

      const amountInput = screen.getByPlaceholderText("0");
      await user.type(amountInput, "200000");
      await user.click(screen.getByRole("button", { name: /record payment/i }));

      await waitFor(() =>
        expect(loansService.addLoanPayment).toHaveBeenCalledWith(
          "loan-1",
          expect.objectContaining({ amount: 200000, paymentMethod: "cash" }),
        ),
      );
      expect((await screen.findAllByText("Partially paid")).length).toBeGreaterThan(0);
    });

    it("shows the loan's revenue, cost and expected profit", async () => {
      const user = userEvent.setup();
      render(<LoanSalesPage />);

      await user.click(await screen.findByRole("button", { name: /details/i }));

      const details = detailsWindow();
      expect(details.getByText("Revenue")).toBeInTheDocument();
      expect(details.getByText("Cost of phones")).toBeInTheDocument();
      expect(details.getByText("Expected profit")).toBeInTheDocument();
      expect(details.getByText("TZS 500,000")).toBeInTheDocument();
      expect(details.getByText("TZS 150,000")).toBeInTheDocument();
    });

    it("shows revenue but no cost or profit when the server withholds them (no view_profit)", async () => {
      vi.mocked(loansService.listLoanSales).mockResolvedValue([
        makeLoan({ cost: undefined, expectedProfit: undefined }),
      ]);
      const user = userEvent.setup();
      render(<LoanSalesPage />);

      await user.click(await screen.findByRole("button", { name: /details/i }));

      const details = detailsWindow();
      expect(details.getByText("Revenue")).toBeInTheDocument();
      expect(details.queryByText("Cost of phones")).not.toBeInTheDocument();
      expect(details.queryByText("Expected profit")).not.toBeInTheDocument();
    });

    it("refreshes the chart after a payment is recorded", async () => {
      vi.mocked(loansService.addLoanPayment).mockResolvedValue(makeLoan({ totalPaid: 1000, balance: 649000 }));
      const user = userEvent.setup();
      render(<LoanSalesPage />);
      await waitFor(() => expect(loansService.getLoanSummary).toHaveBeenCalledTimes(1));

      await user.click(await screen.findByRole("button", { name: /details/i }));
      await user.type(screen.getByPlaceholderText("0"), "1000");
      await user.click(screen.getByRole("button", { name: /record payment/i }));

      await waitFor(() => expect(loansService.getLoanSummary).toHaveBeenCalledTimes(2));
    });

    it("hides the record-payment form without record_loan_payments permission", async () => {
      vi.mocked(usePermissions).mockReturnValue({ has: (code) => code === "edit_loan_sales", isAdminOrSuper: false });
      const user = userEvent.setup();
      render(<LoanSalesPage />);

      await user.click(await screen.findByRole("button", { name: /details/i }));
      expect(screen.queryByRole("button", { name: /record payment/i })).not.toBeInTheDocument();
    });

    it("blocks deleting a loan that already has payments recorded", async () => {
      vi.mocked(loansService.listLoanSales).mockResolvedValue([
        makeLoan({
          payments: [
            {
              id: "pay-1",
              amount: 100000,
              paymentMethod: "cash",
              paidDate: "2026-01-02",
              notes: "",
              recordedBy: "u1",
              recordedByName: "Dealer",
              createdAt: "2026-01-02T00:00:00Z",
            },
          ],
        }),
      ]);
      const user = userEvent.setup();
      render(<LoanSalesPage />);

      await user.click(await screen.findByRole("button", { name: /details/i }));
      expect(screen.getByText(/payments have already been recorded/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete loan sale/i })).not.toBeInTheDocument();
    });

    it("deletes a loan sale with no payments after confirming", async () => {
      vi.mocked(loansService.deleteLoanSale).mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<LoanSalesPage />);

      await user.click(await screen.findByRole("button", { name: /details/i }));
      await user.click(screen.getByRole("button", { name: /delete loan sale/i }));
      await user.click(screen.getByRole("button", { name: /confirm/i }));

      await waitFor(() => expect(loansService.deleteLoanSale).toHaveBeenCalledWith("loan-1"));
    });
  });
});
