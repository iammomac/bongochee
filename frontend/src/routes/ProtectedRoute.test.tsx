import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";
import { AuthContext } from "../hooks/useAuth";
import type { PermissionCode, Role, User } from "../types";

function baseUser(overrides: Partial<User> = {}): User {
  return {
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
    ...overrides,
  };
}

function roleWith(overrides: Partial<Role>): Role {
  return { id: "r1", name: "Custom", description: "", permissions: [], isSystemRole: false, ...overrides };
}

function renderProtected(
  user: User | null,
  routeProps: { requires?: PermissionCode | PermissionCode[]; adminOnly?: boolean } = {},
) {
  return render(
    <AuthContext.Provider
      value={{ user, isLoading: false, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() }}
    >
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/force-password-change" element={<div>Force Password Change</div>} />
          <Route path="/403" element={<div>Forbidden</div>} />
          <Route element={<ProtectedRoute {...routeProps} />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ProtectedRoute", () => {
  it("redirects to /login when there is no user", () => {
    renderProtected(null);
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("redirects to /force-password-change when the user must change password", () => {
    renderProtected(baseUser({ mustChangePassword: true }));
    expect(screen.getByText("Force Password Change")).toBeInTheDocument();
  });

  it("redirects to /403 when a permission requirement isn't met", () => {
    renderProtected(baseUser({ role: roleWith({ permissions: ["view_dashboard"] }) }), {
      requires: "manage_suppliers",
    });
    expect(screen.getByText("Forbidden")).toBeInTheDocument();
  });

  it("renders the route when the permission requirement is met", () => {
    renderProtected(baseUser({ role: roleWith({ permissions: ["manage_suppliers"] }) }), {
      requires: "manage_suppliers",
    });
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("adminOnly denies a custom role even if it holds manage_users as a permission", () => {
    renderProtected(baseUser({ role: roleWith({ permissions: ["manage_users"], isSystemRole: false }) }), {
      adminOnly: true,
    });
    expect(screen.getByText("Forbidden")).toBeInTheDocument();
  });

  it("adminOnly allows a system role regardless of its permission list", () => {
    renderProtected(baseUser({ role: roleWith({ permissions: [], isSystemRole: true }) }), { adminOnly: true });
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("adminOnly allows a superuser with no role at all", () => {
    renderProtected(baseUser({ isSuperuser: true, role: null }), { adminOnly: true });
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });
});
