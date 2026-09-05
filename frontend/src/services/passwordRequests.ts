import { api } from "./api";
import type { PasswordChangeRequest } from "../types";

export async function requestPasswordChange(reason?: string) {
  const { data } = await api.post<PasswordChangeRequest>("/auth/password-requests/", { reason });
  return data;
}

export async function listPendingPasswordRequests() {
  const { data } = await api.get<{ results: PasswordChangeRequest[] } | PasswordChangeRequest[]>(
    "/auth/password-requests/",
    { params: { status: "pending" } },
  );
  return Array.isArray(data) ? data : data.results;
}

export async function approvePasswordRequest(id: string) {
  const { data } = await api.post<{ detail: string; temporaryPassword: string }>(
    `/auth/password-requests/${id}/approve/`,
  );
  return data;
}
