const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return year && month && day ? { year, month, day } : null;
}

// Both helpers build the text from the ISO parts rather than new Date(iso) -- so a
// browser west of UTC can't shift a plain calendar date back a day -- and from a fixed
// month list rather than Intl, so every browser's locale data renders the same text.

// "2026-09-19" -> "19 Sep 2026"
export function formatDate(iso: string) {
  const p = parts(iso);
  return p ? `${String(p.day).padStart(2, "0")} ${MONTHS[p.month - 1]} ${p.year}` : iso;
}

// "2026-09-19" -> "19 Sep"
export function formatDayMonth(iso: string) {
  const p = parts(iso);
  return p ? `${p.day} ${MONTHS[p.month - 1]}` : iso;
}

// "2026-09-19T14:32:10+03:00" -> "19 Sep 2026, 14:32" in the viewer's own timezone.
export function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
