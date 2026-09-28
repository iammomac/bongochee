import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SalesPage from "./SalesPage";
import { SaleReceipt } from "../../components/SaleReceipt";
import * as salesService from "../../services/sales";
import { usePermissions } from "../../hooks/usePermissions";
import type { Sale } from "../../types";

vi.mock("../../services/sales");
vi.mock("../../hooks/usePermissions");

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: "sale-1",
    invoiceNumber: "INV-1",
    customerName: "Juma Ali",
    customerPhone: "255711000000",
    paymentMethod: "cash",
    notes: "",
    items: [
      { id: "item-1", stockItem: "stock-1", modelName: "Galaxy A56", categoryName: "Samsung", imei: "111111111111111", sellingPrice: 650000, discount: 20000 },
      { id: "item-2", stockItem: "stock-2", modelName: "Galaxy S23", categoryName: "Samsung", imei: null, sellingPrice: 900000, discount: 0 },
    ],
    soldBy: "u1",
    soldByName: "Amina Seller",
    createdAt: "2026-09-10T09:15:00+03:00",
    ...overrides,
  };
}

describe("SaleReceipt layout", () => {
  it("keeps the buttons fixed and lets the receipt itself scroll when it is taller than the window", () => {
    const manyPhones = Array.from({ length: 30 }, (_, i) => ({
      id: `i${i}`, stockItem: "s", modelName: `Model ${i}`, categoryName: "Samsung", imei: null, sellingPrice: 100000, discount: 0,
    }));
    render(<SaleReceipt sale={makeSale({ items: manyPhones })} onClose={() => {}} />);

    const panel = document.querySelector(".receipt") as HTMLElement;
    const scroller = document.querySelector(".receipt-scroll") as HTMLElement;
    expect(panel.className).toContain("max-h-full"); // never taller than the window
    expect(panel.className).toContain("flex-col");
    expect(scroller.className).toContain("overflow-y-auto"); // the receipt scrolls...
    expect(scroller.contains(screen.getByText(/Model 29/))).toBe(true); // ...with every phone inside it
    // ...while the action buttons sit outside the scrolling part, so they never scroll away.
    expect(scroller.contains(screen.getByRole("button", { name: /print/i }))).toBe(false);
    expect(scroller.contains(screen.getByRole("button", { name: /close/i }))).toBe(false);
  });

  it("shows Edit sale only when it is given a way to edit", () => {
    const { rerender } = render(<SaleReceipt sale={makeSale()} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /edit sale/i })).not.toBeInTheDocument();

    const onEdit = vi.fn();
    rerender(<SaleReceipt sale={makeSale()} onClose={() => {}} onEdit={onEdit} />);
    expect(screen.getByRole("button", { name: /edit sale/i })).toBeInTheDocument();
  });
});

describe("Editing a sale from its receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    vi.mocked(salesService.listRecentSales).mockResolvedValue([makeSale()]);
    vi.mocked(salesService.searchAvailableStock).mockResolvedValue([]);
  });

  const openReceipt = async () => {
    const user = userEvent.setup();
    render(<SalesPage />);
    await user.click(await screen.findByRole("button", { name: /view receipt/i }));
    return user;
  };

  it("offers Edit sale on the receipt to someone who may edit sales, and not to anyone else", async () => {
    await openReceipt();
    expect(screen.getByRole("button", { name: /edit sale/i })).toBeInTheDocument();
  });

  it("does not offer it without edit_sales", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: (code) => code !== "edit_sales", isAdminOrSuper: false });
    await openReceipt();
    expect(screen.getByText("Thank you for shopping with BONGO CHEE")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit sale/i })).not.toBeInTheDocument();
  });

  it("opens the edit form for that sale, and Cancel goes back to the receipt", async () => {
    const user = await openReceipt();
    await user.click(screen.getByRole("button", { name: /edit sale/i }));

    expect(screen.getByText("Edit sale — INV-1")).toBeInTheDocument();
    expect(screen.queryByText("Thank you for shopping with BONGO CHEE")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Edit sale — INV-1")).not.toBeInTheDocument();
    expect(screen.getByText("Thank you for shopping with BONGO CHEE")).toBeInTheDocument();
  });

  it("saves the change, then shows the updated receipt", async () => {
    const updated = makeSale({
      customerName: "Juma Ali Hassan",
      items: [
        { id: "item-1", stockItem: "stock-1", modelName: "Galaxy A56", categoryName: "Samsung", imei: "333333333333333", sellingPrice: 640000, discount: 20000 },
        { id: "item-2", stockItem: "stock-2", modelName: "Galaxy S23", categoryName: "Samsung", imei: null, sellingPrice: 900000, discount: 0 },
      ],
    });
    vi.mocked(salesService.updateSale).mockResolvedValue(updated);
    const user = await openReceipt();
    await user.click(screen.getByRole("button", { name: /edit sale/i }));

    await user.clear(screen.getByDisplayValue("Juma Ali"));
    await user.type(screen.getByLabelText("Customer name"), "Juma Ali Hassan");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(salesService.updateSale).toHaveBeenCalledWith("sale-1", expect.objectContaining({ customerName: "Juma Ali Hassan" })),
    );
    // Back on the receipt, now showing the saved figures.
    expect(await screen.findByText("Thank you for shopping with BONGO CHEE")).toBeInTheDocument();
    expect(screen.getByText("Juma Ali Hassan")).toBeInTheDocument();
    expect(screen.getByText("IMEI: 333333333333333")).toBeInTheDocument();
    expect(screen.queryByText("Edit sale — INV-1")).not.toBeInTheDocument();
    expect(salesService.listRecentSales).toHaveBeenCalledTimes(2); // the list was refreshed too
  });

  it("lets a wrong IMEI be corrected, and clearing it sends nothing", async () => {
    vi.mocked(salesService.updateSale).mockResolvedValue(makeSale());
    const user = await openReceipt();
    await user.click(screen.getByRole("button", { name: /edit sale/i }));

    const first = screen.getByLabelText("IMEI for Samsung Galaxy A56");
    expect(first).toHaveValue("111111111111111");
    await user.clear(first);
    await user.type(first, "444444444444444");
    // The S23 has no IMEI recorded: its box is empty and stays that way.
    expect(screen.getByLabelText("IMEI for Samsung Galaxy S23")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(salesService.updateSale).toHaveBeenCalled());
    const payload = vi.mocked(salesService.updateSale).mock.calls[0][1];
    expect(payload.items.map((item) => item.imei)).toEqual(["444444444444444", null]);
  });

  it("shows the server's reason (e.g. the IMEI is already on another sale) and stays on the form", async () => {
    vi.mocked(salesService.updateSale).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "IMEI 999999999999999 is already recorded against another sale" } },
    });
    const user = await openReceipt();
    await user.click(screen.getByRole("button", { name: /edit sale/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/already recorded against another sale/)).toBeInTheDocument();
    expect(screen.getByText("Edit sale — INV-1")).toBeInTheDocument();
  });

  it("still edits from the table as before, and closing that form doesn't pop a receipt open", async () => {
    const user = userEvent.setup();
    render(<SalesPage />);
    const row = (await screen.findByText("INV-1")).closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /^edit$/i }));
    expect(screen.getByText("Edit sale — INV-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Thank you for shopping with BONGO CHEE")).not.toBeInTheDocument();
  });
});
