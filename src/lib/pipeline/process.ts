// Upload pipeline: validate (spec 3) → normalise (spec 4) → reconcile (spec 4.6).
import type { AppConfig } from '../config';
import {
  NO_ANSWER, NO_COMPANY_NAME, NOCO, PERSONAS, UNMAPPED,
} from '../constants';
import { orderSummary } from '../metrics';
import { daysBetween, mondayOf, parseDateCell, weekWindow } from './dates';
import { makeDeriver, unknownDispositionsIssue } from './derive';
import {
  JC_PREFIX, readWorkbook, str, TAB_CALLS, TAB_ORDERS, TAB_PHONE, TAB_SUMMARY, TAB_TOAST, type Table,
} from './readWorkbook';
import type { DialRow, Issue, OrderRow, OrderType, SnapshotData } from './types';

export const ORDER_COLS = ['Order #', 'Order Date', 'Status', 'Company', 'Industry', 'Type'] as const;
export const CALL_COLS = [
  'Call Date', 'Call Time', 'Agent', 'RASA Line', 'Contact Number', 'Company', 'Industry', 'Status', 'Duration (sec)',
  'Disposition', 'Job Title', 'Store Location', 'Persona',
] as const;
export const TOAST_COLS = ['order number', 'total', 'location_name'] as const;

const BAD_DATE_LIMIT = 0.02;
const first10 = (a: number[]) => a.slice(0, 10);
const pctStr = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '0.0') + '%';
const normKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Numeric cell: numbers as-is; text like "=1,234.50" / "$90" parsed; anything else → null. */
export function numCell(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim().replace(/^=/, '').replace(/[$,\s]/g, '');
    if (s && /^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(s)) return Number(s);
  }
  return null;
}

/** Contact Number as a digit string, never scientific notation or decimals. */
export function contactDigits(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v).toFixed(0) : '';
  const s = String(v).trim();
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) return Math.round(Number(s)).toFixed(0);
  return s.replace(/\.0+$/, '').replace(/\D/g, '');
}

/** Interns strings into a lookup array; returns the index. Optional key fn groups e.g. case-insensitively. */
function interner(key: (s: string) => string = s => s) {
  const arr: string[] = [];
  const map = new Map<string, number>();
  return {
    arr,
    idx(s: string): number {
      const k = key(s);
      let i = map.get(k);
      if (i === undefined) { i = arr.length; arr.push(s); map.set(k, i); }
      return i;
    },
  };
}

function missingCols(t: Table, cols: readonly string[]): string[] {
  return cols.filter(c => t.col(c) < 0);
}

export interface ProcessResult {
  errors: Issue[];
  warnings: Issue[];
  data: SnapshotData | null;
}

