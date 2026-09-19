import { useEffect, useState } from "react";
import { UserMinus, X } from "lucide-react";
import { Select } from "../../components/Select";
import { listPeople, shareNote, unshareNote } from "../../services/notes";
import { extractErrorMessage } from "../../lib/errors";
import type { Note, NotePerson, NoteSharePermission } from "../../types";

const PERMISSION_LABELS: Record<NoteSharePermission, string> = {
  edit: "Can edit",
  view: "Can view",
};

interface ShareDialogProps {
  note: Note;
  isOwner: boolean;
  meId: string;
  onChanged: (note: Note) => void;
  onLeft: () => void;
  onClose: () => void;
}

export function ShareDialog({ note, isOwner, meId, onChanged, onLeft, onClose }: ShareDialogProps) {
  const [people, setPeople] = useState<NotePerson[]>([]);
  const [chosen, setChosen] = useState("");
  const [permission, setPermission] = useState<NoteSharePermission>("edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    listPeople()
      .then(setPeople)
      .catch(() => setError("Unable to load the list of people"));
  }, [isOwner]);

  const alreadyHaveAccess = new Set(note.shares.map((share) => share.user));
  const candidates = people.filter((person) => !alreadyHaveAccess.has(person.id));

  const run = async (action: () => Promise<Note | null>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      if (updated) onChanged(updated);
      return true;
    } catch (err) {
      setError(extractErrorMessage(err, "Something went wrong — please try again"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!chosen) return;
    const ok = await run(() => shareNote(note.id, { user: chosen, permission }));
    if (ok) setChosen("");
  };

  const handleLeave = async () => {
    const ok = await run(() => unshareNote(note.id, meId));
    if (ok) onLeft();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Share note"
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isOwner ? "Share this note" : "People with access"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={16} />
          </button>
        </div>

        {error ? <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p> : null}

        <ul className="mb-4 space-y-2 text-sm">
          <li className="flex items-center justify-between rounded-xl bg-background px-3 py-2 dark:bg-gray-950">
            <span>{note.ownerName}</span>
            <span className="text-xs text-gray-400">Owner</span>
          </li>
          {note.shares.map((share) => (
            <li
              key={share.user}
              className="flex items-center justify-between gap-2 rounded-xl bg-background px-3 py-2 dark:bg-gray-950"
            >
              <span className="truncate">
                {share.userName}
                {share.user === meId ? " (you)" : ""}
              </span>
              {isOwner ? (
                <div className="flex items-center gap-1">
                  <div className="w-28">
                    <Select
                      value={share.permission}
                      onChange={(value) =>
                        void run(() => shareNote(note.id, { user: share.user, permission: value as NoteSharePermission }))
                      }
                      disabled={busy}
                    >
                      <option value="edit">{PERMISSION_LABELS.edit}</option>
                      <option value="view">{PERMISSION_LABELS.view}</option>
                    </Select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void run(() => unshareNote(note.id, share.user))}
                    disabled={busy}
                    aria-label={`Remove ${share.userName}`}
                    className="rounded-full p-1.5 text-gray-400 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    <UserMinus size={14} />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-400">{PERMISSION_LABELS[share.permission]}</span>
              )}
            </li>
          ))}
          {note.shares.length === 0 ? <li className="text-xs text-gray-400">Not shared with anyone yet</li> : null}
        </ul>

        {isOwner ? (
          <div className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="text-xs font-medium text-gray-500">Add a person</p>
            <Select value={chosen} onChange={setChosen} disabled={busy}>
              <option value="">{candidates.length ? "Choose a person…" : "Everyone already has access"}</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={permission} onChange={(v) => setPermission(v as NoteSharePermission)} disabled={busy}>
                  <option value="edit">{PERMISSION_LABELS.edit} — they can change it</option>
                  <option value="view">{PERMISSION_LABELS.view} — read only</option>
                </Select>
              </div>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={!chosen || busy}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Share
              </button>
            </div>
            <p className="text-xs text-gray-400">They'll get a notification. You can change or remove their access any time.</p>
          </div>
        ) : (
          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <button
              type="button"
              onClick={() => void handleLeave()}
              disabled={busy}
              className="text-sm font-medium text-danger hover:underline disabled:opacity-50"
            >
              Remove from my list
            </button>
            <p className="mt-1 text-xs text-gray-400">
              This only removes it from your notes — {note.ownerName} keeps the note, and can share it with you again.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
