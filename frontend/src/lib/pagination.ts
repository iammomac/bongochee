import { api } from "../services/api";

export interface Paginated<T> {
  results: T[];
  count?: number;
  next?: string | null;
  previous?: string | null;
}

export function unwrapList<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

const FETCH_ALL_PAGE_SIZE = 500;

/**
 * Loads every row of a list endpoint, not just its first page. The API pages lists
 * (25 rows by default), so a plain GET silently drops everything past the first page.
 * This asks for big pages and keeps going until the server says there are no more.
 */
export async function fetchAll<T>(url: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const { data } = await api.get<Paginated<T> | T[]>(url, {
      params: { ...params, page, page_size: FETCH_ALL_PAGE_SIZE },
    });
    if (Array.isArray(data)) return data; // endpoint isn't paginated
    rows.push(...data.results);
    if (!data.next || data.results.length === 0) return rows;
  }
}
