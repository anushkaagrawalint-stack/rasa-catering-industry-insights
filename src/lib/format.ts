// Number/label formatting shared by the dashboard, admin preview and tests (spec 4.4, 5).

export const fmt = (n: number) => n.toLocaleString('en-US');
export const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const pc = (a: number, b: number) => (b ? (100 * a) / b : 0);
export const pct = (x: number) => x.toFixed(1) + '%';
export const mmss = (s: number) => {
  s = Math.round(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
export const gapText = (gap: number) => (gap >= 0 ? '+' : '') + gap.toFixed(1);

/** Display name for an industry key: abbreviation map, else Title Case each word. */
export function makeDisp(abbrev: Record<string, string>) {
  return (s: string) => (!s ? s : abbrev[s] || s.replace(/\b\w/g, m => m.toUpperCase()));
}
