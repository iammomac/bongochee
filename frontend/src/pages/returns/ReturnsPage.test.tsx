import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReturnsPage from "./ReturnsPage";
import * as returnsService from "../../services/returns";
import { usePermissions } from "../../hooks/usePermissions";
import type { ReturnRecord } from "../../types";

vi.mock("../../services/returns");
vi.mock("../../hooks/usePermissions");

function makeReturn(overrides: Partial<ReturnRecord> = {}): ReturnRecord {
  return {
    id: "ret-1",
    saleItem: "item-1",
    imei: "111111111111111",
    invoiceNumber: "INV-1",
    customerName: "Amina Yusuf",
    categoryName: "Samsung",
    modelName: "Galaxy A56",
    returnDate: "2026-01-05",
    returnCategory: "battery",
    returnCategoryDisplay: "Battery",
    description: "Battery drains fast",
    status: "pending",
    processedBy: "u1",
    photos: [],
    createdAt: "2026-01-05T00:00:00Z",
    ...overrides,
  };
}

describe("ReturnsPage editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(returnsService.listRecentReturns).mockResolvedValue([makeReturn()]);
  });

  it("hides the edit action without edit_returns permission", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: () => false, isAdminOrSuper: false });
    render(<ReturnsPage />);
    await screen.findByText("INV-1");
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("opens the edit modal pre-filled with the return's current values", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    const user = userEvent.setup();
    render(<ReturnsPage />);

    await user.click(await screen.findByRole("button", { name: /edit/i }));

    expect(screen.getByDisplayValue("2026-01-05")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Battery drains fast")).toBeInTheDocument();
  });

  it("saves edits with updateReturn and refreshes the list", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    vi.mocked(returnsService.updateReturn).mockResolvedValue(makeReturn({ description: "Updated" }));
    const user = userEvent.setup();
    render(<ReturnsPage />);

    await user.click(await screen.findByRole("button", { name: /edit/i }));
    const description = screen.getByDisplayValue("Battery drains fast");
    await user.clear(description);
    await user.type(description, "Updated");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(returnsService.updateReturn).toHaveBeenCalledWith("ret-1", {
        returnDate: "2026-01-05",
        returnCategory: "battery",
        description: "Updated",
      }),
    );
    await waitFor(() => expect(returnsService.listRecentReturns).toHaveBeenCalledTimes(2));
  });
});
