import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StockHistoryModal } from "./StockHistoryModal";
import * as stockService from "../services/stock";
import type { StockItem } from "../types";

vi.mock("../services/stock");

const item = {
  id: "st-1",
  categoryName: "Samsung",
  modelName: "Galaxy A56",
  supplierName: "Blue Telecom",
  importDate: "2026-11-01",
  quantity: 3,
  quantityRemaining: 2,
} as StockItem;

describe("StockHistoryModal", () => {
  it("lists every change with its reason, reference and who did it", async () => {
    vi.mocked(stockService.getStockHistory).mockResolvedValue([
      {
        id: "m2", change: -1, quantityAfter: 2, reason: "sale", reasonDisplay: "Sold",
        reference: "INV-7", note: "", userName: "Juma", createdAt: "2026-11-02T10:00:00Z",
      },
      {
        id: "m1", change: 3, quantityAfter: 3, reason: "stock_in", reasonDisplay: "Stock received",
        reference: "SUP-1", note: "", userName: "Neema", createdAt: "2026-11-01T09:00:00Z",
      },
    ]);
    render(<StockHistoryModal item={item} onClose={() => {}} />);

    expect(await screen.findByText("Sold")).toBeInTheDocument();
    expect(screen.getByText("INV-7")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("Neema")).toBeInTheDocument();
    expect(stockService.getStockHistory).toHaveBeenCalledWith("st-1");
  });
});
