import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getStockHistory } from "../services/stock";
import { formatDateTime } from "../lib/dates";
import type { StockItem, StockMovement } from "../types";

interface Props {
  item: StockItem;
  onClose: () => void;
}

/** Every change to one stock line's remaining quantity: when, by how much, why, and who. */
export function StockHistoryModal({ item, onClose }: Props) {
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStockHistory(item.id)
      .then(setMovements)
      .catch(() => setError("Unable to load this line's history"));
  }, [item.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold">
              Stock history — {item.categoryName} {item.modelName}
            </h2>
            <p className="text-xs text-gray-400">
              {item.supplierName} · received {item.importDate} · {item.quantityRemaining} of {item.quantity} left now
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close history"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? <p className="p-5 text-sm text-danger">{error}</p> : null}
          {movements === null && !error ? <p className="p-5 text-sm text-gray-400">Loading…</p> : null}
          {movements && movements.length === 0 ? (
            // Lines received before history was kept have nothing logged until their next change.
            <p className="p-5 text-sm text-gray-400">No changes recorded yet.</p>
          ) : null}
          {movements && movements.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-950">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">What happened</th>
                  <th className="px-4 py-2 text-right">Change</th>
                  <th className="px-4 py-2 text-right">Left after</th>
                  <th className="px-4 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100 align-top dark:border-gray-800">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">{formatDateTime(m.createdAt)}</td>
                    <td className="px-4 py-2">
                      <p>{m.reasonDisplay}</p>
                      {m.reference || m.note ? (
                        <p className="text-xs text-gray-400">{[m.reference, m.note].filter(Boolean).join(" · ")}</p>
                      ) : null}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${m.change > 0 ? "text-success" : "text-danger"}`}>
                      {m.change > 0 ? `+${m.change}` : m.change}
                    </td>
                    <td className="px-4 py-2 text-right">{m.quantityAfter}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{m.userName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}
