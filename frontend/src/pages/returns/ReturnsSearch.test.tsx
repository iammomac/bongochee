import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReturnsPage from "./ReturnsPage";
import * as returnsService from "../../services/returns";
import { usePermissions } from "../../hooks/usePermissions";
import type { SaleItemLookupResult } from "../../types";

vi.mock("../../services/returns");
vi.mock("../../hooks/usePermissions");

function sold(id: string, customerName: string, overrides: Partial<SaleItemLookupResult> = {}): SaleItemLookupResult {
  return {
    id,
    imei: `IMEI-${id}`,
    invoiceNumber: `INV-${id}`,
    customerName,
    customerPhone: "255711000000",
    categoryName: "Samsung",
    modelName: "Galaxy S23 Ultra",
    saleDate: "2026-09-10T09:15:00+03:00",
    soldByName: "Amina Seller",
    ...overrides,
  };
}

async function openSearch() {
  const user = userEvent.setup();
  render(<ReturnsPage />);
  await user.click(await screen.findByRole("button", { name: /add return/i }));
  return user;
}

describe("Returns search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    vi.mocked(returnsService.listRecentReturns).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists every sale of a model so the customer can be picked from it", async () => {
    vi.mocked(returnsService.lookupSaleItem).mockResolvedValue([sold("1", "Juma Ali"), sold("2", "Neema Said")]);
    const user = await openSearch();

    await user.type(screen.getByPlaceholderText(/phone model/i), "s23 u{Enter}");

    expect(returnsService.lookupSaleItem).toHaveBeenCalledWith("s23 u");
    const list = (await screen.findByText(/2 matching sales/)).closest(".card") as HTMLElement;
    expect(within(list).getByText("Juma Ali")).toBeInTheDocument();
    expect(within(list).getByText("Neema Said")).toBeInTheDocument();
    // Each row says which phone, its IMEI and who sold it, so identical models can be told apart.
    expect(within(list).getAllByText(/Galaxy S23 Ultra/)).toHaveLength(2);
    expect(within(list).getByText(/IMEI-1/)).toBeInTheDocument();
    expect(within(list).getAllByText(/Sold by Amina Seller/)).toHaveLength(2);

    await user.click(within(list).getByText("Neema Said"));
    expect(await screen.findByText("INV-2", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record return|submit|save/i })).toBeInTheDocument();
  });

  it("opens the sale straight away when only one matches", async () => {
    vi.mocked(returnsService.lookupSaleItem).mockResolvedValue([sold("1", "Juma Ali")]);
    const user = await openSearch();

    await user.type(screen.getByPlaceholderText(/phone model/i), "juma{Enter}");

    expect(await screen.findByText("INV-1", { selector: "p" })).toBeInTheDocument();
  });

  it("warns when the list is full, so the person knows to narrow the search", async () => {
    const many = Array.from({ length: 30 }, (_, i) => sold(String(i), `Buyer ${i}`));
    vi.mocked(returnsService.lookupSaleItem).mockResolvedValue(many);
    const user = await openSearch();

    await user.type(screen.getByPlaceholderText(/phone model/i), "s23{Enter}");

    expect(await screen.findByText(/Showing the 30 most recent matches/)).toBeInTheDocument();
    expect(screen.getByText("Buyer 29")).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    vi.mocked(returnsService.lookupSaleItem).mockResolvedValue([]);
    const user = await openSearch();

    await user.type(screen.getByPlaceholderText(/phone model/i), "pixel{Enter}");

    expect(await screen.findByText("No matching sale found")).toBeInTheDocument();
  });

  it("starts the return date on the viewer's own day, not the UTC day", async () => {
    // 01:30 local on 19 Sep -- still "yesterday" in UTC for anyone ahead of UTC.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 19, 1, 30));
    vi.mocked(returnsService.lookupSaleItem).mockResolvedValue([sold("1", "Juma Ali")]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ReturnsPage />);
    await user.click(await screen.findByRole("button", { name: /add return/i }));
    await user.type(screen.getByPlaceholderText(/phone model/i), "juma{Enter}");

    await waitFor(() => expect(screen.getByDisplayValue("2026-09-19")).toBeInTheDocument());
  });
});
