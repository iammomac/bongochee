import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search, Upload, X } from "lucide-react";
import { Select } from "../../components/Select";
import { useDropdownPosition } from "../../hooks/useDropdownPosition";
import {
  createReturn,
  listRecentReturns,
  lookupSaleItem,
  updateReturnStatus,
  uploadReturnPhoto,
} from "../../services/returns";
import { extractErrorMessage } from "../../lib/errors";
import { usePermissions } from "../../hooks/usePermissions";
import type { ReturnCategory, ReturnRecord, ReturnStatus, SaleItemLookupResult } from "../../types";

const RETURN_CATEGORIES: { value: ReturnCategory; label: string }[] = [
  { value: "display", label: "Display" },
  { value: "battery", label: "Battery" },
  { value: "charging", label: "Charging" },
  { value: "camera", label: "Camera" },
  { value: "speaker", label: "Speaker" },
  { value: "software", label: "Software" },
  { value: "network", label: "Network" },
  { value: "other", label: "Other" },
];

const RETURN_STATUSES: ReturnStatus[] = ["pending", "processing", "resolved", "cancelled"];

const STATUS_STYLES: Record<ReturnStatus, string> = {
  pending: "bg-warning/10 text-warning",
  processing: "bg-primary/10 text-primary",
  resolved: "bg-success/10 text-success",
  cancelled: "bg-danger/10 text-danger",
};

function StatusSelect({ value, onChange }: { value: ReturnStatus; onChange: (status: ReturnStatus) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Stable identity — see the matching comment in components/Select.tsx.
  const close = useCallback(() => setOpen(false), []);
  // Portaled + fixed-positioned rather than absolute — this dropdown sits inside a
  // table wrapped in an overflow-hidden card, which was clipping/hiding it entirely.
  const panelStyle = useDropdownPosition(triggerRef, open, close);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-full py-1.5 pl-3 pr-2 text-xs font-medium capitalize ${STATUS_STYLES[value]}`}
      >
        {value}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              style={{ ...panelStyle, width: "8rem" }}
              className="z-50 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900"
            >
              {RETURN_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onChange(s);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium capitalize hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    s === value ? "text-primary" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {s}
                  {s === value ? <Check size={12} /> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default function ReturnsPage() {
  const { has } = usePermissions();
  const canEdit = has("edit_returns");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SaleItemLookupResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<SaleItemLookupResult | null>(null);

  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnCategory, setReturnCategory] = useState<ReturnCategory>("battery");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [recentReturns, setRecentReturns] = useState<ReturnRecord[]>([]);

  const loadRecentReturns = () => {
    listRecentReturns()
      .then(setRecentReturns)
      .catch(() => setError("Unable to load recent returns"));
  };

  useEffect(() => {
    loadRecentReturns();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setSelected(null);
    try {
      const found = await lookupSaleItem(query.trim());
      setResults(found);
      setSearched(true);
      if (found.length === 1) setSelected(found[0]);
    } catch {
      setError("Unable to search");
    } finally {
      setSearching(false);
    }
  };

  const resetForm = () => {
    setSelected(null);
    setQuery("");
    setResults([]);
    setSearched(false);
    setReturnDate(new Date().toISOString().slice(0, 10));
    setReturnCategory("battery");
    setDescription("");
    setPhotos([]);
  };

  const handleCancel = () => {
    resetForm();
    setShowAddPanel(false);
  };

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createReturn({
        saleItem: selected.id,
        returnDate,
        returnCategory,
        description,
      });
      for (const file of photos) {
        await uploadReturnPhoto(created.id, file);
      }
      setSuccessMessage("Return recorded");
      resetForm();
      loadRecentReturns();
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to record this return"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: ReturnStatus) => {
    try {
      await updateReturnStatus(id, status);
      loadRecentReturns();
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to update status"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Returns</h1>
          <p className="text-sm text-gray-400">
            Search by IMEI, invoice, or customer and review the return request
          </p>
        </div>
        <button
          type="button"
          onClick={() => (showAddPanel ? handleCancel() : setShowAddPanel(true))}
          className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          {showAddPanel ? <X size={16} /> : <Plus size={16} />}
          {showAddPanel ? "Close" : "Add return"}
        </button>
      </div>

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}
      {successMessage ? <div className="card p-4 text-sm text-success">{successMessage}</div> : null}

      {showAddPanel ? (
        <div className="card p-4">
          <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-background px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
            <Search size={16} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
              placeholder="Search by IMEI, invoice number, or customer name"
              className="w-full bg-transparent text-sm outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={searching}
              className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </div>
      ) : null}

      {showAddPanel && searched && results.length === 0 ? (
        <div className="card p-4 text-sm text-gray-400">No matching sale found</div>
      ) : null}

      {showAddPanel && results.length > 1 ? (
        <div className="card divide-y divide-gray-100 overflow-hidden dark:divide-gray-800">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => setSelected(result)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                selected?.id === result.id ? "bg-primary/5" : ""
              }`}
            >
              <span>
                {result.categoryName} {result.modelName} — {result.customerName}
              </span>
              <span className="text-xs text-gray-400">{result.invoiceNumber}</span>
            </button>
          ))}
        </div>
      ) : null}

      {showAddPanel && selected ? (
        <>
          <div className="card p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-background p-4 dark:bg-gray-950">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Customer</p>
                <p className="mt-2 font-semibold">{selected.customerName}</p>
                <p className="text-xs text-gray-400">{selected.customerPhone}</p>
              </div>
              <div className="rounded-2xl bg-background p-4 dark:bg-gray-950">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Phone</p>
                <p className="mt-2 font-semibold">
                  {selected.categoryName} {selected.modelName}
                </p>
                <p className="text-xs text-gray-400">IMEI: {selected.imei || "—"}</p>
              </div>
              <div className="rounded-2xl bg-background p-4 dark:bg-gray-950">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Sale</p>
                <p className="mt-2 font-semibold">{selected.invoiceNumber}</p>
                <p className="text-xs text-gray-400">
                  {new Date(selected.saleDate).toLocaleDateString()} · Sold by {selected.soldByName}
                </p>
              </div>
            </div>
          </div>

          <div className="card space-y-4 p-6">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Return date</label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Return category</label>
                <Select value={returnCategory} onChange={(v) => setReturnCategory(v as ReturnCategory)}>
                  {RETURN_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Photos</label>
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 hover:border-primary hover:text-primary dark:border-gray-700">
                <Upload size={14} />
                Add photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => setPhotos((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                />
              </label>
              {photos.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {photos.map((file, i) => (
                    <div key={i} className="relative">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="h-16 w-16 rounded-xl object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -right-1 -top-1 rounded-full bg-danger p-0.5 text-white"
                        aria-label="Remove photo"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 dark:border-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Record return"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div className="card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">IMEI</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {recentReturns.map((ret) => (
              <tr key={ret.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-4 py-3">{ret.invoiceNumber}</td>
                <td className="px-4 py-3">{ret.customerName}</td>
                <td className="px-4 py-3">
                  {ret.categoryName} {ret.modelName}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{ret.imei || "—"}</td>
                <td className="px-4 py-3">{ret.returnCategoryDisplay}</td>
                <td className="px-4 py-3">{new Date(ret.returnDate).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {canEdit ? (
                    <StatusSelect
                      value={ret.status}
                      onChange={(status) => void handleStatusChange(ret.id, status)}
                    />
                  ) : (
                    <span
                      className={`rounded-full px-2.5 py-1.5 text-xs font-medium capitalize ${STATUS_STYLES[ret.status]}`}
                    >
                      {ret.status}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {recentReturns.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  No returns recorded yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
