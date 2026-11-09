import { useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export const TABLE_PAGE_SIZE = 25;

/**
 * Search + paging over a list that's already fully loaded in the browser.
 * `matches` gets the lower-cased, trimmed search text and decides if a row fits.
 */
export function usePagedSearch<T>(items: T[], matches: (item: T, query: string) => boolean, pageSize = TABLE_PAGE_SIZE) {
  const [search, setSearchText] = useState("");
  const [page, setPage] = useState(1);

  const query = search.trim().toLowerCase();
  const filtered = query ? items.filter((item) => matches(item, query)) : items;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp rather than reset, so deleting the last row on the final page doesn't strand you on an empty page.
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const setSearch = (value: string) => {
    setSearchText(value);
    setPage(1);
  };

  return {
    search,
    setSearch,
    pageItems,
    filteredCount: filtered.length,
    page: currentPage,
    totalPages,
    setPage,
  };
}

/** True when a row's text fields contain the search text (already lower-cased). */
export function anyFieldIncludes(query: string, ...fields: (string | null | undefined)[]) {
  return fields.some((field) => field?.toLowerCase().includes(query));
}

export function TableSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative max-w-sm">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
      />
    </div>
  );
}

export function TablePager({
  page,
  totalPages,
  count,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  count: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm dark:border-gray-800">
      <span className="text-xs text-gray-400">{count > 0 ? `Page ${page} of ${totalPages} — ${count} entries` : ""}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-40 dark:border-gray-800 dark:text-gray-300"
        >
          <ChevronLeft size={14} />
          Prev
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-40 dark:border-gray-800 dark:text-gray-300"
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
