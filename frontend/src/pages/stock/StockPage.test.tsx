import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StockPage from "./StockPage";
import * as stockService from "../../services/stock";
import { usePermissions } from "../../hooks/usePermissions";
import type { StockItem } from "../../types";

vi.mock("../../services/stock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/stock")>()),
  listStockItems: vi.fn(),
  updateStockItem: vi.fn(),
  deleteStockItem: vi.fn(),
  createStockIn: vi.fn(),
  importStockExcel: vi.fn(),
  downloadStockImportTemplate: vi.fn(),
}));
vi.mock("../../hooks/usePermissions");
// The pickers search the server as you type; the edit form only needs to show what is chosen.
vi.mock("../../components/CategoryPicker", () => ({
  CategoryPicker: ({ value }: { value: { name: string } | null }) => <div>Brand: {value?.name}</div>,
}));
vi.mock("../../components/ModelPicker", () => ({
  ModelPicker: ({ value }: { value: { name: string } | null }) => <div>Model: {value?.name}</div>,
}));
vi.mock("../../components/SupplierPicker", () => ({
  SupplierPicker: ({ value }: { value: { name: string } | null }) => <div>Supplier: {value?.name}</div>,
}));

function makeItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: "item-1",
    category: "cat-1",
    categoryName: "Samsung",
    model: "model-1",
    modelName: "Galaxy A56",
    supplier: "sup-1",
    supplierName: "Blue Telecom",
    importDate: "2026-01-01",
    invoiceNumber: "INV-1",
    batchSize: 1,
    quantity: 5,
    quantityRemaining: 5,
    buyingPrice: 500000,
    minSellingPrice: 600000,
    maxSellingPrice: 700000,
    notes: "",
    ...overrides,
  };
}

const page = (items: StockItem[], count = items.length) => ({ items, count });

function asRole(...codes: string[]) {
  vi.mocked(usePermissions).mockReturnValue({ has: (code) => [code].flat().some((c) => codes.includes(c)), isAdminOrSuper: false });
}

