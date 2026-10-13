// Plain calendar dates as 'YYYY-MM-DD' strings — no time zones anywhere (spec 9).

const DAY_MS = 86_400_000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

function ymd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. Feb 30
  return `${y}-${pad(m)}-${pad(d)}`;
}

const toUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Excel serial date (1900 system) → ISO date; the time-of-day fraction is dropped. */
export function serialToISO(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 200_000) return null;
  return fromUTC(Date.UTC(1899, 11, 30) + Math.floor(n + 1e-9) * DAY_MS);
}

/** Parse an Excel cell (serial number, ISO / US M/D/Y / "Oct 5, 2026" text) to ISO, or null. */
export function parseDateCell(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'number') return serialToISO(v);
  if (v instanceof Date) return ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  const s = String(v).trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s.*)?$/))) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return ymd(y, +m[1], +m[2]);
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return mi < 0 ? null : ymd(+m[3], mi + 1, +m[2]);
  }
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mi < 0 ? null : ymd(+m[3], mi + 1, +m[1]);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return serialToISO(+s);
  return null;
}

export const addDays = (iso: string, n: number) => fromUTC(toUTC(iso) + n * DAY_MS);
export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);

/** Monday of the week containing iso. */
export function mondayOf(iso: string): string {
  const dow = new Date(toUTC(iso)).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

export interface WeekWindow {
  weekStart: string;
  weekEnd: string;
  ytdStart: string;
  ytdEnd: string;
}

export function weekWindow(weekStart: string): WeekWindow {
  const weekEnd = addDays(weekStart, 6);
  return { weekStart, weekEnd, ytdStart: weekStart.slice(0, 4) + '-01-01', ytdEnd: weekEnd };
}

const md = (iso: string) => `${MONTH_LABELS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;

/** 'Oct 5 – Oct 11, 2026' (years shown on both ends when they differ). */
export function rangeLabel(a: string, b: string): string {
  return a.slice(0, 4) === b.slice(0, 4) ? `${md(a)} – ${md(b)}, ${b.slice(0, 4)}` : `${md(a)}, ${a.slice(0, 4)} – ${md(b)}, ${b.slice(0, 4)}`;
}

/** 'Week of Oct 5 – Oct 11, 2026' */
export const weekTitle = (w: Pick<WeekWindow, 'weekStart' | 'weekEnd'>) => `Week of ${rangeLabel(w.weekStart, w.weekEnd)}`;
/** 'Week of Oct 5' (week selector) */
export const weekShortLabel = (weekStart: string) => `Week of ${md(weekStart)}`;
