export interface Paginated<T> {
  results: T[];
  count?: number;
  next?: string | null;
  previous?: string | null;
}

export function unwrapList<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}
