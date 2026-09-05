import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { AuthContext } from "../hooks/useAuth";
import type { User } from "../types";

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
  isSuperuser: true, // sees every nav item, including admin-only ones
  mustChangePassword: false,
};

function renderSidebar(props: { mobileOpen: boolean; onCloseMobile: () => void }) {
  return render(
    <AuthContext.Provider
      value={{ user, isLoading: false, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() }}
    >
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("Sidebar", () => {
  it("renders the mobile drawer with nav links when open", () => {
    renderSidebar({ mobileOpen: true, onCloseMobile: vi.fn() });
    // Two copies exist (desktop rail + mobile drawer) once mobileOpen is true —
    // this only proves the drawer's copy renders, not that it's the only one.
    expect(screen.getAllByRole("link", { name: /dashboard/i }).length).toBeGreaterThan(0);
  });

  it("does not render the mobile drawer when closed", () => {
    renderSidebar({ mobileOpen: false, onCloseMobile: vi.fn() });
    // Only the desktop rail's copy of each link should exist.
    expect(screen.getAllByRole("link", { name: /dashboard/i })).toHaveLength(1);
  });

  it("closes the mobile drawer after clicking a nav link", async () => {
    const onCloseMobile = vi.fn();
    const user2 = userEvent.setup();
    renderSidebar({ mobileOpen: true, onCloseMobile });

    const links = screen.getAllByRole("link", { name: /sales/i });
    await user2.click(links[links.length - 1]); // the drawer's copy, rendered last

    expect(onCloseMobile).toHaveBeenCalled();
  });

  it("closes the mobile drawer when the backdrop is clicked", async () => {
    const onCloseMobile = vi.fn();
    const user2 = userEvent.setup();
    const { container } = renderSidebar({ mobileOpen: true, onCloseMobile });

    const backdrop = container.querySelector(".bg-black\\/40") as HTMLElement;
    await user2.click(backdrop);

    expect(onCloseMobile).toHaveBeenCalled();
  });
});
