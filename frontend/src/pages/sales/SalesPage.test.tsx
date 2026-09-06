import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SalesPage from "./SalesPage";
import * as salesService from "../../services/sales";
import { usePermissions } from "../../hooks/usePermissions";
import type { AvailablePhone, Sale } from "../../types";

vi.mock("../../services/sales");
// SalesPage reads usePermissions() (for the "edit sale" gate) which otherwise
// needs a real AuthProvider ancestor — mocked directly rather than wrapping
// every render() call, matching how services/sales is already mocked above.
vi.mock("../../hooks/usePermissions");

const phone: AvailablePhone = {
  id: "stock-1",
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
  name: "Samsung Galaxy A56",
};

const mockSale: Sale = {
  id: "sale-1",
  invoiceNumber: "INV-1",
  customerName: "Walk-in",
  customerPhone: "",
  paymentMethod: "cash",
  notes: "",
  items: [
    {
      id: "item-1",
      stockItem: phone.id,
      modelName: phone.modelName,
      categoryName: phone.categoryName,
      imei: "111111111111111",
      sellingPrice: 650000,
      discount: 20000,
    },
  ],
  soldBy: "u1",
  soldByName: "Seller",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("SalesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salesService.listRecentSales).mockResolvedValue([]);
    vi.mocked(salesService.searchAvailableStock).mockResolvedValue([phone]);
    vi.mocked(salesService.createSale).mockResolvedValue(mockSale);
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
  });

  it("adds a phone at a bargained price with a discount and submits the sale with the net breakdown", async () => {
    const user = userEvent.setup();
    render(<SalesPage />);

    // Fill the sale header — customerName is required, invoiceNumber is auto-filled.
    const [customerNameInput] = screen.getAllByRole("textbox");
    await user.type(customerNameInput, "Amina Yusuf");

    // Search and select the phone via the debounced (250ms) combobox — real timers,
    // findByRole polls until the mocked search resolves and the result renders.
    const searchInput = screen.getByPlaceholderText(/search by category or model/i);
    await user.click(searchInput);
    await user.type(searchInput, "Galaxy");
    const resultButton = await screen.findByRole("button", { name: "Samsung Galaxy A56" });
    await user.click(resultButton);

    // Soldprice defaults to the asking (max) price — bargain it down and apply a discount,
    // exactly the "seller can insert the bargained sell price ... plus discount" flow.
    const [, soldPriceInput, discountInput] = screen.getAllByRole("spinbutton");
    await user.clear(soldPriceInput);
    await user.type(soldPriceInput, "650000");
    await user.type(discountInput, "20000");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const imeiInput = screen.getByPlaceholderText(/IMEI #1/i);
    await user.type(imeiInput, "111111111111111");
    await user.click(screen.getByRole("button", { name: /add to sale/i }));

    // The cart shows the net price, and the receipt never sees the batch's own asking
    // price — only what the customer actually paid and any discount, per the sale
    // module's redesign.
    expect(screen.getByText("Samsung Galaxy A56")).toBeInTheDocument();
    expect(screen.getByText(/discount: tzs 20,000/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /complete sale/i }));

    await waitFor(() => expect(salesService.createSale).toHaveBeenCalled());
    expect(salesService.createSale).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: "Amina Yusuf",
        items: [
          expect.objectContaining({
            stockItem: "stock-1",
            imei: "111111111111111",
            sellingPrice: 650000,
            discount: 20000,
          }),
        ],
      }),
    );
  }, 15000);

  it("rejects an IMEI that isn't exactly 15 digits", async () => {
    const user = userEvent.setup();
    render(<SalesPage />);

    const searchInput = screen.getByPlaceholderText(/search by category or model/i);
    await user.click(searchInput);
    await user.type(searchInput, "Galaxy");
    const resultButton = await screen.findByRole("button", { name: "Samsung Galaxy A56" });
    await user.click(resultButton);

    await user.click(screen.getByRole("button", { name: /continue/i }));
    const imeiInput = screen.getByPlaceholderText(/IMEI #1/i);
    await user.type(imeiInput, "123");
    await user.click(screen.getByRole("button", { name: /add to sale/i }));

    expect(screen.getByText(/each imei must be exactly 15 digits/i)).toBeInTheDocument();
    expect(screen.queryByText("Samsung Galaxy A56", { selector: "p.text-gray-800" })).not.toBeInTheDocument();
  });

  it("accepts a phone with no IMEI entered", async () => {
    const user = userEvent.setup();
    render(<SalesPage />);

    const [customerNameInput] = screen.getAllByRole("textbox");
    await user.type(customerNameInput, "Amina Yusuf");

    const searchInput = screen.getByPlaceholderText(/search by category or model/i);
    await user.click(searchInput);
    await user.type(searchInput, "Galaxy");
    const resultButton = await screen.findByRole("button", { name: "Samsung Galaxy A56" });
    await user.click(resultButton);

    await user.click(screen.getByRole("button", { name: /continue/i }));
    // IMEI field left untouched entirely.
    await user.click(screen.getByRole("button", { name: /add to sale/i }));

    expect(screen.getByText("Samsung Galaxy A56")).toBeInTheDocument();
    expect(screen.queryByText(/each imei must be exactly 15 digits/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /complete sale/i }));

    await waitFor(() => expect(salesService.createSale).toHaveBeenCalled());
    expect(salesService.createSale).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ stockItem: "stock-1", imei: "" })],
      }),
    );
  }, 15000);
});
