import { api } from "./api";
import type { Note, NotePerson, NoteSharePermission, NoteSummary } from "../types";

// Not paginated: a notes app lists all of your notes.
export async function listNotes(search?: string) {
  const { data } = await api.get<NoteSummary[]>("/notes/notes/", { params: search ? { search } : {} });
  return data;
}

export async function getNote(id: string) {
  const { data } = await api.get<Note>(`/notes/notes/${id}/`);
  return data;
}

export async function createNote(payload: { title: string; body: string }) {
  const { data } = await api.post<Note>("/notes/notes/", payload);
  return data;
}

export interface NoteUpdatePayload {
  title?: string;
  body?: string;
  // The version this edit is based on; the server refuses (409) if someone else has
  // saved since, instead of silently overwriting them.
  expectedUpdatedAt?: string;
}

export async function updateNote(id: string, payload: NoteUpdatePayload) {
  const { data } = await api.patch<Note>(`/notes/notes/${id}/`, payload);
  return data;
}

export async function deleteNote(id: string) {
  await api.delete(`/notes/notes/${id}/`);
}

export async function pinNote(id: string, pinned: boolean) {
  const { data } = await api.post<Note>(`/notes/notes/${id}/pin/`, { pinned });
  return data;
}

export async function shareNote(id: string, payload: { user: string; permission: NoteSharePermission }) {
  const { data } = await api.post<Note>(`/notes/notes/${id}/shares/`, payload);
  return data;
}

// The owner removing someone returns the updated note; a person removing themselves
// (leaving a shared note) gets nothing back, since they can no longer see it.
export async function unshareNote(id: string, userId: string) {
  const { data } = await api.delete<Note | "">(`/notes/notes/${id}/shares/${userId}/`);
  return data === "" ? null : data;
}

export async function listPeople() {
  const { data } = await api.get<NotePerson[]>("/notes/notes/people/");
  return data;
}
