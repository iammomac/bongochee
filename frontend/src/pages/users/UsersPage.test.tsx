import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsersPage from "./UsersPage";
import * as usersService from "../../services/users";
import * as rbacService from "../../services/rbac";
import * as passwordRequestsService from "../../services/passwordRequests";
import { useAuth } from "../../hooks/useAuth";
import type { RoleWithPermissionIds } from "../../services/rbac";
import type { Role, User } from "../../types";

vi.mock("../../services/users");
vi.mock("../../services/rbac");
vi.mock("../../services/passwordRequests");
vi.mock("../../hooks/useAuth");

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

// Who's signed in -- the page uses this to know which delete buttons make sense.
function signInAs(overrides: Partial<User> = {}) {
  const me: User = { ...existingUser, id: "me-1", username: "boss", fullName: "The Boss", ...overrides };
  vi.mocked(useAuth).mockReturnValue({ user: me } as never);
}

const adminRole: Role = { ...userRole, id: "role-admin", name: "Admin", isSystemRole: true };

describe("UsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInAs({ isSuperuser: true });
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

  describe("deleting a user", () => {
    it("deletes after an inline confirm and drops the row", async () => {
      vi.mocked(usersService.deleteUser).mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<UsersPage />);

      await user.click(await screen.findByRole("button", { name: "Delete jdoe" }));
      expect(screen.getByText("Delete jdoe?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(usersService.deleteUser).toHaveBeenCalledWith("user-1"));
      await waitFor(() => expect(screen.queryByText("J Doe")).not.toBeInTheDocument());
    });

    it("does nothing if you cancel the confirm", async () => {
      const user = userEvent.setup();
      render(<UsersPage />);

      await user.click(await screen.findByRole("button", { name: "Delete jdoe" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(usersService.deleteUser).not.toHaveBeenCalled();
      expect(screen.getByText("J Doe")).toBeInTheDocument();
    });

    it("shows the server's reason and keeps the user when the delete is refused", async () => {
      vi.mocked(usersService.deleteUser).mockRejectedValue({
        isAxiosError: true,
        response: {
          data: { detail: "Can't delete jdoe -- they have 12 sales on record. Deactivate the account instead to keep that history." },
        },
      });
      const user = userEvent.setup();
      render(<UsersPage />);

      await user.click(await screen.findByRole("button", { name: "Delete jdoe" }));
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      expect(await screen.findByText(/12 sales on record/)).toBeInTheDocument();
      expect(screen.getByText("J Doe")).toBeInTheDocument();
    });

    it("offers no delete for your own account or for the super admin", async () => {
      signInAs({ id: "user-1", username: "jdoe", isSuperuser: false, role: adminRole });
      vi.mocked(usersService.listUsers).mockResolvedValue([
        existingUser, // that's "me"
        { ...existingUser, id: "user-9", username: "theowner", fullName: "The Owner", isSuperuser: true },
      ]);
      render(<UsersPage />);

      await screen.findByText("The Owner");
      expect(screen.queryByRole("button", { name: "Delete jdoe" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete theowner" })).not.toBeInTheDocument();
    });

    it("lets only the super admin delete another Admin account", async () => {
      const otherAdmin: User = { ...existingUser, id: "user-5", username: "admin2", fullName: "Admin Two", role: adminRole };
      vi.mocked(usersService.listUsers).mockResolvedValue([otherAdmin]);

      signInAs({ isSuperuser: false, role: adminRole }); // a plain admin
      const { unmount } = render(<UsersPage />);
      await screen.findByText("Admin Two");
      expect(screen.queryByRole("button", { name: "Delete admin2" })).not.toBeInTheDocument();
      unmount();

      signInAs({ isSuperuser: true });
      render(<UsersPage />);
      expect(await screen.findByRole("button", { name: "Delete admin2" })).toBeInTheDocument();
    });
  });
});