describe("StockPage recent stock table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a stock line's notes, and a dash when there are none", async () => {
    asRole();
    vi.mocked(stockService.listStockItems).mockResolvedValue(
      page([makeItem({ id: "item-1", notes: "Full box, unused" }), makeItem({ id: "item-2", notes: "" })]),
    );
    render(<StockPage />);

    expect(await screen.findByText("Full box, unused")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("offers delete only for an untouched line, and only with delete_stock permission", async () => {
    asRole("delete_stock");
    vi.mocked(stockService.listStockItems).mockResolvedValue(
      page([
        makeItem({ id: "untouched", quantity: 5, quantityRemaining: 5 }),
        makeItem({ id: "partially-sold", quantity: 5, quantityRemaining: 3 }),
      ]),
    );
    render(<StockPage />);

    await waitFor(() => expect(stockService.listStockItems).toHaveBeenCalled());
    const deleteButtons = await screen.findAllByRole("button", { name: /delete/i });
    // Only the untouched line gets a delete button -- the partially-sold one never does.
    expect(deleteButtons).toHaveLength(1);
  });

  it("deletes a stock line after confirming, and refreshes the list", async () => {
    asRole("delete_stock");
    vi.mocked(stockService.listStockItems)
      .mockResolvedValueOnce(page([makeItem({ id: "untouched" })]))
      .mockResolvedValueOnce(page([]));
    vi.mocked(stockService.deleteStockItem).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<StockPage />);

    await user.click(await screen.findByRole("button", { name: /delete/i }));
    expect(screen.getByText(/delete this line/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(stockService.deleteStockItem).toHaveBeenCalledWith("untouched"));
    await waitFor(() => expect(stockService.listStockItems).toHaveBeenCalledTimes(2));
  });

  it("shows the server's error when a delete is rejected (e.g. already sold)", async () => {
    asRole("delete_stock");
    vi.mocked(stockService.listStockItems).mockResolvedValue(page([makeItem({ id: "untouched" })]));
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

  it("shows when each line arrived, how many were received and how many are left", async () => {
    asRole();
    vi.mocked(stockService.listStockItems).mockResolvedValue(
      page([makeItem({ quantity: 10, quantityRemaining: 4, importDate: "2026-09-01" })]),
    );
    render(<StockPage />);

    expect(await screen.findByText("01 Sep 2026")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Received" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "In stock" })).toBeInTheDocument();
    const row = screen.getByText("Galaxy A56").closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toContain("10");
    expect(cells).toContain("4");
  });
});

describe("StockPage by role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stockService.listStockItems).mockResolvedValue(page([makeItem()]));
  });

  it("gives a role with only Edit Stock the list and Edit, but no intake form", async () => {
    asRole("edit_stock");
    render(<StockPage />);

    expect(await screen.findByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save batch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /import from excel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("shows the intake form to a role that can add stock, and no Edit without edit_stock", async () => {
    asRole("add_stock");
    render(<StockPage />);

    expect(await screen.findByRole("button", { name: /save batch/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });
});

describe("Editing a stock line", () => {
  // 10 received, 4 sold, 6 in stock -- in a delivery shared with 3 other lines.
  const line = () => makeItem({ quantity: 10, quantityRemaining: 6, batchSize: 4, notes: "boxed" });

  async function openEditor(item = line()) {
    asRole("edit_stock");
    vi.mocked(stockService.listStockItems).mockResolvedValue(page([item]));
    const user = userEvent.setup();
    render(<StockPage />);
    await user.click(await screen.findByRole("button", { name: /edit/i }));
    return user;
  }

  const quantityInput = () => screen.getByLabelText("Quantity received");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens with the line's current values, including its delivery details", async () => {
    await openEditor();

    expect(quantityInput()).toHaveValue(10);
    expect(screen.getByDisplayValue("boxed")).toBeInTheDocument();
    expect(screen.getByText("Supplier: Blue Telecom")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-01-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("INV-1")).toBeInTheDocument();
  });

  it("shows how many will be in stock after the quantity changes", async () => {
    const user = await openEditor();
    expect(screen.getByText(/4 already sold, so 6 will be in stock after saving \(now 6\)/)).toBeInTheDocument();

    await user.clear(quantityInput());
    await user.type(quantityInput(), "15");

    expect(screen.getByText(/4 already sold, so 11 will be in stock after saving \(now 6\)/)).toBeInTheDocument();
  });

  it("stops a quantity lower than what was already sold", async () => {
    const user = await openEditor();

    await user.clear(quantityInput());
    await user.type(quantityInput(), "3");

    expect(screen.getByText(/can't be less than 4 — that many are already sold/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
  });

  it("warns that a price change also changes profit on what was already sold", async () => {
    await openEditor();
    expect(screen.getByText(/changes the profit shown for the 4 already sold/i)).toBeInTheDocument();
  });

  it("warns that delivery details apply to every line in the delivery", async () => {
    await openEditor();
    expect(screen.getByText(/shared by all 4 lines received together/i)).toBeInTheDocument();
  });

  it("does not mention a shared delivery when the line is on its own", async () => {
    await openEditor(makeItem({ batchSize: 1 }));
    expect(screen.queryByText(/received together/i)).not.toBeInTheDocument();
  });

  it("saves the changes, then refreshes the list", async () => {
    vi.mocked(stockService.updateStockItem).mockResolvedValue(makeItem());
    const user = await openEditor();

    await user.clear(quantityInput());
    await user.type(quantityInput(), "15");
    fireEvent.change(screen.getByDisplayValue("2026-01-01"), { target: { value: "2026-01-05" } });
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(stockService.updateStockItem).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({
          category: "cat-1",
          model: "model-1",
          quantity: 15,
          buyingPrice: 500000,
          minSellingPrice: 600000,
          maxSellingPrice: 700000,
          notes: "boxed",
          supplier: "sup-1",
          importDate: "2026-01-05",
          invoiceNumber: "INV-1",
        }),
      ),
    );
    await waitFor(() => expect(stockService.listStockItems).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Edit stock item")).not.toBeInTheDocument();
  });

  it("shows the server's reason when a save is refused, and keeps the form open", async () => {
    vi.mocked(stockService.updateStockItem).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Galaxy A56 isn't a Apple model." } },
    });
    const user = await openEditor();

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/isn't a Apple model/)).toBeInTheDocument();
    expect(screen.getByText("Edit stock item")).toBeInTheDocument();
  });
});

describe("Searching and paging the stock list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asRole("edit_stock");
  });

  it("searches as you type (after a short pause) from the first page", async () => {
    vi.mocked(stockService.listStockItems).mockResolvedValue(page([makeItem()]));
    const user = userEvent.setup();
    render(<StockPage />);
    await screen.findByText("Galaxy A56");

    await user.type(screen.getByLabelText("Search stock"), "s23");

    await waitFor(() => expect(stockService.listStockItems).toHaveBeenLastCalledWith({ search: "s23", page: 1 }));
  });

  it("says so when a search finds nothing", async () => {
    vi.mocked(stockService.listStockItems).mockResolvedValueOnce(page([makeItem()])).mockResolvedValue(page([]));
    const user = userEvent.setup();
    render(<StockPage />);
    await screen.findByText("Galaxy A56");

    await user.type(screen.getByLabelText("Search stock"), "nokia");

    expect(await screen.findByText("No stock matches your search")).toBeInTheDocument();
  });

  it("pages through older stock, so no line is out of reach", async () => {
    const many = (start: number, n: number) =>
      Array.from({ length: n }, (_, i) => makeItem({ id: `i${start + i}`, modelName: `Model ${start + i}` }));
    vi.mocked(stockService.listStockItems).mockImplementation(async ({ page: p = 1 } = {}) =>
      p === 1 ? page(many(1, 25), 40) : page(many(26, 15), 40),
    );
    const user = userEvent.setup();
    render(<StockPage />);

    expect(await screen.findByText("Showing 1–25 of 40")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Showing 26–40 of 40")).toBeInTheDocument();
    expect(screen.getByText("Model 40")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(stockService.listStockItems).toHaveBeenLastCalledWith({ search: "", page: 2 });
  });
});
