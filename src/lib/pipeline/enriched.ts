// Reader for the "RASA_Dashboard_Data" workbook (tabs: orders, calls). Industries come pre-enriched.
// Rules: orders with no company, unclassified orders and non-business orders are all Personal;
// calls whose industry is Unknown are dropped entirely.
import type { AppConfig } from '../config';
import { NO_ANSWER, NO_COMPANY_NAME, NOCO } from '../constants';
import { orderSummary } from '../metrics';
import { mondayOf, parseDateCell, weekWindow } from './dates';
import { makeDeriver, unknownDispositionsIssue } from './derive';
import { applyWeek, contactDigits, numCell, type ProcessResult } from './process';
import { readWorkbook, str, type Table } from './readWorkbook';
import type { DialRow, Issue, OrderRow, SnapshotData } from './types';

export const ENRICHED_ORDERS = 'orders';
export const ENRICHED_CALLS = 'calls';
const ORDER_NEEDS = ['order_id', 'order_date', 'order_value', 'company_name', 'industry', 'store_location'] as const;
const CALL_NEEDS = ['persona', 'call_date', 'call_week_start', 'contact_number', 'disposition', 'duration_sec', 'industry', 'store_location'] as const;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
/** The workbook's persona labels → the dashboard's persona list. */
const PERSONA_MAP: Record<string, string> = {
  'office / workplace manager': 'Office Manager / Admin',
  'executive / admin assistant': 'Executive Assistant',
  'chief of staff': 'Chief of Staff',
  'operations / admin': 'Admin Support',
  'hr / people': 'HR / People Ops',
  'events / hospitality': 'Events',
  'executive / leadership': 'Leadership / Director',
  procurement: 'Other',
  other: 'Other',
  unknown: 'No title on file',
  'no contact match': 'Not in database',
};
/** All education industries are one category. */
const EDUCATION = new Set(['higher education', 'k-12 education', 'education services & training']);
const industryKey = (raw: string) => (EDUCATION.has(norm(raw)) ? 'education' : raw.trim().toLowerCase());
const isUnknown = (s: string) => !s.trim() || norm(s) === 'unknown';
const isPersonalIndustry = (s: string) => /^personal\b/i.test(s.trim()) || /^unclassified/i.test(s.trim()) || /^no company/i.test(s.trim());

/** True when the workbook has the enriched layout (an `orders` and a `calls` tab). */
export function isEnrichedWorkbook(buf: Buffer | Uint8Array): boolean {
  const names = readWorkbook(buf, [ENRICHED_ORDERS, ENRICHED_CALLS]).sheetNames.map(n => n.trim().toLowerCase());
  return names.includes(ENRICHED_ORDERS) && names.includes(ENRICHED_CALLS);
}

function interner(key: (s: string) => string = s => s) {
  const arr: string[] = [];
  const map = new Map<string, number>();
  return { arr, idx(s: string) { const k = key(s); let i = map.get(k); if (i === undefined) { i = arr.length; arr.push(s); map.set(k, i); } return i; } };
}

