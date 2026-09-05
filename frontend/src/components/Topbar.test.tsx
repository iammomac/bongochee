import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Topbar } from "./Topbar";
import { AuthContext } from "../hooks/useAuth";
import * as notificationsService from "../services/notifications";
import * as passwordRequestsService from "../services/passwordRequests";
import type { Notification, User } from "../types";

vi.mock("../services/notifications");
vi.mock("../services/passwordRequests");

const user: User = {
  id: "u1",
  username: "jdoe",
  firstName: "J",
  lastName: "Doe",
  fullName: "J Doe",
  phone: "255700000000",
  role: null,
  isActive: true,
  isActiveEmployee: true,
  isSuperuser: false,
  mustChangePassword: false,
};

function renderTopbar() {
  return render(
    <AuthContext.Provider
      value={{ user, isLoading: false, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() }}
    >
      <MemoryRouter>
        <Topbar onMenuClick={vi.fn()} />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("Topbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.mocked(notificationsService.listNotifications).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("greets the user by name and time of day (morning)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 8, 30));
    renderTopbar();
    expect(screen.getByText("Good morning, J Doe")).toBeInTheDocument();
  });

  it("greets the user by time of day (afternoon)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 14, 0));
    renderTopbar();
    expect(screen.getByText("Good afternoon, J Doe")).toBeInTheDocument();
  });

  it("greets the user by time of day (evening)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 19, 0));
    renderTopbar();
    expect(screen.getByText("Good evening, J Doe")).toBeInTheDocument();
  });

  it("renders the 24-hour time and DD/MM/YY date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 28, 14, 5));
    renderTopbar();
    expect(screen.getByText(/14:05/)).toBeInTheDocument();
    expect(screen.getByText(/28\/07\/26/)).toBeInTheDocument();
  });

  it("toggles dark mode and persists the preference", async () => {
    const clickUser = userEvent.setup();
    renderTopbar();

    const toggle = screen.getByRole("button", { name: /toggle dark mode/i });
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await clickUser.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("bongochee-theme")).toBe("dark");

    await clickUser.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("bongochee-theme")).toBe("light");
  });

  it("shows an unread badge when there are unread notifications", async () => {
    const notifications: Notification[] = [
      {
        id: "n1",
        notificationType: "low_stock",
        title: "Low stock",
        message: "Only 2 left",
        link: "/stock",
        isRead: false,
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(notificationsService.listNotifications).mockResolvedValue(notifications);
    vi.mocked(passwordRequestsService.requestPasswordChange).mockResolvedValue(undefined as never);
    renderTopbar();

    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("shows no badge when all notifications are read", async () => {
    vi.mocked(notificationsService.listNotifications).mockResolvedValue([
      {
        id: "n1",
        notificationType: "low_stock",
        title: "Low stock",
        message: "",
        link: "/stock",
        isRead: true,
        createdAt: new Date().toISOString(),
      },
    ]);
    renderTopbar();

    await waitFor(() => expect(notificationsService.listNotifications).toHaveBeenCalled());
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
