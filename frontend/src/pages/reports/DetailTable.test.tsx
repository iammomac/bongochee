import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailTable, SALES_DETAIL_COLUMNS } from "./DetailTable";
import type { DetailRow } from "../../types";

const row: DetailRow = {
  key: "sale-1:stock-1",
  date: "2026-09-19",
  time: "14:32",
  invoiceNumber: "INV-1",
  soldByName: "Amina Seller",
  customerName: "Kariakoo Phones Ltd",
  categoryName: "Samsung",
  modelName: "Galaxy A56",
  supplierName: "Blue Telecom",
  units: 3,
  priceSold: 1780000,
  discount: 100000,
  revenue: 1680000,
  profit: 180000,
  condition: "Full box",
  saleNotes: "",
};

function renderTable(overrides: Partial<Parameters<typeof DetailTable<DetailRow>>[0]> = {}) {
  return render(
    <DetailTable
      rows={[row]}
      columns={SALES_DETAIL_COLUMNS}
      getKey={(r) => r.key}
      totals={{ units: 3, priceSold: 1780000, discount: 100000, revenue: 1680000, profit: 180000 }}
      canViewProfit
      emptyMessage="No sales in this range"
      {...overrides}
    />,
  );
}

describe("DetailTable", () => {
  it("shows every requested field for a sale", () => {
    renderTable();
    for (const header of [
      "Date", "Time", "Salesperson", "Customer", "Price sold", "Units", "Model",
      "Revenue", "Profit", "Category", "Supplier", "Condition",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    const body = within(screen.getAllByRole("row")[1]);
    expect(body.getByText("19 Sep 2026")).toBeInTheDocument();
    expect(body.getByText("14:32")).toBeInTheDocument();
    expect(body.getByText("Amina Seller")).toBeInTheDocument();
    expect(body.getByText("Kariakoo Phones Ltd")).toBeInTheDocument();
    expect(body.getByText("Galaxy A56")).toBeInTheDocument();
    expect(body.getByText("Blue Telecom")).toBeInTheDocument();
    expect(body.getByText("1,780,000")).toBeInTheDocument();
    expect(body.getByText("Full box")).toBeInTheDocument();
  });

  it("shows a dash where a note is empty", () => {
    renderTable();
    // "Sale notes" is blank on this row.
    expect(within(screen.getAllByRole("row")[1]).getAllByText("—")).toHaveLength(1);
  });

  it("totals the amount columns in a footer row", () => {
    renderTable();
    const footer = within(screen.getAllByRole("row").at(-1) as HTMLElement);
    expect(footer.getByText("Total")).toBeInTheDocument();
    expect(footer.getByText("1,680,000")).toBeInTheDocument();
    expect(footer.getByText("180,000")).toBeInTheDocument();
  });

  it("hides profit columns without view_profit", () => {
    renderTable({ canViewProfit: false });
    expect(screen.queryByRole("columnheader", { name: "Profit" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Revenue" })).toBeInTheDocument();
    expect(screen.queryByText("180,000")).not.toBeInTheDocument();
  });

  it("shows the empty message and no totals when there are no rows", () => {
    renderTable({ rows: [] });
    expect(screen.getByText("No sales in this range")).toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });
});
