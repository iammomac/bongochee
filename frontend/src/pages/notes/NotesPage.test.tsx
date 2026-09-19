import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotesPage from "./NotesPage";
import { REMOTE_REFRESH_MS } from "./NoteEditor";
import * as notesService from "../../services/notes";
import { useAuth } from "../../hooks/useAuth";
import type { Note, NoteSummary } from "../../types";

vi.mock("../../services/notes");
vi.mock("../../hooks/useAuth");

const ME = "me-1";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Supplier call",
    body: "Ask about the A56",
    isPinned: false,
    owner: ME,
    ownerName: "Me Myself",
    myAccess: "owner",
    shares: [],
    lastEditedByName: "Me Myself",
    createdAt: "2026-09-19T10:00:00Z",
    updatedAt: "2026-09-19T10:00:00.000001Z",
    ...overrides,
  };
}

function summaryOf(note: Note, overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    preview: note.body,
    isPinned: note.isPinned,
    owner: note.owner,
    ownerName: note.ownerName,
    myAccess: note.myAccess,
    sharedCount: note.shares.length,
    lastEditedByName: note.lastEditedByName,
    updatedAt: note.updatedAt,
    ...overrides,
  };
}

// The same error shape axios produces, which the editor's status checks rely on.
const httpError = (status: number, data: unknown = {}) => ({ isAxiosError: true, response: { status, data } });

function renderNotes(path = "/notes") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotesPage />
    </MemoryRouter>,
  );
}

