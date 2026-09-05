import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "../../components/Select";
import { listActivityLogsPage } from "../../services/activitylog";
import { listUsers } from "../../services/users";
import { extractErrorMessage } from "../../lib/errors";
import type { ActivityLogEntry, User } from "../../types";

const PAGE_SIZE = 25;

function formatDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details ?? {});
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ");
}

export default function ActivityLogPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listActivityLogsPage({
      user: userFilter,
      action: actionFilter,
      dateFrom,
      dateTo,
      page,
    })
      .then((data) => {
        setEntries(data.results);
        setCount(data.count ?? data.results.length);
        setHasNext(Boolean(data.next));
        setHasPrevious(Boolean(data.previous));
      })
      .catch((err) => setError(extractErrorMessage(err, "Unable to load activity logs")))
      .finally(() => setLoading(false));
  }, [userFilter, actionFilter, dateFrom, dateTo, page]);

  const userName = (id: string | null) => {
    if (!id) return "System";
    return users.find((u) => u.id === id)?.fullName || users.find((u) => u.id === id)?.username || id;
  };

  const resetToFirstPage = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity log</h1>
        <p className="text-sm text-gray-400">Audit trail of logins, sales, stock, and permission events</p>
      </div>

      <div className="card grid gap-3 p-4 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Employee</label>
          <Select value={userFilter} onChange={resetToFirstPage(setUserFilter)}>
            <option value="">All employees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName || u.username}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Action</label>
          <input
            value={actionFilter}
            onChange={(e) => resetToFirstPage(setActionFilter)(e.target.value)}
            placeholder="e.g. login, sale.create"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => resetToFirstPage(setDateFrom)(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => resetToFirstPage(setDateTo)(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
          />
        </div>
      </div>

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}

      <div className="card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950">
            <tr>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-4 py-3 capitalize">{entry.action.replace(/[._]/g, " ")}</td>
                <td className="px-4 py-3">{userName(entry.user)}</td>
                <td className="max-w-xs truncate px-4 py-3 text-xs text-gray-500" title={formatDetails(entry.details)}>
                  {formatDetails(entry.details)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{entry.ipAddress ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{new Date(entry.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!loading && entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  No activity found
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm dark:border-gray-800">
          <span className="text-xs text-gray-400">
            {count > 0 ? `Page ${page} of ${totalPages} — ${count} entries` : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!hasPrevious || loading}
              className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-40 dark:border-gray-800 dark:text-gray-300"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || loading}
              className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-40 dark:border-gray-800 dark:text-gray-300"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
