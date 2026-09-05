import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsersPage from "./UsersPage";
import * as usersService from "../../services/users";
import * as rbacService from "../../services/rbac";
import * as passwordRequestsService from "../../services/passwordRequests";
import type { RoleWithPermissionIds } from "../../services/rbac";
import type { Role, User } from "../../types";

vi.mock("../../services/users");
vi.mock("../../services/rbac");
vi.mock("../../services/passwordRequests");

// The Users page's role dropdown is populated from listRoles() (RoleWithPermissionIds —
// numeric permission ids), which is a different shape from the codename-string Role
// embedded in User.role (RoleSummarySerializer) — see services/rbac.ts's comment.
const roleForDropdown: RoleWithPermissionIds = {
  id: "role-1",
  name: "Seller",
  description: "",
  permissions: [],
  isSystemRole: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const userRole: Role = {
  id: "role-1",
  name: "Seller",
  description: "",
  permissions: [],
  isSystemRole: false,
};

const existingUser: User = {
  id: "user-1",
  username: "jdoe",
  firstName: "J",
  lastName: "Doe",
  fullName: "J Doe",
  phone: "255700000000",
  email: "",
  role: userRole,
  isActive: true,
  isActiveEmployee: true,
  isSuperuser: false,
  mustChangePassword: false,
};

describe("UsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersService.listUsers).mockResolvedValue([existingUser]);
    vi.mocked(rbacService.listRoles).mockResolvedValue([roleForDropdown]);
    vi.mocked(passwordRequestsService.listPendingPasswordRequests).mockResolvedValue([]);
  });

  it("creates a user without a password key in the payload when the password field is left blank", async () => {
    const user = userEvent.setup();
    vi.mocked(usersService.createUser).mockResolvedValue({
      ...existingUser,
      id: "user-2",
      username: "newperson",
      fullName: "",
    });
    render(<UsersPage />);

    await screen.findByText("J Doe");
    await user.click(screen.getByRole("button", { name: /add user/i }));

    const [usernameInput, phoneInput] = screen.getAllByRole("textbox");
    await user.type(usernameInput, "newperson");
    await user.type(phoneInput, "255700000099");
    // Password field is deliberately left untouched.

    await user.click(screen.getByRole("button", { name: /save user/i }));

    await waitFor(() => expect(usersService.createUser).toHaveBeenCalled());
    const payload = vi.mocked(usersService.createUser).mock.calls[0][0];
    expect(payload).not.toHaveProperty("password");
    expect(payload.username).toBe("newperson");
  });

  it("includes the password key when a new password is actually typed", async () => {
    const user = userEvent.setup();
    vi.mocked(usersService.createUser).mockResolvedValue({ ...existingUser, id: "user-3" });
    render(<UsersPage />);

    await screen.findByText("J Doe");
    await user.click(screen.getByRole("button", { name: /add user/i }));

    const [usernameInput, phoneInput, , , , passwordInput] = screen.getAllByRole("textbox");
    await user.type(usernameInput, "newperson2");
    await user.type(phoneInput, "255700000098");
    await user.type(passwordInput, "TempPass123!");

    await user.click(screen.getByRole("button", { name: /save user/i }));

    await waitFor(() => expect(usersService.createUser).toHaveBeenCalled());
    const payload = vi.mocked(usersService.createUser).mock.calls[0][0];
    expect(payload.password).toBe("TempPass123!");
  });

  it("editing an existing user without touching the password field omits it from the update payload", async () => {
    const user = userEvent.setup();
    vi.mocked(usersService.updateUser).mockResolvedValue({ ...existingUser, firstName: "Janet" });
    render(<UsersPage />);

    await screen.findByText("J Doe");
    await user.click(screen.getByRole("button", { name: "Edit jdoe" }));

    const [, , firstNameInput] = screen.getAllByRole("textbox");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Janet");

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(usersService.updateUser).toHaveBeenCalled());
    const [, payload] = vi.mocked(usersService.updateUser).mock.calls[0];
    expect(payload).not.toHaveProperty("password");
    expect(payload.firstName).toBe("Janet");
  });
});
