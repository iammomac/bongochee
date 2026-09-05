import { api } from "./api";
import { unwrapList, type Paginated } from "../lib/pagination";
import type { Notification } from "../types";

export async function listNotifications() {
  const { data } = await api.get<Paginated<Notification> | Notification[]>("/notifications/notifications/");
  return unwrapList(data);
}

export async function markNotificationRead(id: string) {
  const { data } = await api.post<Notification>(`/notifications/notifications/${id}/mark-read/`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await api.post<{ updated: number }>("/notifications/notifications/mark-all-read/");
  return data;
}
