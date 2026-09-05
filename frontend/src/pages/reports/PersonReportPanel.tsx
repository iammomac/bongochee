import { useEffect, useState } from "react";
import { Select } from "../../components/Select";
import { listUsers } from "../../services/users";
import { getPersonReport } from "../../services/reports";
import { listActivityLogsForUser } from "../../services/activitylog";
import type { ActivityLogEntry, PersonReport, User } from "../../types";

const currency = (value: number) => new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);

interface Props {
  dateFrom: string;
  dateTo: string;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

export function PersonReportPanel({ dateFrom, dateTo }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [report, setReport] = useState<PersonReport | null>(null);
  const [timeline, setTimeline] = useState<ActivityLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch(() => setError("Unable to load employees"));
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setReport(null);
      setTimeline([]);
      return;
    }
    setError(null);
    getPersonReport(selectedUserId, { dateFrom, dateTo })
      .then(setReport)
      .catch(() => setError("Unable to load this employee's report"));
    listActivityLogsForUser(selectedUserId)
      .then(setTimeline)
      .catch(() => setTimeline([]));
  }, [selectedUserId, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="mb-1 block text-xs font-medium text-gray-500">Employee</label>
        <div className="max-w-sm">
          <Select value={selectedUserId} onChange={setSelectedUserId}>
            <option value="">Select an employee…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName || u.username}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}

      {report ? (
        <>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Stock batches added" value={report.stockAdded.batches} />
            <StatCard label="Stock quantity added" value={report.stockAdded.quantity} />
            <StatCard label="Sales made" value={report.salesMade.units} />
            <StatCard label="Revenue" value={`TZS ${currency(report.salesMade.revenue)}`} />
            <StatCard label="Returns processed" value={report.returnsProcessed} />
          </div>
          {report.salesMade.profit !== undefined ? (
            <div className="card p-5">
              <p className="text-sm text-gray-400">Profit generated</p>
              <p className="mt-2 text-2xl font-semibold">TZS {currency(report.salesMade.profit)}</p>
            </div>
          ) : null}

          <div className="card p-6">
            <h2 className="text-lg font-semibold">Activity timeline</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {timeline.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-800"
                >
                  <span className="capitalize text-gray-700 dark:text-gray-200">
                    {entry.action.replace(/[._]/g, " ")}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleString()}</span>
                </li>
              ))}
              {timeline.length === 0 ? <li className="text-gray-400">No activity recorded</li> : null}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
