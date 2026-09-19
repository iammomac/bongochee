import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "./ReportsPage";
import * as reportsService from "../../services/reports";
import * as catalogService from "../../services/catalog";
import * as supplierService from "../../services/suppliers";
import * as userService from "../../services/users";
import { usePermissions } from "../../hooks/usePermissions";

vi.mock("../../services/reports");
vi.mock("../../services/catalog");
vi.mock("../../services/suppliers");
vi.mock("../../services/users");
vi.mock("../../hooks/usePermissions");

// recharts' ResponsiveContainer measures itself with ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const detailRow = {
  key: "d1",
  date: "2026-09-19",
  time: "14:32",
  invoiceNumber: "INV-9",
  soldByName: "Amina Seller",
  customerName: "Kariakoo Phones Ltd",
  categoryName: "Samsung",
  modelName: "Galaxy A56",
  supplierName: "Blue Telecom",
  units: 2,
  priceSold: 1300000,
  discount: 0,
  revenue: 1300000,
  profit: 300000,
  condition: "Full box",
  saleNotes: "",
};

describe("ReportsPage detail tables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    vi.mocked(catalogService.searchCategories).mockResolvedValue([]);
    vi.mocked(catalogService.listAllModels).mockResolvedValue([]);
    vi.mocked(supplierService.searchSuppliers).mockResolvedValue([]);
    vi.mocked(userService.listUsers).mockResolvedValue([]);
    vi.mocked(reportsService.getSalesSummary).mockResolvedValue({
      rows: [{ key: "2026-09-19", label: "19 Sep 2026", units: 2, revenue: 1300000, profit: 300000 }],
      totals: { units: 2, revenue: 1300000, profit: 300000 },
      details: [detailRow],
      detailTotals: { units: 2, priceSold: 1300000, discount: 0, revenue: 1300000, profit: 300000 },
    });
    vi.mocked(reportsService.getReturnsSummary).mockResolvedValue({
      rows: [{ key: "battery", label: "Battery", count: 1 }],
      details: [
        {
          key: "r1",
          date: "2026-09-19",
          time: "15:05",
          invoiceNumber: "INV-9",
          processedByName: "Support Sam",
          customerName: "Amina Yusuf",
          categoryName: "Samsung",
          modelName: "Galaxy A56",
          supplierName: "Blue Telecom",
          units: 1,
          priceSold: 650000,
          revenue: 650000,
          profit: 150000,
          condition: "Used",
          issue: "Battery",
          status: "Pending",
          description: "Drains fast",
        },
      ],
      detailTotals: { units: 1, priceSold: 650000, revenue: 650000, profit: 150000 },
    });
  });

  it("shows the full per-sale table under the sales summary", async () => {
    render(<ReportsPage />);

    expect(await screen.findByText("Detailed transactions")).toBeInTheDocument();
    expect(await screen.findByText("Kariakoo Phones Ltd")).toBeInTheDocument();
    expect(screen.getByText("Amina Seller")).toBeInTheDocument();
    expect(screen.getByText("Full box")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Condition" })).toBeInTheDocument();
  });

  it("shows the detail table on the other report types too", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);

    await user.click(screen.getByRole("button", { name: "Returns" }));

    expect(await screen.findByText("Support Sam")).toBeInTheDocument();
    expect(screen.getByText("Amina Yusuf")).toBeInTheDocument();
    expect(screen.getByText("Drains fast")).toBeInTheDocument();
    expect(reportsService.getReturnsSummary).toHaveBeenCalled();
  });
});
