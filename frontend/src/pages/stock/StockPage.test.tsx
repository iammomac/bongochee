import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StockPage from "./StockPage";
import * as stockService from "../../services/stock";
import { usePermissions } from "../../hooks/usePermissions";
import type { StockItem } from "../../types";

vi.mock("../../services/stock");
vi.mock("../../hooks/usePermissions");

function makeItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: "item-1",
    category: "cat-1",
    categoryName: "Samsung",
    model: "model-1",
    modelName: "Galaxy A56",
    supplierName: "Blue Telecom",
    importDate: "2026-01-01",
    quantity: 5,
    quantityRemaining: 5,
    buyingPrice: 500000,
    minSellingPrice: 600000,
    maxSellingPrice: 700000,
    notes: "",
    ...overrides,
  };
}

describe("StockPage recent stock table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a stock line's notes, and a dash when there are none", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: () => false, isAdminOrSuper: false });
    vi.mocked(stockService.listRecentStockItems).mockResolvedValue([
      makeItem({ id: "item-1", notes: "Full box, unused" }),
      makeItem({ id: "item-2", notes: "" }),
    ]);
    render(<StockPage />);

    expect(await screen.findByText("Full box, unused")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("offers delete only for an untouched line, and only with delete_stock permission", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: (code) => code === "delete_stock", isAdminOrSuper: false });
    vi.mocked(stockService.listRecentStockItems).mockResolvedValue([
      makeItem({ id: "untouched", quantity: 5, quantityRemaining: 5 }),
      makeItem({ id: "partially-sold", quantity: 5, quantityRemaining: 3 }),
    ]);
    render(<StockPage />);

    await waitFor(() => expect(stockService.listRecentStockItems).toHaveBeenCalled());
    const deleteButtons = await screen.findAllByRole("button", { name: /delete/i });
    // Only the untouched line gets a delete button -- the partially-sold one never does.
    expect(deleteButtons).toHaveLength(1);
  });

  it("deletes a stock line after confirming, and refreshes the list", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: (code) => code === "delete_stock", isAdminOrSuper: false });
    vi.mocked(stockService.listRecentStockItems)
      .mockResolvedValueOnce([makeItem({ id: "untouched" })])
      .mockResolvedValueOnce([]);
    vi.mocked(stockService.deleteStockItem).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<StockPage />);

    await user.click(await screen.findByRole("button", { name: /delete/i }));
    expect(screen.getByText(/delete this line/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(stockService.deleteStockItem).toHaveBeenCalledWith("untouched"));
    await waitFor(() => expect(stockService.listRecentStockItems).toHaveBeenCalledTimes(2));
  });

  it("shows the server's error when a delete is rejected (e.g. already sold)", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: (code) => code === "delete_stock", isAdminOrSuper: false });
    vi.mocked(stockService.listRecentStockItems).mockResolvedValue([makeItem({ id: "untouched" })]);
    vi.mocked(stockService.deleteStockItem).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Can't delete — some of this stock has already been sold." } },
    });
    const user = userEvent.setup();
    render(<StockPage />);

    await user.click(await screen.findByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(await screen.findByText(/already been sold/i)).toBeInTheDocument();
  });
});
