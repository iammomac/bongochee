import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { ArrowLeft, Pin, PinOff, Share2, Trash2, Users } from "lucide-react";
import { ShareDialog } from "./ShareDialog";
import { deleteNote, getNote, pinNote, updateNote } from "../../services/notes";
import { extractErrorMessage } from "../../lib/errors";
import { formatDateTime } from "../../lib/dates";
import type { Note } from "../../types";

export const AUTOSAVE_DELAY_MS = 800;
// How often an open note checks whether someone else has changed it.
export const REMOTE_REFRESH_MS = 10_000;
const RETRY_AFTER_ERROR_MS = 5_000;

type SaveState = "idle" | "saving" | "saved" | "error";

interface NoteEditorProps {
  noteId: string;
  meId: string;
  // Called with the latest server copy after any save/pin/share, so the list pane stays current.
  onChanged: (note: Note) => void;
  // The note was deleted, or this person can no longer open it.
  onGone: (noteId: string) => void;
  // Lets the page discard a brand-new note that was never written in.
  onContent: (noteId: string, isEmptyAndMine: boolean) => void;
  onBack: () => void;
}

export function NoteEditor({ noteId, meId, onChanged, onGone, onContent, onBack }: NoteEditorProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [conflict, setConflict] = useState<Note | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // The autosave loop reads the latest values from refs rather than state so a save
  // fired by a timer never uses a stale closure.
  const titleRef = useRef("");
  const bodyRef = useRef("");
  const versionRef = useRef("");
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const conflictRef = useRef<Note | null>(null);
  const canEditRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onChanged, onGone, onContent });
  callbacks.current = { onChanged, onGone, onContent };

  const isOwner = note?.myAccess === "owner";
  const canEdit = note?.myAccess === "owner" || note?.myAccess === "edit";
  canEditRef.current = Boolean(canEdit);

  const reportContent = useCallback(
    (owner: boolean) => {
      callbacks.current.onContent(noteId, owner && !titleRef.current.trim() && !bodyRef.current.trim());
    },
    [noteId],
  );

  // Replace what's on screen with a server copy (first load, or someone else's newer version).
  const adopt = useCallback(
    (incoming: Note) => {
      titleRef.current = incoming.title;
      bodyRef.current = incoming.body;
      versionRef.current = incoming.updatedAt;
      dirtyRef.current = false;
      setNote(incoming);
      setTitle(incoming.title);
      setBody(incoming.body);
      reportContent(incoming.myAccess === "owner");
    },
    [reportContent],
  );

  const gone = useCallback(() => callbacks.current.onGone(noteId), [noteId]);

  useEffect(() => {
    let cancelled = false;
    getNote(noteId)
      .then((loaded) => {
        if (!cancelled) adopt(loaded);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isAxiosError(err) && (err.response?.status === 404 || err.response?.status === 403)) gone();
        else setLoadError("Unable to open this note");
      });
    return () => {
      cancelled = true;
    };
  }, [noteId, adopt, gone]);

  // schedule() and save() call each other (a save can queue the next one), so the timer
  // goes through a ref to whichever save() is current instead of closing over it.
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const schedule = useCallback((delay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void saveRef.current(), delay);
  }, []);

  const save = useCallback(async () => {
    if (!dirtyRef.current || !canEditRef.current || conflictRef.current) return;
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    const sent = { title: titleRef.current, body: bodyRef.current };
    try {
      const saved = await updateNote(noteId, { ...sent, expectedUpdatedAt: versionRef.current });
      versionRef.current = saved.updatedAt;
      setNote(saved);
      callbacks.current.onChanged(saved);
      if (titleRef.current !== sent.title || bodyRef.current !== sent.body) {
        schedule(AUTOSAVE_DELAY_MS); // typed more while that was in flight
      } else {
        dirtyRef.current = false;
        setSaveState("saved");
      }
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (status === 409 && isAxiosError(err) && err.response?.data?.current) {
        conflictRef.current = err.response.data.current as Note;
        setConflict(conflictRef.current);
        setSaveState("idle");
      } else if (status === 404 || status === 403) {
        gone();
      } else {
        setSaveState("error");
        schedule(RETRY_AFTER_ERROR_MS);
      }
    } finally {
      savingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        schedule(0);
      }
    }
  }, [noteId, gone, schedule]);
  saveRef.current = save;

  const touch = () => {
    dirtyRef.current = true;
    setSaveState("idle");
    reportContent(isOwner);
    schedule(AUTOSAVE_DELAY_MS);
  };

  // Someone else editing the same note: pick their changes up while this person isn't
  // mid-edit. (If they are, the save's staleness check catches it instead.)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (dirtyRef.current || savingRef.current || conflictRef.current) return;
      getNote(noteId)
        .then((latest) => {
          if (dirtyRef.current || savingRef.current || conflictRef.current) return;
          if (latest.updatedAt !== versionRef.current) adopt(latest);
          else setNote(latest); // sharing / access may have changed without an edit
        })
        .catch((err) => {
          if (isAxiosError(err) && (err.response?.status === 404 || err.response?.status === 403)) gone();
        });
    }, REMOTE_REFRESH_MS);
    return () => clearInterval(id);
  }, [noteId, adopt, gone]);

  // Leaving the note (or the page) with unsaved typing: send it now instead of losing it.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current && canEditRef.current && !conflictRef.current && !savingRef.current) {
        updateNote(noteId, {
          title: titleRef.current,
          body: bodyRef.current,
          expectedUpdatedAt: versionRef.current,
        })
          .then((saved) => callbacks.current.onChanged(saved))
          .catch(() => {});
      }
    },
    [noteId],
  );

  const useTheirVersion = () => {
    if (!conflict) return;
    conflictRef.current = null;
    setConflict(null);
    adopt(conflict);
    setSaveState("idle");
  };

  const keepMine = () => {
    if (!conflict) return;
    versionRef.current = conflict.updatedAt; // now based on their version, so it's accepted
    conflictRef.current = null;
    setConflict(null);
    schedule(0);
  };

  const handlePin = async () => {
    if (!note) return;
    setActionError(null);
    try {
      const updated = await pinNote(noteId, !note.isPinned);
      setNote((prev) => (prev ? { ...prev, isPinned: updated.isPinned } : prev));
      callbacks.current.onChanged(updated);
    } catch (err) {
      setActionError(extractErrorMessage(err, "Unable to pin this note"));
    }
  };

  const handleDelete = async () => {
    setActionError(null);
    try {
      dirtyRef.current = false; // nothing left worth saving
      await deleteNote(noteId);
      gone();
    } catch (err) {
      setActionError(extractErrorMessage(err, "Unable to delete this note"));
      setConfirmDelete(false);
    }
  };

  if (loadError) return <div className="p-6 text-sm text-danger">{loadError}</div>;
  if (!note) return <div className="p-6 text-sm text-gray-400">Opening note…</div>;

  const statusText =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Couldn't save — retrying…"
          : `Edited ${formatDateTime(note.updatedAt)}${
              note.lastEditedByName && note.myAccess !== "owner" ? ` by ${note.lastEditedByName}` : ""
            }`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all notes"
          className="rounded-xl p-1.5 text-gray-500 hover:bg-gray-100 md:hidden dark:hover:bg-gray-800"
        >
          <ArrowLeft size={16} />
        </button>
        <p className="min-w-0 flex-1 truncate text-xs text-gray-400" aria-live="polite">
          {statusText}
        </p>

        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">
              {note.shares.length > 0 ? "Delete for everyone?" : "Delete this note?"}
            </span>
            <button type="button" onClick={() => void handleDelete()} className="font-medium text-danger hover:underline">
              Confirm
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="font-medium text-gray-400 hover:underline">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {isOwner ? (
              <button
                type="button"
                onClick={() => void handlePin()}
                aria-label={note.isPinned ? "Unpin note" : "Pin note"}
                className="rounded-xl p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {note.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label={isOwner ? "Share note" : "See who has access"}
              className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {isOwner ? <Share2 size={16} /> : <Users size={16} />}
              {note.shares.length > 0 ? note.shares.length + 1 : null}
            </button>
            {isOwner ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete note"
                className="rounded-xl p-1.5 text-gray-500 hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {actionError ? <p className="bg-danger/10 px-4 py-2 text-xs text-danger">{actionError}</p> : null}

      {!canEdit ? (
        <p className="bg-gray-50 px-4 py-2 text-xs text-gray-500 dark:bg-gray-950">
          View only — {note.ownerName} shared this note with you but hasn't given you permission to edit it.
        </p>
      ) : null}

      {conflict ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 bg-warning/10 px-4 py-2 text-xs text-warning">
          <span className="flex-1">
            {conflict.lastEditedByName ?? "Someone"} changed this note while you were editing it.
          </span>
          <button type="button" onClick={useTheirVersion} className="font-medium underline">
            Use their version
          </button>
          <button type="button" onClick={keepMine} className="font-medium underline">
            Keep mine
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <input
          value={title}
          readOnly={!canEdit}
          maxLength={200}
          onChange={(e) => {
            titleRef.current = e.target.value;
            setTitle(e.target.value);
            touch();
          }}
          aria-label="Note title"
          placeholder="Title"
          className="w-full bg-transparent text-xl font-semibold outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
        />
        <textarea
          value={body}
          readOnly={!canEdit}
          maxLength={50_000}
          onChange={(e) => {
            bodyRef.current = e.target.value;
            setBody(e.target.value);
            touch();
          }}
          aria-label="Note body"
          placeholder={canEdit ? "Start writing…" : ""}
          className="min-h-0 w-full flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
        />
      </div>

      {shareOpen ? (
        <ShareDialog
          note={note}
          isOwner={Boolean(isOwner)}
          meId={meId}
          onChanged={(updated) => {
            setNote((prev) => (prev ? { ...prev, shares: updated.shares } : prev));
            callbacks.current.onChanged(updated);
          }}
          onLeft={() => {
            setShareOpen(false);
            gone();
          }}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </div>
  );
}
