import { useEffect, useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { PasswordRequestsPanel } from "./PasswordRequestsPanel";
import { Select } from "../../components/Select";
import { createUser, listUsers, updateUser, type UserInput } from "../../services/users";
import { listRoles, type RoleWithPermissionIds } from "../../services/rbac";
import { extractErrorMessage } from "../../lib/errors";
import type { User } from "../../types";

const blankInput: UserInput = {
  username: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  role: "",
  isActive: true,
  isActiveEmployee: true,
  password: "",
};

function UserFormFields({
  value,
  onChange,
  roles,
  isEdit,
}: {
  value: UserInput;
  onChange: (value: UserInput) => void;
  roles: RoleWithPermissionIds[];
  isEdit: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Username</label>
        <input
          value={value.username}
          disabled={isEdit}
          onChange={(e) => onChange({ ...value, username: e.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:disabled:bg-gray-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Phone</label>
        <input
          value={value.phone}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">First name</label>
        <input
          value={value.firstName}
          onChange={(e) => onChange({ ...value, firstName: e.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Last name</label>
        <input
          value={value.lastName}
          onChange={(e) => onChange({ ...value, lastName: e.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
        <input
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Role</label>
        <Select value={value.role ?? ""} onChange={(v) => onChange({ ...value, role: v })}>
          <option value="">No role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          {isEdit ? "New password (leave blank to keep current)" : "Temporary password"}
        </label>
        <input
          type="text"
          value={value.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
        />
      </div>
      <div className="flex items-center gap-4 pt-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.isActive}
            onChange={(e) => onChange({ ...value, isActive: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          Active account
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.isActiveEmployee}
            onChange={(e) => onChange({ ...value, isActiveEmployee: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          Active employee
        </label>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleWithPermissionIds[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState<UserInput>(blankInput);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<UserInput>(blankInput);

  const load = () => {
    Promise.all([listUsers(), listRoles()])
      .then(([u, r]) => {
        setUsers(u);
        setRoles(r);
      })
      .catch(() => setError("Unable to load users"));
  };

  useEffect(() => {
    load();
  }, []);

  const buildPayload = (input: UserInput): UserInput => {
    // Omit an empty password entirely rather than sending "" — the backend
    // treats presence of the field as "set a new password".
    const { password, ...rest } = input;
    return password ? input : (rest as UserInput);
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createUser(buildPayload(newUser));
      setUsers((prev) => [...prev, created]);
      setNewUser(blankInput);
      setCreating(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to create this user"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEditValue({
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      email: user.email ?? "",
      role: user.role?.id ?? "",
      isActive: user.isActive,
      isActiveEmployee: user.isActiveEmployee,
      password: "",
    });
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUser(id, buildPayload(editValue));
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      setEditingId(null);
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to update this user"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: User) => {
    setError(null);
    try {
      const updated = await updateUser(user.id, { isActive: !user.isActive });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to update this user"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-gray-400">Admin-managed employees and account lifecycle</p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white"
        >
          {creating ? <X size={16} /> : <Plus size={16} />}
          {creating ? "Cancel" : "Add user"}
        </button>
      </div>

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}

      {creating ? (
        <div className="card space-y-4 p-6">
          <UserFormFields value={newUser} onChange={setNewUser} roles={roles} isEdit={false} />
          <div className="flex justify-end">
            <button
              onClick={() => void handleCreate()}
              disabled={saving || !newUser.username.trim() || !newUser.phone.trim()}
              className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save user"}
            </button>
          </div>
        </div>
      ) : null}

      <PasswordRequestsPanel />

      <div className="card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) =>
              editingId === user.id ? (
                <tr key={user.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td colSpan={4} className="px-4 py-4">
                    <UserFormFields value={editValue} onChange={setEditValue} roles={roles} isEdit />
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => void handleUpdate(user.id)}
                        disabled={saving}
                        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={user.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3">{user.fullName || user.username}</td>
                  <td className="px-4 py-3">{user.role?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        user.isActive ? "bg-success/10 text-success" : "bg-gray-100 text-gray-500 dark:bg-gray-800"
                      }`}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => startEdit(user)}
                        className="rounded-full p-1.5 text-gray-400 hover:bg-primary/10 hover:text-primary"
                        aria-label={`Edit ${user.username}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => void toggleActive(user)}
                        className="rounded-xl border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        {user.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  No users yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