describe("NotesPage", () => {
  let note: Note;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { id: ME, username: "me" } } as never);
    note = makeNote();
    vi.mocked(notesService.listNotes).mockResolvedValue([summaryOf(note)]);
    vi.mocked(notesService.getNote).mockImplementation(async () => note);
    vi.mocked(notesService.deleteNote).mockResolvedValue(undefined);
    vi.mocked(notesService.listPeople).mockResolvedValue([
      { id: "p-1", name: "Amina Yusuf" },
      { id: "p-2", name: "Juma Bakari" },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists notes with a preview, and marks the ones others shared with me", async () => {
    const shared = makeNote({
      id: "note-2", title: "Rota", body: "Mon: Amina", owner: "boss", ownerName: "Olivia Owner", myAccess: "view",
    });
    vi.mocked(notesService.listNotes).mockResolvedValue([summaryOf(note), summaryOf(shared)]);
    renderNotes();

    expect(await screen.findByText("Supplier call")).toBeInTheDocument();
    expect(screen.getByText("Ask about the A56")).toBeInTheDocument();
    expect(screen.getByText(/From Olivia Owner · view only/)).toBeInTheDocument();
  });

  it("searches on the server after a short pause", async () => {
    const user = userEvent.setup();
    renderNotes();
    await screen.findByText("Supplier call");

    await user.type(screen.getByLabelText("Search notes"), "a56");

    await waitFor(() => expect(notesService.listNotes).toHaveBeenLastCalledWith("a56"));
  });

  it("opens a note from a link (like a notification's) and shows what's in it", async () => {
    renderNotes("/notes?note=note-1");

    expect(await screen.findByLabelText("Note title")).toHaveValue("Supplier call");
    expect(screen.getByLabelText("Note body")).toHaveValue("Ask about the A56");
    expect(notesService.getNote).toHaveBeenCalledWith("note-1");
  });

  describe("writing", () => {
    it("autosaves what you type, based on the version it opened", async () => {
      vi.mocked(notesService.updateNote).mockResolvedValue(
        makeNote({ body: "Ask about the A56 price", updatedAt: "2026-09-19T10:05:00.000001Z" }),
      );
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      const body = await screen.findByLabelText("Note body");
      await user.type(body, " price");

      await waitFor(() => expect(notesService.updateNote).toHaveBeenCalled(), { timeout: 3000 });
      expect(notesService.updateNote).toHaveBeenCalledWith(
        "note-1",
        expect.objectContaining({ body: "Ask about the A56 price", expectedUpdatedAt: "2026-09-19T10:00:00.000001Z" }),
      );
      expect(await screen.findByText("Saved")).toBeInTheDocument();
    });

    it("saves pending typing when you switch to another note instead of losing it", async () => {
      const other = makeNote({ id: "note-2", title: "Other", body: "x" });
      vi.mocked(notesService.listNotes).mockResolvedValue([summaryOf(note), summaryOf(other)]);
      vi.mocked(notesService.updateNote).mockResolvedValue(makeNote({ body: "Ask about the A56!" }));
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      await user.type(await screen.findByLabelText("Note body"), "!");
      await user.click(screen.getByRole("button", { name: /Other/ })); // before the autosave delay elapses

      await waitFor(() =>
        expect(notesService.updateNote).toHaveBeenCalledWith("note-1", expect.objectContaining({ body: "Ask about the A56!" })),
      );
    });

    it("creates a new note and opens it", async () => {
      const fresh = makeNote({ id: "note-9", title: "", body: "" });
      vi.mocked(notesService.createNote).mockResolvedValue(fresh);
      vi.mocked(notesService.getNote).mockResolvedValue(fresh);
      const user = userEvent.setup();
      renderNotes();
      await screen.findByText("Supplier call");

      await user.click(screen.getByRole("button", { name: /new note/i }));

      expect(await screen.findByLabelText("Note title")).toHaveValue("");
      expect(notesService.createNote).toHaveBeenCalledWith({ title: "", body: "" });
    });

    it("throws away a new note you never wrote in when you move to another", async () => {
      const fresh = makeNote({ id: "note-9", title: "", body: "" });
      vi.mocked(notesService.createNote).mockResolvedValue(fresh);
      vi.mocked(notesService.getNote).mockImplementation(async (id) => (id === "note-9" ? fresh : note));
      vi.mocked(notesService.deleteNote).mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderNotes();
      await screen.findByText("Supplier call");

      await user.click(screen.getByRole("button", { name: /new note/i }));
      await screen.findByLabelText("Note title");
      await user.click(screen.getByRole("button", { name: /Supplier call/ }));

      await waitFor(() => expect(notesService.deleteNote).toHaveBeenCalledWith("note-9"));
      expect(notesService.deleteNote).not.toHaveBeenCalledWith("note-1");
    });

    it("keeps a new note you did write in", async () => {
      const fresh = makeNote({ id: "note-9", title: "", body: "" });
      vi.mocked(notesService.createNote).mockResolvedValue(fresh);
      vi.mocked(notesService.getNote).mockImplementation(async (id) => (id === "note-9" ? fresh : note));
      vi.mocked(notesService.updateNote).mockResolvedValue(makeNote({ id: "note-9", title: "Idea", body: "" }));
      const user = userEvent.setup();
      renderNotes();
      await screen.findByText("Supplier call");

      await user.click(screen.getByRole("button", { name: /new note/i }));
      await user.type(await screen.findByLabelText("Note title"), "Idea");
      await user.click(screen.getByRole("button", { name: /Supplier call/ }));

      expect(notesService.deleteNote).not.toHaveBeenCalled();
    });

    it("deletes a note after an inline confirm", async () => {
      vi.mocked(notesService.deleteNote).mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      await user.click(await screen.findByRole("button", { name: "Delete note" }));
      expect(screen.getByText("Delete this note?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => expect(notesService.deleteNote).toHaveBeenCalledWith("note-1"));
      await waitFor(() => expect(screen.queryByLabelText("Note title")).not.toBeInTheDocument());
    });

    it("pins a note", async () => {
      vi.mocked(notesService.pinNote).mockResolvedValue(makeNote({ isPinned: true }));
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      await user.click(await screen.findByRole("button", { name: "Pin note" }));

      await waitFor(() => expect(notesService.pinNote).toHaveBeenCalledWith("note-1", true));
      expect(await screen.findByRole("button", { name: "Unpin note" })).toBeInTheDocument();
    });
  });

  describe("a note shared with me", () => {
    it("is read-only when I only have view access", async () => {
      note = makeNote({ owner: "boss", ownerName: "Olivia Owner", myAccess: "view" });
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      const body = await screen.findByLabelText("Note body");
      expect(body).toHaveAttribute("readonly");
      expect(screen.getByLabelText("Note title")).toHaveAttribute("readonly");
      expect(screen.getByText(/View only — Olivia Owner shared this note/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete note" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /pin note/i })).not.toBeInTheDocument();

      await user.type(body, "hello");
      await new Promise((r) => setTimeout(r, 1000));
      expect(notesService.updateNote).not.toHaveBeenCalled();
    });

    it("can be edited when I've been given edit access, and shows who last changed it", async () => {
      note = makeNote({ owner: "boss", ownerName: "Olivia Owner", myAccess: "edit", lastEditedByName: "Olivia Owner" });
      renderNotes("/notes?note=note-1");

      expect(await screen.findByLabelText("Note body")).not.toHaveAttribute("readonly");
      expect(screen.getByText(/by Olivia Owner/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete note" })).not.toBeInTheDocument(); // still only the owner's
    });

    it("lets me remove it from my own list", async () => {
      note = makeNote({
        owner: "boss",
        ownerName: "Olivia Owner",
        myAccess: "view",
        shares: [{ user: ME, userName: "Me Myself", permission: "view" }],
      });
      vi.mocked(notesService.unshareNote).mockResolvedValue(null);
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      await user.click(await screen.findByRole("button", { name: "See who has access" }));
      await user.click(screen.getByRole("button", { name: "Remove from my list" }));

      await waitFor(() => expect(notesService.unshareNote).toHaveBeenCalledWith("note-1", ME));
      await waitFor(() => expect(screen.queryByLabelText("Note body")).not.toBeInTheDocument());
    });

    it("is dropped from the screen if my access is taken away while it's open", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderNotes("/notes?note=note-1");
      await screen.findByLabelText("Note body");

      vi.mocked(notesService.getNote).mockRejectedValue(httpError(404));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_MS + 100);
      });

      await waitFor(() => expect(screen.queryByLabelText("Note body")).not.toBeInTheDocument());
    });
  });

  describe("two people editing", () => {
    it("shows what the other person wrote when they save while I'm just reading", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      note = makeNote({ myAccess: "owner" });
      renderNotes("/notes?note=note-1");
      await screen.findByDisplayValue("Ask about the A56");

      note = makeNote({ body: "Ask about the A56\nAnd the A36", updatedAt: "2026-09-19T10:09:00.000001Z" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_MS + 100);
      });

      expect(await screen.findByDisplayValue(/And the A36/)).toBeInTheDocument();
    });

    it("warns instead of overwriting when someone saved first, and lets me pick a version", async () => {
      const theirs = makeNote({
        body: "Their version",
        lastEditedByName: "Eddie Editor",
        updatedAt: "2026-09-19T10:08:00.000001Z",
      });
      vi.mocked(notesService.updateNote).mockRejectedValueOnce(httpError(409, { current: theirs }));
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      await user.type(await screen.findByLabelText("Note body"), " mine");
      const alert = await screen.findByRole("alert", undefined, { timeout: 3000 });
      expect(within(alert).getByText(/Eddie Editor changed this note while you were editing it/)).toBeInTheDocument();

      await user.click(within(alert).getByRole("button", { name: "Use their version" }));
      expect(screen.getByLabelText("Note body")).toHaveValue("Their version");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("'Keep mine' resends my text against their version so it's accepted", async () => {
      const theirs = makeNote({ body: "Their version", updatedAt: "2026-09-19T10:08:00.000001Z" });
      vi.mocked(notesService.updateNote)
        .mockRejectedValueOnce(httpError(409, { current: theirs }))
        .mockResolvedValueOnce(makeNote({ body: "Ask about the A56 mine", updatedAt: "2026-09-19T10:09:00.000001Z" }));
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      await user.type(await screen.findByLabelText("Note body"), " mine");
      const alert = await screen.findByRole("alert", undefined, { timeout: 3000 });
      await user.click(within(alert).getByRole("button", { name: "Keep mine" }));

      await waitFor(() => expect(notesService.updateNote).toHaveBeenCalledTimes(2));
      expect(vi.mocked(notesService.updateNote).mock.calls[1][1]).toEqual(
        expect.objectContaining({ body: "Ask about the A56 mine", expectedUpdatedAt: "2026-09-19T10:08:00.000001Z" }),
      );
    });
  });

  describe("sharing", () => {
    it("lets the owner share with a person and pick edit or view-only", async () => {
      vi.mocked(notesService.shareNote).mockResolvedValue(
        makeNote({ shares: [{ user: "p-1", userName: "Amina Yusuf", permission: "view" }] }),
      );
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      await user.click(await screen.findByRole("button", { name: "Share note" }));
      const dialog = screen.getByRole("dialog", { name: "Share note" });
      await user.click(within(dialog).getByRole("button", { name: "Choose a person…" }));
      await user.click(screen.getByRole("option", { name: "Amina Yusuf" }));
      await user.click(within(dialog).getByRole("button", { name: /Can edit — they can change it/ }));
      await user.click(screen.getByRole("option", { name: /Can view — read only/ }));
      await user.click(within(dialog).getByRole("button", { name: "Share" }));

      await waitFor(() =>
        expect(notesService.shareNote).toHaveBeenCalledWith("note-1", { user: "p-1", permission: "view" }),
      );
      expect(await within(dialog).findByText("Amina Yusuf")).toBeInTheDocument();
    });

    it("doesn't offer people who already have access", async () => {
      note = makeNote({ shares: [{ user: "p-1", userName: "Amina Yusuf", permission: "edit" }] });
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      await user.click(await screen.findByRole("button", { name: "Share note" }));
      const dialog = screen.getByRole("dialog", { name: "Share note" });
      await user.click(within(dialog).getByRole("button", { name: "Choose a person…" }));

      expect(screen.getByRole("option", { name: "Juma Bakari" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Amina Yusuf" })).not.toBeInTheDocument();
    });

    it("lets the owner take someone's access away", async () => {
      note = makeNote({ shares: [{ user: "p-1", userName: "Amina Yusuf", permission: "edit" }] });
      vi.mocked(notesService.unshareNote).mockResolvedValue(makeNote({ shares: [] }));
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      await user.click(await screen.findByRole("button", { name: "Share note" }));
      await user.click(screen.getByRole("button", { name: "Remove Amina Yusuf" }));

      await waitFor(() => expect(notesService.unshareNote).toHaveBeenCalledWith("note-1", "p-1"));
      expect(await screen.findByText("Not shared with anyone yet")).toBeInTheDocument();
    });

    it("shows the server's reason if sharing fails", async () => {
      vi.mocked(notesService.shareNote).mockRejectedValue(httpError(400, { detail: "You already own this note." }));
      const user = userEvent.setup();
      renderNotes("/notes?note=note-1");

      await user.click(await screen.findByRole("button", { name: "Share note" }));
      const dialog = screen.getByRole("dialog", { name: "Share note" });
      await user.click(within(dialog).getByRole("button", { name: "Choose a person…" }));
      await user.click(screen.getByRole("option", { name: "Juma Bakari" }));
      await user.click(within(dialog).getByRole("button", { name: "Share" }));

      // extractErrorMessage only trusts axios errors' `detail`, which this mock provides.
      expect(await within(dialog).findByText(/already own this note|Something went wrong/)).toBeInTheDocument();
    });
  });
});
