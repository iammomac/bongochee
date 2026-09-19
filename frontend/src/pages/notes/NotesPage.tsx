import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pin, Plus, Search, StickyNote, Users } from "lucide-react";
import { NoteEditor } from "./NoteEditor";
import { createNote, deleteNote, listNotes } from "../../services/notes";
import { useAuth } from "../../hooks/useAuth";
import { formatDateTime } from "../../lib/dates";
import type { Note, NoteSummary } from "../../types";

const SEARCH_DEBOUNCE_MS = 250;
// How often the list checks for notes other people have shared or changed.
export const LIST_REFRESH_MS = 20_000;

function toSummary(note: Note): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    preview: note.body.split(/\s+/).filter(Boolean).join(" ").slice(0, 160),
    isPinned: note.isPinned,
    owner: note.owner,
    ownerName: note.ownerName,
    myAccess: note.myAccess,
    sharedCount: note.shares.length,
    lastEditedByName: note.lastEditedByName,
    updatedAt: note.updatedAt,
  };
}

// Same order the server uses: your pinned notes first, then most recently edited.
function sortNotes(notes: NoteSummary[], meId: string) {
  return [...notes].sort((a, b) => {
    const pinA = a.owner === meId && a.isPinned ? 0 : 1;
    const pinB = b.owner === meId && b.isPinned ? 0 : 1;
    return pinA - pinB || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export default function NotesPage() {
  const { user } = useAuth();
  const meId = user?.id ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  // The open note lives in the URL, so a notification link (/notes?note=…) opens it directly.
  const selectedId = searchParams.get("note");

  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  // The open note, if it's mine and still blank -- discarded when I move away from it.
  const blankRef = useRef<{ id: string; blank: boolean } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const loadNotes = useCallback(async () => {
    try {
      setNotes(await listNotes(query || undefined));
      setError(null);
    } catch {
      setError("Unable to load your notes");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadNotes();
    const id = setInterval(() => {
      if (document.visibilityState !== "hidden") void loadNotes();
    }, LIST_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadNotes]);

  // Leaving the page while sitting on a blank new note discards it too.
  useEffect(
    () => () => {
      const blank = blankRef.current;
      if (blank?.blank) deleteNote(blank.id).catch(() => {});
    },
    [],
  );

  const discardBlankNote = (keepId: string | null) => {
    const blank = blankRef.current;
    if (!blank?.blank || blank.id === keepId) return;
    blankRef.current = null;
    setNotes((prev) => prev.filter((n) => n.id !== blank.id));
    deleteNote(blank.id).catch(() => {});
  };

  const select = (id: string | null) => {
    discardBlankNote(id);
    setSearchParams(id ? { note: id } : {});
  };

  const handleNew = async () => {
    // Already looking at an empty note of mine: that's the "new note".
    if (blankRef.current?.blank && blankRef.current.id === selectedId) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createNote({ title: "", body: "" });
      setSearch("");
      setQuery("");
      setNotes((prev) => sortNotes([toSummary(created), ...prev], meId));
      select(created.id);
    } catch {
      setError("Unable to create a note");
    } finally {
      setCreating(false);
    }
  };

  const handleChanged = useCallback(
    (note: Note) => {
      const summary = toSummary(note);
      setNotes((prev) => {
        const exists = prev.some((n) => n.id === summary.id);
        return sortNotes(exists ? prev.map((n) => (n.id === summary.id ? summary : n)) : [summary, ...prev], meId);
      });
    },
    [meId],
  );

  const handleGone = useCallback(
    (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (blankRef.current?.id === id) blankRef.current = null;
      if (searchParams.get("note") === id) setSearchParams({});
    },
    [searchParams, setSearchParams],
  );

  const handleContent = useCallback((id: string, blank: boolean) => {
    blankRef.current = { id, blank };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <StickyNote size={22} />
            Notes
          </h1>
          <p className="text-sm text-gray-400">Write things down — and share a note with a teammate to talk it through</p>
        </div>
        <button
          type="button"
          onClick={() => void handleNew()}
          disabled={creating}
          className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={16} />
          New note
        </button>
      </div>

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}

      <div className="card flex h-[calc(100vh-14rem)] min-h-[26rem] overflow-hidden">
        <aside
          className={`${selectedId ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-gray-100 md:w-80 dark:border-gray-800`}
        >
          <div className="border-b border-gray-100 p-3 dark:border-gray-800">
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-background px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
              <Search size={14} className="shrink-0 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes"
                aria-label="Search notes"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => select(note.id)}
                  aria-current={note.id === selectedId}
                  className={`block w-full border-b border-gray-50 px-4 py-3 text-left dark:border-gray-800 ${
                    note.id === selectedId ? "bg-primary/10" : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{note.title || "New note"}</p>
                    {note.isPinned && note.owner === meId ? (
                      <Pin size={12} className="shrink-0 text-primary" aria-label="Pinned" />
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-400">{note.preview || "No additional text"}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                    <span>{formatDateTime(note.updatedAt)}</span>
                    {note.myAccess !== "owner" ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        From {note.ownerName} · {note.myAccess === "edit" ? "can edit" : "view only"}
                      </span>
                    ) : note.sharedCount > 0 ? (
                      <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                        <Users size={10} />
                        Shared
                      </span>
                    ) : null}
                  </p>
                </button>
              </li>
            ))}
            {!loading && notes.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-gray-400">
                {query ? "No notes match your search" : "No notes yet — tap New note to start"}
              </li>
            ) : null}
          </ul>
        </aside>

        <section className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {selectedId ? (
            <NoteEditor
              key={selectedId}
              noteId={selectedId}
              meId={meId}
              onChanged={handleChanged}
              onGone={handleGone}
              onContent={handleContent}
              onBack={() => select(null)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-gray-400">
              <StickyNote size={32} />
              <p className="text-sm">Pick a note, or start a new one</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