export function processEnriched(buf: Buffer | Uint8Array, cfg: AppConfig): ProcessResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const wb = readWorkbook(buf, [ENRICHED_ORDERS, ENRICHED_CALLS]);
  const orders = wb.tables.get(ENRICHED_ORDERS);
  const calls = wb.tables.get(ENRICHED_CALLS);
  const need = (t: Table | undefined, name: string, cols: readonly string[]) => {
    if (!t) { errors.push({ code: 'missing_tab', title: 'Required tab missing', message: `Tab "${name}" was not found.`, tab: name }); return; }
    const miss = cols.filter(c => t.col(c) < 0);
    if (miss.length) errors.push({ code: 'missing_column', title: 'Required column missing', message: `Missing column(s) in "${name}": ${miss.join(', ')}.`, tab: name });
    if (!t.rows.length) errors.push({ code: 'empty_tab', title: 'Tab is empty', message: `"${name}" has no data rows.`, tab: name });
  };
  need(orders, ENRICHED_ORDERS, ORDER_NEEDS);
  need(calls, ENRICHED_CALLS, CALL_NEEDS);
  if (errors.length || !orders || !calls) return { errors, warnings, data: null };

  const derive = makeDeriver(cfg);
  const col = (t: Table, n: string) => t.col(n);

  // ---- week: the Monday every call belongs to ---------------------------------------------
  const weekCounts = new Map<string, number>();
  for (const r of calls.rows) {
    const d = parseDateCell(r.cells[col(calls, 'call_week_start')]) ?? parseDateCell(r.cells[col(calls, 'call_date')]);
    if (d) { const m = mondayOf(d); weekCounts.set(m, (weekCounts.get(m) ?? 0) + 1); }
  }
  const detected = [...weekCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!detected) return { errors: [{ code: 'week_undetermined', title: 'Week cannot be determined', message: 'No readable call dates.', tab: ENRICHED_CALLS }], warnings, data: null };
  if (weekCounts.size > 1) warnings.push({ code: 'multiple_weeks', title: 'Calls span several weeks', message: `Calls fall in ${weekCounts.size} weeks; the week with the most calls (${detected}) is used.`, items: [...weekCounts].map(([w, n]) => `${w} — ${n} calls`) });
  const w = weekWindow(detected);

  // ---- orders -----------------------------------------------------------------------------
  const locRaw = interner();
  const companyCanon = new Map<string, string>();
  const seen = new Set<string>();
  const orderRows: OrderRow[] = [];
  let dup = 0, noDate = 0;
  for (const r of orders.rows) {
    const c = r.cells;
    const id = str(c[col(orders, 'order_id')]);
    if (id) { if (seen.has(id)) { dup++; continue; } seen.add(id); }
    const date = parseDateCell(c[col(orders, 'order_date')]);
    if (!date) { noDate++; continue; }
    const value = numCell(c[col(orders, 'order_value')]) ?? 0;
    // $0 orders are ignored.
    if (value <= 0) continue;
    let company = str(c[col(orders, 'company_name')]).replace(/\s+/g, ' ');
    const industryRaw = str(c[col(orders, 'industry')]);
    const personal = !company || isPersonalIndustry(industryRaw);
    if (personal) company = NOCO;
    else {
      const ck = company.toLowerCase();
      if (companyCanon.has(ck)) company = companyCanon.get(ck)!; else companyCanon.set(ck, company);
    }
    const store = str(c[col(orders, 'store_location')]);
    orderRows.push([
      company, personal ? '' : industryKey(industryRaw), value, 0,
      derive.location(store), date.slice(0, 7), personal ? 'Personal' : 'Industry', store ? locRaw.idx(store) : -1, date,
    ]);
  }

  // ---- dials ------------------------------------------------------------------------------
  const contacts = interner();
  const companies = interner(s => s.toLowerCase().replace(/\s+/g, ' '));
  const dispositions = interner();
  const titles = interner();
  const storeRaw = interner();
  const unknownStoreParts = new Set<string>();
  const callDateCounts: Record<string, number> = {};
  const dialRows: DialRow[] = [];
  let noAnswer = 0;
  for (const r of calls.rows) {
    const c = r.cells;
    const indRaw = str(c[col(calls, 'industry')]);
    if (isUnknown(indRaw)) continue;
    const companyRaw = str(c[col(calls, 'company_name')]).replace(/\s+/g, ' ');
    const dur = numCell(c[col(calls, 'duration_sec')]) ?? 0;
    const disp = str(c[col(calls, 'disposition')]) || NO_ANSWER;
    if (norm(disp) === norm(NO_ANSWER)) noAnswer++;
    const storeStr = str(c[col(calls, 'store_location')]);
    const personaRaw = str(c[col(calls, 'persona')]);
    const persona = PERSONA_MAP[norm(personaRaw)] ?? (personaRaw ? 'Other' : 'No title on file');
    const title = str(c[col(calls, 'contact_title')]);
    const contact = contactDigits(c[col(calls, 'contact_number')]);
    const d = parseDateCell(c[col(calls, 'call_date')]);
    if (d) callDateCounts[d] = (callDateCounts[d] ?? 0) + 1;
    const connected = derive.connected(disp);
    dialRows.push([
      0, 1, connected && dur > 90 ? 1 : 0, connected, industryKey(indRaw), persona,
      derive.stores(storeStr, true, unknownStoreParts), contact ? contacts.idx(contact) : -1, dur, title ? titles.idx(title) : -1,
      companies.idx(companyRaw || NO_COMPANY_NAME), dispositions.idx(disp), storeStr ? storeRaw.idx(storeStr) : -1,
    ]);
  }
  if (!dialRows.length) return { errors: [{ code: 'empty_tab', title: 'No calls found', message: 'The calls tab has no usable rows.', tab: ENRICHED_CALLS }], warnings, data: null };

  const os = orderSummary(orderRows);
  const data: SnapshotData = {
    v: 1,
    meta: {
      ...w, detectedWeekStart: detected, callDates: callDateCounts,
      counts: {
        ytdOrders: os.total, identified: os.identified, personal: os.personal, unclassifiable: os.unclassifiable, weekOrders: 0, weekValue: 0,
        dials: dialRows.length, uniqueContacts: contacts.arr.length, unmapped: 0,
        connected: dialRows.reduce((s, x) => s + x[3], 0), conv90: dialRows.reduce((s, x) => s + x[2], 0), noAnswer,
      },
    },
    agents: ['All reps'], titles: titles.arr, companies: companies.arr, dispositions: dispositions.arr, storeRaw: storeRaw.arr, locRaw: locRaw.arr,
    orders: orderRows, dials: dialRows,
  };

  if (dup) warnings.push({ code: 'duplicate_orders', title: 'Duplicate order ids', message: `${dup} duplicate row(s) removed.` });
  if (noDate) warnings.push({ code: 'bad_dates', title: 'Orders without a readable date', message: `${noDate} order(s) skipped.` });
  const ud = unknownDispositionsIssue(data, derive);
  if (ud) warnings.push(ud);
  const weekWarnings = applyWeek(data, detected);
  return { errors, warnings: [...warnings, ...weekWarnings], data };
}
