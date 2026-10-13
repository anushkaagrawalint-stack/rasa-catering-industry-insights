import 'server-only';
import * as XLSX from 'xlsx';

export const SHEET_PAGE_SIZE = 100;

/** Read-only view of an uploaded workbook: tab names, and one page of one tab as display text. */
export function workbookTabs(buf: Buffer): string[] {
  return XLSX.read(buf, { type: 'buffer', bookSheets: true }).SheetNames;
}

export function sheetPage(buf: Buffer, tab: string, page: number) {
  const wb = XLSX.read(buf, { type: 'buffer', sheets: [tab], cellFormula: false, cellHTML: false, dense: true });
  const ws = wb.Sheets[tab];
  if (!ws) return null;
  // raw: false → the text Excel would display (formatted dates/numbers); formulas are never evaluated.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: false });
  const headers = (aoa[0] ?? []).map(String);
  const body = aoa.slice(1);
  const pages = Math.max(1, Math.ceil(body.length / SHEET_PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const rows = body.slice((p - 1) * SHEET_PAGE_SIZE, p * SHEET_PAGE_SIZE).map(r => headers.map((_, i) => String(r?.[i] ?? '')));
  return { headers, rows, total: body.length, page: p, pages, firstRow: (p - 1) * SHEET_PAGE_SIZE + 2 };
}
