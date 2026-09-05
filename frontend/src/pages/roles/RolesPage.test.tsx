import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RolesPage from "./RolesPage";
import * as rbacService from "../../services/rbac";
import type { RoleWithPermissionIds } from "../../services/rbac";
import type { Permission } from "../../types";

vi.mock("../../services/rbac");

const permissions: Permission[] = [
  { id: 1, codename: "view_dashboard", label: "View Dashboard", category: "general" },
  { id: 2, codename: "add_stock", label: "Add Stock", category: "stock" },
];

const adminRole: RoleWithPermissionIds = {
  id: "role-admin",
  name: "Admin",
  description: "System administrator",
  permissions: [1, 2],
  isSystemRole: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const newRole: RoleWithPermissionIds = {
  id: "role-new",
  name: "Stocker",
  description: "",
  permissions: [2],
  isSystemRole: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("RolesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rbacService.listRoles).mockResolvedValue([adminRole]);
    vi.mocked(rbacService.listPermissions).mockResolvedValue(permissions);
    vi.mocked(rbacService.createRole).mockResolvedValue(newRole);
  });

  it("creates a role with only the ticked permissions", async () => {
    const user = userEvent.setup();
    render(<RolesPage />);

    await screen.findByText("Admin");
    await user.click(screen.getByRole("button", { name: /new role/i }));

    const [nameInput] = screen.getAllByRole("textbox");
    await user.type(nameInput, "Stocker");
    await user.click(screen.getByLabelText("Add Stock"));

    await user.click(screen.getByRole("button", { name: /save role/i }));

    await waitFor(() => expect(rbacService.createRole).toHaveBeenCalled());
    expect(rbacService.createRole).toHaveBeenCalledWith({
      name: "Stocker",
      description: "",
      permissions: [2],
    });
    expect(await screen.findByText("Stocker")).toBeInTheDocument();
  });

  it("disables deleting a system role", async () => {
    render(<RolesPage />);
    await screen.findByText("Admin");

    const deleteButton = screen.getByRole("button", { name: "Delete Admin" });
    expect(deleteButton).toBeDisabled();
  });
});
