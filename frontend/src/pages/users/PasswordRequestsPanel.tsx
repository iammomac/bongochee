import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  approvePasswordRequest,
  listPendingPasswordRequests,
} from "../../services/passwordRequests";
import type { PasswordChangeRequest } from "../../types";

export function PasswordRequestsPanel() {
  const [requests, setRequests] = useState<PasswordChangeRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [issuedPasswords, setIssuedPasswords] = useState<Record<string, string>>({});

  const load = () => {
    listPendingPasswordRequests()
      .then(setRequests)
      .catch(() => setError("Unable to load password requests"));
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (id: string) => {
    setApprovingId(id);
    try {
      const { temporaryPassword } = await approvePasswordRequest(id);
      setIssuedPasswords((prev) => ({ ...prev, [id]: temporaryPassword }));
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError("Unable to approve this request");
    } finally {
      setApprovingId(null);
    }
  };

  if (!requests.length && !Object.keys(issuedPasswords).length && !error) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <div className="rounded-2xl bg-primary/10 p-2 text-primary">
          <KeyRound size={18} />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Pending password requests</h2>
          <p className="text-sm text-gray-400">Approve to issue a temporary password</p>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      {Object.entries(issuedPasswords).map(([id, temp]) => (
        <div key={id} className="mt-3 rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm">
          Temporary password issued: <span className="font-mono font-semibold">{temp}</span>
          <span className="block text-xs text-gray-500">Share this with the employee out-of-band.</span>
        </div>
      ))}

      {requests.length ? (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {requests.map((req) => (
            <li key={req.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{req.user.fullName || req.user.username}</p>
                {req.reason ? <p className="text-xs text-gray-400">{req.reason}</p> : null}
              </div>
              <button
                onClick={() => void approve(req.id)}
                disabled={approvingId === req.id}
                className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {approvingId === req.id ? "Approving…" : "Approve"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
