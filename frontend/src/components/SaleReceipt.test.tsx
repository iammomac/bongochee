import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SaleReceipt } from "./SaleReceipt";
import type { Sale } from "../types";

const sale: Sale = {
  id: "s1",
  invoiceNumber: "INV-1",
  customerName: "Walk-in",
  customerPhone: "",
  paymentMethod: "cash",
  notes: "",
  items: [{ id: "i1", stockItem: "st1", categoryName: "Samsung", modelName: "A56", imei: "123", sellingPrice: 650000, discount: 0 }],
  soldBy: "u1",
  soldByName: "Dealer",
  createdAt: "2026-11-10T10:00:00Z",
};

describe("SaleReceipt", () => {
  it("offers WhatsApp even without a customer phone, opening the contact picker", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<SaleReceipt sale={sale} onClose={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /send via whatsapp/i }));
    const url = decodeURIComponent(String(open.mock.calls[0][0]));
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).toContain("Total: TZS 650,000");
    expect(screen.getByRole("button", { name: /copy text/i })).toBeInTheDocument();
    open.mockRestore();
  });
});
