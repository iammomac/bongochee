import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage";
import * as dashboardService from "../../services/dashboard";
import { usePermissions } from "../../hooks/usePermissions";
import type { DashboardSummary } from "../../services/dashboard";

vi.mock("../../services/dashboard");
vi.mock("../../hooks/usePermissions");

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function baseSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    todaysSales: 0,
    todaysProfit: 0,
    todaysReturns: 0,
    remainingStock: 0,
    totalStockValue: 0,
    lowStock: 0,
    outOfStock: 0,
    pendingReturns: 0,
    pendingPasswordRequests: 0,
    revenueTrend: [],
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage priority items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue({ has: () => false, isAdminOrSuper: false });
  });

  it("shows 'all caught up' when nothing needs attention", async () => {
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValue(baseSummary());
    renderDashboard();
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument();
  });

  it("surfaces real low-stock, out-of-stock, and pending-return counts", async () => {
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValue(
      baseSummary({ lowStock: 3, outOfStock: 1, pendingReturns: 2 }),
    );
    renderDashboard();
    expect(await screen.findByText("1 phone model out of stock")).toBeInTheDocument();
    expect(screen.getByText("3 phone models low on stock")).toBeInTheDocument();
    expect(screen.getByText("2 returns awaiting review")).toBeInTheDocument();
  });

  it("hides the password-request queue without manage_users permission", async () => {
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValue(
      baseSummary({ pendingPasswordRequests: 5 }),
    );
    renderDashboard();
    await screen.findByText(/all caught up/i);
    expect(screen.queryByText(/password reset request/i)).not.toBeInTheDocument();
  });

  it("shows the password-request queue with manage_users permission, and navigates to it on click", async () => {
    vi.mocked(usePermissions).mockReturnValue({ has: () => true, isAdminOrSuper: true });
    vi.mocked(dashboardService.getDashboardSummary).mockResolvedValue(
      baseSummary({ pendingPasswordRequests: 5 }),
    );
    const user = userEvent.setup();
    renderDashboard();

    const item = await screen.findByText("5 password reset requests pending");
    await user.click(item);
    expect(mockNavigate).toHaveBeenCalledWith("/users");
  });
});
