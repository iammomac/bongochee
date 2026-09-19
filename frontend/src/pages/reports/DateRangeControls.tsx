import { useEffect, useState } from "react";
import { Select } from "../../components/Select";

export type DatePreset = "today" | "week" | "month" | "last30" | "last90" | "custom";

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  last30: "Last 30 days",
  last90: "Last 90 days",
  custom: "Custom",
};

export const STANDARD_PRESETS: DatePreset[] = ["today", "week", "month", "custom"];

// The viewer's own calendar day -- not toISOString(), which is the UTC day and so reads as
// "yesterday" for the first few hours after midnight in Tanzania (UTC+3).
function toIso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function presetRange(preset: DatePreset) {
  const today = new Date();
  const daysAgo = (n: number) => {
    const start = new Date(today);
    start.setDate(today.getDate() - n);
    return start;
  };
  switch (preset) {
    case "week":
      return { from: toIso(daysAgo(today.getDay())), to: toIso(today) };
    case "month":
      return { from: toIso(new Date(today.getFullYear(), today.getMonth(), 1)), to: toIso(today) };
    case "last30":
      return { from: toIso(daysAgo(29)), to: toIso(today) };
    case "last90":
      return { from: toIso(daysAgo(89)), to: toIso(today) };
    default:
      return { from: toIso(today), to: toIso(today) };
  }
}

// One date range's state. A report that wants its own range (the loan sales report)
// simply calls this itself instead of sharing the page's.
export function useDateRange(initial: DatePreset = "today") {
  const [preset, setPreset] = useState<DatePreset>(initial);
  const [from, setFrom] = useState(() => presetRange(initial).from);
  const [to, setTo] = useState(() => presetRange(initial).to);

  useEffect(() => {
    if (preset === "custom") return;
    const range = presetRange(preset);
    setFrom(range.from);
    setTo(range.to);
  }, [preset]);

  return { preset, from, to, setPreset, setFrom, setTo };
}

export type DateRange = ReturnType<typeof useDateRange>;

const DATE_INPUT =
  "rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950";

export function DateRangeControls({ range, presets = STANDARD_PRESETS }: { range: DateRange; presets?: DatePreset[] }) {
  return (
    <>
      <div className="w-44">
        <label className="mb-1 block text-xs font-medium text-gray-500">Date range</label>
        <Select value={range.preset} onChange={(v) => range.setPreset(v as DatePreset)}>
          {presets.map((preset) => (
            <option key={preset} value={preset}>
              {PRESET_LABELS[preset]}
            </option>
          ))}
        </Select>
      </div>
      {range.preset === "custom" ? (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
            <input type="date" value={range.from} onChange={(e) => range.setFrom(e.target.value)} className={DATE_INPUT} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
            <input type="date" value={range.to} onChange={(e) => range.setTo(e.target.value)} className={DATE_INPUT} />
          </div>
        </>
      ) : null}
    </>
  );
}
