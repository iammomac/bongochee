import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  updateSupplier,
  type SupplierInput,
} from "../../services/suppliers";
import { extractErrorMessage } from "../../lib/errors";
import type { Supplier } from "../../types";

const blankInput: SupplierInput = { name: "", phone: "", address: "", email: "", notes: "" };

function SupplierFields({
  value,
  onChange,
}: {
  value: SupplierInput;
  onChange: (value: SupplierInput) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
        <input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
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
        <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
        <input
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Address</label>
        <input
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
        />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={2}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
        />
      </div>
    </div>
  );
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newSupplier, setNewSupplier] = useState<SupplierInput>(blankInput);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<SupplierInput>(blankInput);

  const load = () => {
    listSuppliers()
      .then(setSuppliers)
      .catch(() => setError("Unable to load suppliers"));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createSupplier(newSupplier);
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSupplier(blankInput);
      setCreating(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to create this supplier"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setEditValue({
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
      email: supplier.email,
      notes: supplier.notes,
    });
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSupplier(id, editValue);
      setSuppliers((prev) => prev.map((s) => (s.id === id ? updated : s)));
      setEditingId(null);
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to update this supplier"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteSupplier(id);
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to delete this supplier"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Suppliers</h1>
          <p className="text-sm text-gray-400">Manage partner relationships and import history</p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white"
        >
          {creating ? <X size={16} /> : <Plus size={16} />}
          {creating ? "Cancel" : "New supplier"}
        </button>
      </div>

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}

      {creating ? (
        <div className="card space-y-4 p-6">
          <SupplierFields value={newSupplier} onChange={setNewSupplier} />
          <div className="flex justify-end">
            <button
              onClick={() => void handleCreate()}
              disabled={saving || !newSupplier.name.trim()}
              className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save supplier"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) =>
              editingId === supplier.id ? (
                <tr key={supplier.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td colSpan={4} className="px-4 py-4">
                    <SupplierFields value={editValue} onChange={setEditValue} />
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => void handleUpdate(supplier.id)}
                        disabled={saving}
                        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={supplier.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3">{supplier.name}</td>
                  <td className="px-4 py-3">{supplier.phone || "—"}</td>
                  <td className="px-4 py-3">{supplier.email || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => startEdit(supplier)}
                        className="rounded-full p-1.5 text-gray-400 hover:bg-primary/10 hover:text-primary"
                        aria-label={`Edit ${supplier.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => void handleDelete(supplier.id)}
                        className="rounded-full p-1.5 text-gray-400 hover:bg-danger/10 hover:text-danger"
                        aria-label={`Delete ${supplier.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  No suppliers yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