export function processWorkbook(buf: Buffer | Uint8Array, cfg: AppConfig, opts: { weekStartOverride?: string } = {}): ProcessResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  let wb;
  try {
    wb = readWorkbook(buf);
  } catch (e) {
    return { errors: [{ code: 'unreadable', title: 'File could not be read', message: `Not a readable .xlsx workbook (${(e as Error).message}).` }], warnings, data: null };
  }

  // ---- 3.1 structure ---------------------------------------------------------------------
  for (const t of [TAB_ORDERS, TAB_CALLS]) {
    if (!wb.tables.has(t)) errors.push({ code: 'missing_tab', title: 'Required tab missing', message: `Tab "${t}" was not found.`, tab: t });
  }
  for (const t of [TAB_SUMMARY, TAB_TOAST, TAB_PHONE]) {
    if (!wb.tabs.has(t)) warnings.push({ code: 'missing_optional_tab', title: 'Tab missing', message: `Tab "${t}" was not found.`, tab: t });
  }
  if (!wb.jcTab) warnings.push({ code: 'missing_optional_tab', title: 'Tab missing', message: `No tab starting with "${JC_PREFIX}" (JustCall export) was found.` });

  const orders = wb.tables.get(TAB_ORDERS);
  const calls = wb.tables.get(TAB_CALLS);
  const toast = wb.tables.get(TAB_TOAST);
  const summary = wb.tables.get(TAB_SUMMARY);

  for (const [t, cols] of [[orders, ORDER_COLS], [calls, CALL_COLS], [toast, TOAST_COLS]] as const) {
    if (!t) continue;
    const miss = missingCols(t, cols);
    if (miss.length) errors.push({ code: 'missing_column', title: 'Required column missing', message: `Missing column(s): ${miss.join(', ')}.`, tab: t.name, column: miss.join(', ') });
  }
  if (orders && !orders.rows.length) errors.push({ code: 'empty_tab', title: 'Tab is empty', message: `"${TAB_ORDERS}" has no data rows.`, tab: TAB_ORDERS });
  if (calls && !calls.rows.length) errors.push({ code: 'empty_tab', title: 'Tab is empty', message: `"${TAB_CALLS}" has no data rows.`, tab: TAB_CALLS });
  if (errors.length || !orders || !calls) return { errors, warnings, data: null };

  // ---- dates ------------------------------------------------------------------------------
  const oc = Object.fromEntries(ORDER_COLS.map(c => [c, orders.col(c)])) as Record<(typeof ORDER_COLS)[number], number>;
  const cc = Object.fromEntries(CALL_COLS.map(c => [c, calls.col(c)])) as Record<(typeof CALL_COLS)[number], number>;

  const orderDates = orders.rows.map(r => parseDateCell(r.cells[oc['Order Date']]));
  const callDates = calls.rows.map(r => parseDateCell(r.cells[cc['Call Date']]));
  const dateCheck = (tab: string, column: string, t: Table, parsed: (string | null)[]) => {
    const bad = t.rows.filter((_, i) => !parsed[i]).map(r => r.rowNum);
    if (!bad.length) return;
    const issue = { tab, column, rows: first10(bad) };
    if (bad.length / t.rows.length > BAD_DATE_LIMIT) {
      errors.push({ ...issue, code: 'bad_dates', title: 'Dates cannot be parsed', message: `${bad.length} of ${t.rows.length} rows (${pctStr(bad.length, t.rows.length)}) have an unreadable ${column} (limit 2%).` });
    } else {
      warnings.push({ ...issue, code: 'bad_dates', title: 'Some dates cannot be parsed', message: `${bad.length} row(s) have an unreadable ${column}; they are kept but excluded from date logic.` });
    }
  };
  dateCheck(TAB_ORDERS, 'Order Date', orders, orderDates);
  dateCheck(TAB_CALLS, 'Call Date', calls, callDates);

  // ---- 4.1 week ---------------------------------------------------------------------------
  let detected: string | null = null;
  if (summary && summary.col('Week Of') >= 0 && summary.rows.length) {
    const w = parseDateCell(summary.rows[0].cells[summary.col('Week Of')]);
    if (w) detected = mondayOf(w);
  }
  if (!detected) {
    const ds = callDates.filter((d): d is string => !!d).sort();
    if (!ds.length || daysBetween(ds[0], ds[ds.length - 1]) > 6) {
      errors.push({
        code: 'week_undetermined', title: 'Week cannot be determined', tab: TAB_SUMMARY, column: 'Week Of',
        message: ds.length ? `No "Week Of" in ${TAB_SUMMARY} and Call Dates span ${ds[0]} – ${ds[ds.length - 1]} (more than 7 days).` : `No "Week Of" in ${TAB_SUMMARY} and no readable Call Dates.`,
      });
    } else detected = mondayOf(ds[0]);
  }
  if (errors.length || !detected) return { errors, warnings, data: null };

  // ---- Toast join -------------------------------------------------------------------------
  const toastBy = new Map<string, { total: unknown; loc: string }>();
  if (toast) {
    const [ci, ti, li] = TOAST_COLS.map(c => toast.col(c));
    for (const r of toast.rows) {
      const k = normKey(str(r.cells[ci]));
      if (k && !toastBy.has(k)) toastBy.set(k, { total: r.cells[ti], loc: str(r.cells[li]) });
    }
  }

  const derive = makeDeriver(cfg);

  // ---- 4.2 orders -------------------------------------------------------------------------
  const seenOrder = new Set<string>();
  const dupOrders: string[] = [];
  const notInToast: string[] = [];
  const badTotal: string[] = [];
  const unknownTypes = new Map<string, number>();
  const unclassifiable = new Map<string, number>();
  const companyCanon = new Map<string, string>();
  const locRaw = interner();
  const orderRows: OrderRow[] = [];
  const orderDateOf: (string | null)[] = [];

  orders.rows.forEach((r, i) => {
    const no = str(r.cells[oc['Order #']]);
    const key = normKey(no);
    if (key) {
      if (seenOrder.has(key)) { dupOrders.push(`${no} (row ${r.rowNum})`); return; }
      seenOrder.add(key);
    }
    const rawType = str(r.cells[oc.Type]);
    let type: OrderType;
    const tl = rawType.toLowerCase();
    if (tl === 'industry') type = 'Industry';
    else if (tl === 'personal') type = 'Personal';
    else if (tl === 'unclassifiable') type = 'Unclassifiable';
    else { type = 'Unclassifiable'; unknownTypes.set(rawType || '(blank)', (unknownTypes.get(rawType || '(blank)') ?? 0) + 1); }

    let company = str(r.cells[oc.Company]).replace(/\s+/g, ' ');
    if (type === 'Personal') company = NOCO;
    else {
      if (!company) company = NO_COMPANY_NAME;
      const ck = company.toLowerCase();
      if (companyCanon.has(ck)) company = companyCanon.get(ck)!;
      else companyCanon.set(ck, company);
    }
    if (type === 'Unclassifiable') unclassifiable.set(company, (unclassifiable.get(company) ?? 0) + 1);
    const industry = type === 'Industry' ? str(r.cells[oc.Industry]).toLowerCase() : '';

    const t = key ? toastBy.get(key) : undefined;
    let value = 0;
    let li = -1;
    if (!t) notInToast.push(no || `(row ${r.rowNum})`);
    else {
      const n = numCell(t.total);
      if (n === null) badTotal.push(no); else value = n;
      if (t.loc) li = locRaw.idx(t.loc);
    }
    const date = orderDates[i] ?? '';
    orderRows.push([company, industry, value, 0, derive.location(t?.loc ?? ''), date.slice(0, 7), type, li, date]);
    orderDateOf.push(orderDates[i]);
  });

  // ---- 4.3 dials --------------------------------------------------------------------------
  const agentNames = [...new Set(calls.rows.map(r => str(r.cells[cc.Agent]) || '(no agent)'))].sort((a, b) => a.localeCompare(b));
  const agentIdx = new Map(agentNames.map((a, i) => [a, i]));
  const contacts = interner();
  const titles = interner();
  const companies = interner(s => s.toLowerCase().replace(/\s+/g, ' '));
  const dispositions = interner();
  const storeRaw = interner();
  const personaCanon = new Map<string, string>(PERSONAS.map(p => [p.toLowerCase(), p]));
  const badPersona = new Map<string, number>();
  const otherTitles = new Map<string, number>();
  const unknownStoreParts = new Set<string>();
  const callDateCounts: Record<string, number> = {};
  const dialRows: DialRow[] = [];
  let unmapped = 0;
  let noAnswer = 0;

  calls.rows.forEach((r, i) => {
    const c = r.cells;
    const indRaw = str(c[cc.Industry]);
    const companyRaw = str(c[cc.Company]).replace(/\s+/g, ' ');
    const matched = indRaw.toLowerCase() !== UNMAPPED.toLowerCase() && !(indRaw === '' && companyRaw === '');
    if (!matched) unmapped++;
    const industry = matched ? indRaw.toLowerCase() : '';
    const dur = numCell(c[cc['Duration (sec)']]) ?? 0;
    const disp = str(c[cc.Disposition]) || NO_ANSWER;
    if (disp.toLowerCase() === NO_ANSWER.toLowerCase()) noAnswer++;
    const title = matched ? str(c[cc['Job Title']]) : '';
    const storeStr = str(c[cc['Store Location']]);
    const contact = contactDigits(c[cc['Contact Number']]);

    // 3.3 persona fallback; values outside the allowed list are shown as Other
    let persona = str(c[cc.Persona]);
    if (!persona) persona = !matched ? 'Not in database' : !title ? 'No title on file' : 'Other';
    else if (personaCanon.has(persona.toLowerCase())) persona = personaCanon.get(persona.toLowerCase())!;
    else { badPersona.set(persona, (badPersona.get(persona) ?? 0) + 1); persona = 'Other'; }
    if (persona === 'Other') otherTitles.set(title || '(blank title)', (otherTitles.get(title || '(blank title)') ?? 0) + 1);

    const d = callDates[i];
    if (d) callDateCounts[d] = (callDateCounts[d] ?? 0) + 1;

    dialRows.push([
      agentIdx.get(str(c[cc.Agent]) || '(no agent)')!,
      matched ? 1 : 0,
      dur > 90 ? 1 : 0,
      derive.connected(disp),
      industry,
      persona,
      derive.stores(storeStr, matched, unknownStoreParts),
      contact ? contacts.idx(contact) : -1,
      dur,
      title ? titles.idx(title) : -1,
      matched ? companies.idx(companyRaw || NO_COMPANY_NAME) : -1,
      dispositions.idx(disp),
      storeStr ? storeRaw.idx(storeStr) : -1,
    ]);
  });

  const os = orderSummary(orderRows);
  const data: SnapshotData = {
    v: 1,
    meta: {
      ...weekWindow(detected),
      detectedWeekStart: detected,
      callDates: callDateCounts,
      counts: {
        ytdOrders: os.total, identified: os.identified, personal: os.personal, unclassifiable: os.unclassifiable,
        weekOrders: 0, weekValue: 0,
        dials: dialRows.length, uniqueContacts: contacts.arr.length, unmapped,
        connected: dialRows.reduce((s, x) => s + x[3], 0), conv90: dialRows.reduce((s, x) => s + x[2], 0), noAnswer,
      },
    },
    agents: agentNames,
    titles: titles.arr,
    companies: companies.arr,
    dispositions: dispositions.arr,
    storeRaw: storeRaw.arr,
    locRaw: locRaw.arr,
    orders: orderRows,
    dials: dialRows,
  };

  // ---- 3.2 warnings -----------------------------------------------------------------------
  if (toast && notInToast.length) {
    warnings.push({ code: 'not_in_toast', title: 'Orders not found in Toast', tab: TAB_ORDERS, column: 'Order #', message: `${notInToast.length} of ${orderRows.length} orders (${pctStr(notInToast.length, orderRows.length)}) were not found in Toast; their value is $0 and location "Unknown".`, items: notInToast });
  } else if (!toast) {
    warnings.push({ code: 'not_in_toast', title: 'Orders not found in Toast', tab: TAB_TOAST, message: `No Toast tab: all ${orderRows.length} orders (100.0%) have value $0 and location "Unknown".` });
  }
  if (badTotal.length) warnings.push({ code: 'bad_total', title: 'Toast total missing or not numeric', tab: TAB_TOAST, column: 'total', message: `${badTotal.length} joined order(s) have no numeric total; value set to $0.`, items: badTotal });
  if (unmapped) warnings.push({ code: 'unmapped', title: 'Unmapped dials', tab: TAB_CALLS, column: 'Industry', message: `${unmapped.toLocaleString('en-US')} of ${dialRows.length.toLocaleString('en-US')} dials (${pctStr(unmapped, dialRows.length)}) have Industry = Unmapped (not in database).` });
  if (unclassifiable.size) warnings.push({ code: 'unclassifiable', title: 'Unclassifiable order companies', tab: TAB_ORDERS, column: 'Type', message: `${os.unclassifiable} order(s) from ${unclassifiable.size} compan${unclassifiable.size === 1 ? 'y' : 'ies'} are Unclassifiable — fix them in the sheet if possible.`, items: [...unclassifiable].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} — ${n} order${n === 1 ? '' : 's'}`) });
  if (unknownTypes.size) warnings.push({ code: 'unknown_type', title: 'Unknown order Type values', tab: TAB_ORDERS, column: 'Type', message: 'These Type values are not Industry / Personal / Unclassifiable and were treated as Unclassifiable.', items: [...unknownTypes].map(([k, n]) => `${k} — ${n}`) });
  if (badPersona.size) warnings.push({ code: 'bad_persona', title: 'Persona values outside the allowed list', tab: TAB_CALLS, column: 'Persona', message: 'Shown as "Other" on the dashboard.', items: [...badPersona].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} — ${n} dials`) });
  if (otherTitles.size) warnings.push({ code: 'other_titles', title: 'Top job titles with persona "Other"', tab: TAB_CALLS, column: 'Job Title', message: `Top ${Math.min(25, otherTitles.size)} titles by dials, for review.`, items: [...otherTitles].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k} — ${n} dials`) });
  const ud = unknownDispositionsIssue(data, derive);
  if (ud) warnings.push(ud);
  if (unknownStoreParts.size) warnings.push({ code: 'unknown_store', title: 'Store Location tags not recognised', tab: TAB_CALLS, column: 'Store Location', message: 'No store keyword matched these tags; dials with only these tags count as "No store on file". Add keywords in Settings.', items: [...unknownStoreParts] });
  if (dupOrders.length) warnings.push({ code: 'duplicate_orders', title: 'Duplicate Order #', tab: TAB_ORDERS, column: 'Order #', message: `${dupOrders.length} duplicate row(s) removed (first occurrence kept).`, items: dupOrders });
  warnings.push(...reconcile(summary, data));

  return { errors, warnings: [...warnings, ...applyWeek(data, opts.weekStartOverride ? mondayOf(opts.weekStartOverride) : detected)], data };
}

/**
 * Set the week window and everything that depends on it (thisWeek flags, week counts) and return the
 * week-dependent warnings. Also used when the admin overrides week_start in the preview.
 */
export function applyWeek(data: SnapshotData, weekStart: string): Issue[] {
  const w = weekWindow(weekStart);
  Object.assign(data.meta, w);
  let n = 0;
  let value = 0;
  const after: string[] = [];
  for (const o of data.orders) {
    const d = o[8];
    o[3] = d && d >= w.weekStart && d <= w.weekEnd ? 1 : 0;
    if (o[3]) { n++; value += o[2]; }
    if (d && d > w.weekEnd) after.push(`${o[0]} — ${d}`);
  }
  data.meta.counts.weekOrders = n;
  data.meta.counts.weekValue = value;

  const out: Issue[] = [];
  const outside = Object.entries(data.meta.callDates).filter(([d]) => d < w.weekStart || d > w.weekEnd).sort();
  if (outside.length) {
    const total = outside.reduce((s, [, c]) => s + c, 0);
    out.push({ code: 'calls_outside_week', title: 'Call dates outside the week', tab: TAB_CALLS, column: 'Call Date', message: `${total} dial(s) are dated outside ${w.weekStart} – ${w.weekEnd}; they are still counted.`, items: outside.map(([d, c]) => `${d} — ${c} dials`) });
  }
  if (after.length) out.push({ code: 'orders_after_week', title: 'Orders dated after the week end', tab: TAB_ORDERS, column: 'Order Date', message: `${after.length} order(s) are dated after ${w.weekEnd}; they stay in the YTD data.`, items: after });
  return out;
}

export const WEEK_WARNING_CODES = ['calls_outside_week', 'orders_after_week'];

/** 4.6: compare row-level counts with Industry_Summary (warning only). */
export function reconcile(summary: Table | undefined, data: SnapshotData): Issue[] {
  if (!summary) return [];
  const cols = ['Industry', 'Type', 'YTD Orders', 'Dials This Week'].map(c => summary.col(c));
  if (cols.some(c => c < 0)) {
    return [{ code: 'reconciliation', title: 'Reconciliation skipped', tab: TAB_SUMMARY, message: 'Industry_Summary is missing Industry / Type / YTD Orders / Dials This Week.' }];
  }
  const [ii, ti, oi, di] = cols;
  const os = orderSummary(data.orders);
  const dc = new Map<string, number>();
  let unmapped = 0;
  for (const r of data.dials) {
    if (!r[1]) unmapped++;
    else if (r[4]) dc.set(r[4], (dc.get(r[4]) ?? 0) + 1);
  }
  const num = (v: unknown) => numCell(v) ?? 0;
  const diffs: string[] = [];
  const seen = new Set<string>();
  const cmp = (label: string, what: string, sheet: number, app: number) => {
    if (sheet !== app) diffs.push(`${label}: ${what} sheet ${sheet} vs app ${app}`);
  };
  for (const r of summary.rows) {
    const ind = str(r.cells[ii]).toLowerCase();
    const type = str(r.cells[ti]).toLowerCase();
    if (!ind && !type) continue;
    if (type === 'industry') {
      seen.add(ind);
      cmp(str(r.cells[ii]), 'YTD orders', num(r.cells[oi]), os.ind.get(ind) ?? 0);
      cmp(str(r.cells[ii]), 'dials', num(r.cells[di]), dc.get(ind) ?? 0);
    } else if (type === 'personal') cmp('Personal / Individual', 'YTD orders', num(r.cells[oi]), os.personal);
    else if (type === 'unclassifiable') cmp('Unclassifiable', 'YTD orders', num(r.cells[oi]), os.unclassifiable);
    else if (type.startsWith('unmapped')) cmp('Unmapped', 'dials', num(r.cells[di]), unmapped);
  }
  for (const [k, n] of os.ind) if (!seen.has(k)) diffs.push(`${k}: ${n} YTD orders, missing from Industry_Summary`);
  for (const [k, n] of dc) if (!seen.has(k)) diffs.push(`${k}: ${n} dials, missing from Industry_Summary`);
  return diffs.length
    ? [{ code: 'reconciliation', title: 'Reconciliation mismatches', tab: TAB_SUMMARY, message: `${diffs.length} difference(s) between Industry_Summary and the row data.`, items: diffs }]
    : [];
}
