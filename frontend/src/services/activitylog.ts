import { api } from "./api";
import { unwrapList, type Paginated } from "../lib/pagination";
import type { ActivityLogEntry } from "../types";

export async function listActivityLogsForUser(userId: string) {
  const { data } = await api.get<Paginated<ActivityLogEntry> | ActivityLogEntry[]>("/logs/logs/", {
    params: { user: userId },
  });
  return unwrapList(data);
}

export interface ActivityLogFilters {
  user?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
}

export async function listActivityLogsPage(filters: ActivityLogFilters) {
  const { data } = await api.get<Paginated<ActivityLogEntry>>("/logs/logs/", {
    params: {
      user: filters.user || undefined,
      action: filters.action || undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      page: filters.page,
    },
  });
  return data;
}
