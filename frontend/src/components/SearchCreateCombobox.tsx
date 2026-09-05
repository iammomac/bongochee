import { useEffect, useRef, useState } from "react";
import { Check, Plus, Search } from "lucide-react";

interface NamedItem {
  id: string;
  name: string;
}

interface Props<T extends NamedItem> {
  value: T | null;
  onSelect: (item: T) => void;
  search: (query: string) => Promise<T[]>;
  create?: (name: string) => Promise<T>;
  placeholder: string;
  disabled?: boolean;
}

export function SearchCreateCombobox<T extends NamedItem>({
  value,
  onSelect,
  search,
  create,
  placeholder,
  disabled,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      search(query)
        .then(setResults)
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, search]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const trimmed = query.trim();
  const hasExactMatch = results.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());

  const handleCreate = async () => {
    if (!trimmed || !create) return;
    setCreating(true);
    try {
      const item = await create(trimmed);
      onSelect(item);
      setQuery("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-background px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
        <Search size={14} className="shrink-0 text-gray-400" />
        <input
          disabled={disabled}
          value={open ? query : (value?.name ?? query)}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
        {value && !open ? <Check size={14} className="shrink-0 text-success" /> : null}
      </div>
      {open && !disabled ? (
        <div className="absolute z-10 mt-1 w-full rounded-2xl border border-gray-100 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>
          ) : (
            <>
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {item.name}
                </button>
              ))}
              {create && trimmed && !hasExactMatch ? (
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={creating}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  <Plus size={14} />
                  {creating ? "Creating…" : `Create "${trimmed}"`}
                </button>
              ) : null}
              {!results.length && !trimmed ? (
                <div className="px-3 py-2 text-sm text-gray-400">Type to search…</div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
