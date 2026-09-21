import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReturnsPage from "./ReturnsPage";
import * as returnsService from "../../services/returns";
import { usePermissions } from "../../hooks/usePermissions";
import type { ReturnCategory, ReturnRecord, SaleItemLookupResult } from "../../types";

vi.mock("../../services/returns");
vi.mock("../../hooks/usePermissions");

const category = (id: string, name: string): ReturnCategory => ({ id, name, createdAt: "" });
const BATTERY = category("cat-battery", "Battery");
const CAMERA = category("cat-camera", "Camera");

const sale: SaleItemLookupResult = {
  id: "item-1",
  imei: "111111111111111",
  invoiceNumber: "INV-1",
  customerName: "Juma Ali",
  customerPhone: "255711000000",
  categoryName: "Samsung",
  modelName: "Galaxy S23",
  saleDate: "2026-09-10T09:15:00+03:00",
  soldByName: "Amina Seller",
};

function existingReturn(overrides: Partial<ReturnRecord> = {}): ReturnRecord {
  return {
    id: "ret-1",
    saleItem: "item-1",
    imei: "111111111111111",
    invoiceNumber: "INV-1",
    customerName: "Juma Ali",
    categoryName: "Samsung",
    modelName: "Galaxy S23",
    returnDate: "2026-09-12",
    returnCategory: BATTERY.id,
    returnCategoryDisplay: "Battery",
    description: "Drains fast",
    status: "pending",
    processedBy: "u1",
    photos: [],
    createdAt: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

async function fileAReturnFor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /add return/i }));
  await user.type(screen.getByPlaceholderText(/phone model/i), "juma{Enter}");
  await screen.findByText("INV-1", { selector: "p" }); // the one match opens straight away
}

describe("Return category on a new return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    vi.mocked(returnsService.listRecentReturns).mockResolvedValue([]);
    vi.mocked(returnsService.lookupSaleItem).mockResolvedValue([sale]);
    vi.mocked(returnsService.searchReturnCategories).mockResolvedValue([BATTERY, CAMERA]);
    vi.mocked(returnsService.createReturn).mockResolvedValue(existingReturn());
  });

  it("offers the existing categories to choose from, and files the return under the chosen one", async () => {
    const user = userEvent.setup();
    render(<ReturnsPage />);
    await fileAReturnFor(user);

    await user.click(screen.getByPlaceholderText("Pick or add a return category…"));
    await user.click(await screen.findByRole("button", { name: "Camera" }));
    await user.click(screen.getByRole("button", { name: /record return/i }));

    await waitFor(() =>
      expect(returnsService.createReturn).toHaveBeenCalledWith(
        expect.objectContaining({ saleItem: "item-1", returnCategory: CAMERA.id }),
      ),
    );
  });

  it("adds a category that isn't in the list, and files the return under it", async () => {
    const created = category("cat-water", "Water damage");
    vi.mocked(returnsService.getOrCreateReturnCategory).mockResolvedValue(created);
    const user = userEvent.setup();
    render(<ReturnsPage />);
    await fileAReturnFor(user);

    await user.type(screen.getByPlaceholderText("Pick or add a return category…"), "Water damage");
    await user.click(await screen.findByRole("button", { name: /create "water damage"/i }));

    expect(returnsService.getOrCreateReturnCategory).toHaveBeenCalledWith("Water damage");
    await user.click(screen.getByRole("button", { name: /record return/i }));
    await waitFor(() =>
      expect(returnsService.createReturn).toHaveBeenCalledWith(expect.objectContaining({ returnCategory: "cat-water" })),
    );
  });

  it("doesn't offer to add a name that already exists", async () => {
    const user = userEvent.setup();
    render(<ReturnsPage />);
    await fileAReturnFor(user);

    await user.type(screen.getByPlaceholderText("Pick or add a return category…"), "battery");

    await screen.findByRole("button", { name: "Battery" });
    expect(screen.queryByRole("button", { name: /create/i })).not.toBeInTheDocument();
  });

  it("won't record the return until a category is chosen", async () => {
    render(<ReturnsPage />);
    await fileAReturnFor(userEvent.setup());

    expect(screen.getByRole("button", { name: /record return/i })).toBeDisabled();
    expect(returnsService.createReturn).not.toHaveBeenCalled();
  });
});

describe("Return category when editing a return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    vi.mocked(returnsService.listRecentReturns).mockResolvedValue([existingReturn()]);
    vi.mocked(returnsService.searchReturnCategories).mockResolvedValue([BATTERY, CAMERA]);
    vi.mocked(returnsService.updateReturn).mockResolvedValue(existingReturn());
  });

  it("starts on the return's current category", async () => {
    const user = userEvent.setup();
    render(<ReturnsPage />);
    await user.click(await screen.findByRole("button", { name: /edit/i }));

    expect(screen.getByDisplayValue("Battery")).toBeInTheDocument();
  });

  it("moves the return to another category", async () => {
    const user = userEvent.setup();
    render(<ReturnsPage />);
    await user.click(await screen.findByRole("button", { name: /edit/i }));

    await user.click(screen.getByDisplayValue("Battery"));
    await user.click(await screen.findByRole("button", { name: "Camera" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(returnsService.updateReturn).toHaveBeenCalledWith("ret-1", expect.objectContaining({ returnCategory: CAMERA.id })),
    );
  });

  it("keeps the current category when nothing else about it is touched", async () => {
    const user = userEvent.setup();
    render(<ReturnsPage />);
    await user.click(await screen.findByRole("button", { name: /edit/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(returnsService.updateReturn).toHaveBeenCalledWith("ret-1", expect.objectContaining({ returnCategory: BATTERY.id })),
    );
  });
});
