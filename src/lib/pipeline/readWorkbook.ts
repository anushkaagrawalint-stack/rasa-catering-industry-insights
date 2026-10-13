import * as XLSX from 'xlsx';

export const TAB_SUMMARY = 'Industry_Summary';
export const TAB_ORDERS = 'YTD_Orders';
export const TAB_CALLS = 'Calls_This_Week';
export const TAB_PHONE = 'Phone Number';
export const TAB_TOAST = 'Toast';
export const JC_PREFIX = 'Week of';

/** A parsed tab: header cells + data rows, each with its Excel row number. */
export interface Table {
  name: string;
  headers: string[];
  rows: { rowNum: number; cells: unknown[] }[];
  /** Case-insensitive, trimmed header lookup → column index (or -1). */
  col(name: string): number;
}

export interface RawWorkbook {
  sheetNames: string[];
  /** Tab names after trimming → actual name in the file. */
  tabs: Map<string, string>;
  jcTab: string | null;
  tables: Map<string, Table>;
}

function toTable(name: string, ws: XLSX.WorkSheet): Table {
  const ref = ws['!ref'];
  const first = ref ? XLSX.utils.decode_range(ref).s.r : 0;
  // raw: true → cell values as stored (numbers / strings / booleans); formulas are never evaluated.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const headers = (aoa[0] ?? []).map(h => (h == null ? '' : String(h).trim()));
  const idx = new Map<string, number>();
  headers.forEach((h, i) => { const k = h.toLowerCase(); if (h && !idx.has(k)) idx.set(k, i); });
  const rows: Table['rows'] = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] ?? [];
    if (cells.every(c => c == null || (typeof c === 'string' && c.trim() === ''))) continue;
    rows.push({ rowNum: first + i + 1, cells });
  }
  return { name, headers, rows, col: (n: string) => idx.get(n.trim().toLowerCase()) ?? -1 };
}

/**
 * Parse only the tabs the dashboard needs. Tab names are matched exactly after trimming;
 * the JustCall tab and Phone Number are detected but not parsed (kept only in the audit file).
 */
export function readWorkbook(buf: Buffer | Uint8Array): RawWorkbook {
  const base = { type: 'buffer' as const, cellFormula: false, cellHTML: false, cellText: false, cellDates: false, dense: true };
  const names = XLSX.read(buf, { ...base, bookSheets: true }).SheetNames;
  const tabs = new Map<string, string>();
  for (const n of names) if (!tabs.has(n.trim())) tabs.set(n.trim(), n);
  const jcTab = names.find(n => n.trim().startsWith(JC_PREFIX)) ?? null;

  const wanted = [TAB_SUMMARY, TAB_ORDERS, TAB_CALLS, TAB_TOAST].map(t => tabs.get(t)).filter((n): n is string => !!n);
  const tables = new Map<string, Table>();
  if (wanted.length) {
    const wb = XLSX.read(buf, { ...base, sheets: wanted });
    for (const actual of wanted) {
      const ws = wb.Sheets[actual];
      if (ws) tables.set(actual.trim(), toTable(actual.trim(), ws));
    }
  }
  return { sheetNames: names, tabs, jcTab, tables };
}

/** Cell → trimmed string ('' for blank). Numbers are written without exponent/decimals noise. */
export function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).trim();
}
