import { useEffect, useMemo, useState } from "react";
import { ShieldPlus, Pencil, Trash2, X } from "lucide-react";
import {
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  updateRole,
  type RoleInput,
  type RoleWithPermissionIds,
} from "../../services/rbac";
import { extractErrorMessage } from "../../lib/errors";
import type { Permission } from "../../types";

const blankInput: RoleInput = { name: "", description: "", permissions: [] };

function RoleFormFields({
  value,
  onChange,
  permissionsByCategory,
}: {
  value: RoleInput;
  onChange: (value: RoleInput) => void;
  permissionsByCategory: [string, Permission[]][];
}) {
  const togglePermission = (id: number) => {
    const has = value.permissions.includes(id);
    onChange({
      ...value,
      permissions: has ? value.permissions.filter((p) => p !== id) : [...value.permissions, id],
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Role name</label>
          <input
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>
          <input
            value={value.description}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-gray-500">What can this role do?</p>
        <div className="grid gap-4 md:grid-cols-2">
          {permissionsByCategory.map(([category, perms]) => (
            <div key={category} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{category}</p>
              <div className="space-y-1.5">
                {perms.map((perm) => (
                  <label key={perm.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={value.permissions.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleWithPermissionIds[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState<RoleInput>(blankInput);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<RoleInput>(blankInput);

  const load = () => {
    Promise.all([listRoles(), listPermissions()])
      .then(([r, p]) => {
        setRoles(r);
        setPermissions(p);
      })
      .catch(() => setError("Unable to load roles"));
  };

  useEffect(() => {
    load();
  }, []);

  const permissionsByCategory = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const perm of permissions) {
      const category = perm.category || "general";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(perm);
    }
    return Array.from(groups.entries());
  }, [permissions]);

  const permissionLabel = (id: number) => permissions.find((p) => p.id === id)?.label ?? String(id);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createRole(newRole);
      setRoles((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewRole(blankInput);
      setCreating(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to create this role"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (role: RoleWithPermissionIds) => {
    setEditingId(role.id);
    setEditValue({ name: role.name, description: role.description, permissions: role.permissions });
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateRole(id, editValue);
      setRoles((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditingId(null);
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to update this role"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role: RoleWithPermissionIds) => {
    if (role.isSystemRole) return;
    setError(null);
    try {
      await deleteRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to delete this role"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Roles &amp; permissions</h1>
          <p className="text-sm text-gray-400">Admin-managed dynamic roles with per-permission control</p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white"
        >
          {creating ? <X size={16} /> : <ShieldPlus size={16} />}
          {creating ? "Cancel" : "New role"}
        </button>
      </div>

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}

      {creating ? (
        <div className="card space-y-4 p-6">
          <RoleFormFields value={newRole} onChange={setNewRole} permissionsByCategory={permissionsByCategory} />
          <div className="flex justify-end">
            <button
              onClick={() => void handleCreate()}
              disabled={saving || !newRole.name.trim()}
              className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save role"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) =>
          editingId === role.id ? (
            <div key={role.id} className="card space-y-4 p-5 md:col-span-2 xl:col-span-3">
              <RoleFormFields value={editValue} onChange={setEditValue} permissionsByCategory={permissionsByCategory} />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleUpdate(role.id)}
                  disabled={saving}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div key={role.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-400">Role</p>
                  <p className="mt-1 text-xl font-semibold">{role.name}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => startEdit(role)}
                    className="rounded-full p-1.5 text-gray-400 hover:bg-primary/10 hover:text-primary"
                    aria-label={`Edit ${role.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => void handleDelete(role)}
                    disabled={role.isSystemRole}
                    title={role.isSystemRole ? "System roles cannot be deleted" : undefined}
                    className="rounded-full p-1.5 text-gray-400 hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                    aria-label={`Delete ${role.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {role.description ? <p className="mt-2 text-sm text-gray-500">{role.description}</p> : null}
              <p className="mt-3 text-xs text-gray-400">
                {role.permissions.length === 0
                  ? "No permissions"
                  : role.permissions.map(permissionLabel).join(", ")}
              </p>
            </div>
          ),
        )}
        {roles.length === 0 ? <div className="card p-8 text-center text-sm text-gray-400">No roles yet</div> : null}
      </div>
    </div>
  );
}
