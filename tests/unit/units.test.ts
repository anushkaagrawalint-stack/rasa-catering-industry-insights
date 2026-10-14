import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { DEFAULT_CONFIG } from '@/lib/config';
import { gapText, makeDisp, pc, pct } from '@/lib/format';
import { dialKpis, tvdRows } from '@/lib/metrics';
import { mondayOf, parseDateCell, rangeLabel, serialToISO, weekTitle, weekWindow } from '@/lib/pipeline/dates';
import { makeDeriver } from '@/lib/pipeline/derive';
import { CALL_COLS, contactDigits, numCell, ORDER_COLS, processWorkbook } from '@/lib/pipeline/process';
import type { DialRow, OrderRow } from '@/lib/pipeline/types';

const d = makeDeriver(DEFAULT_CONFIG);

describe('dates / week detection', () => {
  it('converts Excel serials and text dates', () => {
    expect(serialToISO(46300)).toBe('2026-10-05');
    expect(serialToISO(46300.81)).toBe('2026-10-05');
    expect(parseDateCell('2026-10-06')).toBe('2026-10-06');
    expect(parseDateCell('10/6/2026')).toBe('2026-10-06');
    expect(parseDateCell('Oct 6, 2026')).toBe('2026-10-06');
    expect(parseDateCell('6 Oct 2026')).toBe('2026-10-06');
    expect(parseDateCell('2/30/2026')).toBeNull();
    expect(parseDateCell('soon')).toBeNull();
    expect(parseDateCell(null)).toBeNull();
  });
  it('finds the Monday and the windows', () => {
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05'); // Sunday belongs to the week before
    expect(mondayOf('2026-10-08')).toBe('2026-10-05');
    expect(weekWindow('2026-10-05')).toEqual({ weekStart: '2026-10-05', weekEnd: '2026-10-11', ytdStart: '2026-01-01', ytdEnd: '2026-10-11' });
    expect(weekTitle(weekWindow('2026-10-05'))).toBe('Week of Oct 5 – Oct 11, 2026');
    expect(rangeLabel('2026-01-01', '2026-10-11')).toBe('Jan 1 – Oct 11, 2026');
    expect(rangeLabel('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });
});

describe('location mapping (4.2)', () => {
  it('maps Toast location_name, folding Ballpark into MVT', () => {
    expect(d.location('Mt Vernon Triangle')).toBe('Mount Vernon Triangle');
    expect(d.location('Ballpark')).toBe('Mount Vernon Triangle');
    expect(d.location(' rockville ')).toBe('Rockville');
    expect(d.location('National Landing')).toBe('National Landing / Arlington');
    expect(d.location('Mosaic District')).toBe('Mosaic District / Fairfax');
    expect(d.location('Somewhere')).toBe('Unknown');
    expect(d.location('')).toBe('Unknown');
  });
});

describe('store keyword mapping (4.3)', () => {
  it('normalises store tags', () => {
    expect(d.stores('RASA Mount Vernon Triangle(20001) / RASA Navy Yard / Ballpark (20003)', true)).toEqual(['Mount Vernon Triangle']);
    expect(d.stores('RASA Arlington (22202); RASA Rockville (20852)', true)).toEqual(['National Landing / Arlington', 'Rockville']);
    expect(d.stores('RASA Fairfax (22031)', true)).toEqual(['Mosaic District / Fairfax']);
    expect(d.stores('rasa navy yard / ballpark (20003); RASA Mount Vernon Triangle(20001)', true)).toEqual(['Mount Vernon Triangle']);
    expect(d.stores('', true)).toEqual(['No store on file']);
    expect(d.stores('RASA Arlington (22202)', false)).toEqual(['Not in database']);
    const unknown = new Set<string>();
    expect(d.stores('RASA Baltimore', true, unknown)).toEqual(['No store on file']);
    expect([...unknown]).toEqual(['RASA Baltimore']);
  });
});

describe('disposition mapping (4.3)', () => {
  it('uses the default connected list', () => {
    for (const v of ['MQL', 'MQL Follow-Up', 'Interested/FUP', 'Interested But Follow Up Needed', 'Call Back Later', 'Not Interested', 'Wrong Number', 'Do Not Call Again']) expect(d.connected(v)).toBe(1);
    for (const v of ['Left Voicemail', 'No Answer', 'Bad Number', 'Meeting Set', 'Send an Email', '']) expect(d.connected(v)).toBe(0);
    expect(d.connected('not interested')).toBe(1);
    expect(d.isKnownDisposition('Busy')).toBe(false);
    expect(d.connected('Busy')).toBe(0);
  });
});

describe('cell parsing', () => {
  it('reads contact numbers as digit strings', () => {
    expect(contactDigits(12029445000)).toBe('12029445000');
    expect(contactDigits('12029445000')).toBe('12029445000');
    expect(contactDigits('1.2029445E+10')).toBe('12029445000');
    expect(contactDigits('12029445000.0')).toBe('12029445000');
    expect(contactDigits(null)).toBe('');
  });
  it('reads Toast totals', () => {
    expect(numCell(401.55)).toBe(401.55);
    expect(numCell('=401.55')).toBe(401.55);
    expect(numCell('$1,234.50')).toBe(1234.5);
    expect(numCell('n/a')).toBeNull();
    expect(numCell(null)).toBeNull();
  });
});

describe('share / gap maths (5)', () => {
  const o = (industry: string, type: OrderRow[6] = 'Industry'): OrderRow => ['Co', industry, 10, 0, 'Rockville', '2026-01', type, -1, '2026-01-05'];
  const dial = (industry: string, matched: 0 | 1 = 1, connected: 0 | 1 = 0, conv90: 0 | 1 = 0, contact = 0): DialRow =>
    [0, matched, conv90, connected, industry, 'Other', [], contact, 0, -1, -1, 0, -1];
  it('order share uses identified orders; dial share uses matched dials with industry', () => {
    const orders = [o('law'), o('law'), o('law'), o('tech'), o('', 'Personal'), o('', 'Unclassifiable')];
    const dials = [dial('law'), dial('tech'), dial('tech'), dial('tech'), dial('', 0)];
    const rows = tvdRows(orders, dials);
    expect(rows.map(r => r.ind)).toEqual(['law', 'tech']);
    expect(rows[0].orderShare).toBeCloseTo(75);
    expect(rows[0].dialShare).toBeCloseTo(25);
    expect(gapText(rows[0].gap)).toBe('-50.0');
    expect(gapText(rows[1].gap)).toBe('+50.0');
  });
  it('zero dials → 0 share, negative gap', () => {
    const rows = tvdRows([o('law')], []);
    expect(rows[0].dials).toBe(0);
    expect(pct(rows[0].dialShare)).toBe('0.0%');
    expect(rows[0].gap).toBeLessThan(0);
  });
  it('48 of 374 = 12.8%', () => expect(pct(pc(48, 374))).toBe('12.8%'));
  it('division by zero is 0', () => expect(pc(5, 0)).toBe(0));
  it('KPI maths ignores blank contacts', () => {
    const k = dialKpis([dial('a', 1, 1, 1, 0), dial('a', 1, 1, 0, 0), dial('a', 1, 0, 0, -1)]);
    expect(k).toMatchObject({ dials: 3, unique: 1, repeat: 2, connected: 2, conv90: 1 });
    expect(k.convPct).toBe(50);
  });
  it('display names', () => {
    const disp = makeDisp({ 'information technology & services': 'IT & Services' });
    expect(disp('information technology & services')).toBe('IT & Services');
    expect(disp('higher education')).toBe('Higher Education');
  });
});

// ---- small synthetic workbooks for join / validation behaviour ----------------------------
function book(tabs: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(tabs)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
const call = (over: Partial<Record<(typeof CALL_COLS)[number], unknown>> = {}) =>
  CALL_COLS.map(c => ({ 'Call Date': '2026-10-06', Agent: 'A', 'Contact Number': '12025550100', Industry: 'Law Practice', Company: 'Firm', 'Duration (sec)': 10, Persona: 'Events', ...over } as Record<string, unknown>)[c] ?? null);

describe('Toast join + validation', () => {
  it('joins case-insensitively on order number and flags misses', () => {
    const buf = book({
      YTD_Orders: [[...ORDER_COLS], ['order #000001', '2026-10-06', 'CLOSED', 'Acme', 'Law Practice', 'Industry'], ['ORDER #000002 ', '2026-03-01', 'CLOSED', 'acme', 'Law Practice', 'Industry'], ['order #000003', '2026-03-02', 'CLOSED', 'Zed', 'Law Practice', 'Industry'], ['order #000001', '2026-03-03', 'CLOSED', 'Dup', '', 'Unclassifiable']],
      Calls_This_Week: [[...CALL_COLS], call(), call({ Industry: 'Unmapped', Company: null, Persona: null, Disposition: null })],
      Toast: [['order number', 'date', 'total', 'location_name'], ['Order #000001', '13/10/2026', 100.5, 'Ballpark'], ['order #000002', 'x', '=50', 'Rockville']],
    });
    const r = processWorkbook(buf, DEFAULT_CONFIG);
    expect(r.errors).toEqual([]);
    const o = r.data!.orders;
    expect(o).toHaveLength(3); // duplicate dropped
    expect(o[0].slice(0, 5)).toEqual(['Acme', 'law practice', 100.5, 1, 'Mount Vernon Triangle']);
    expect(o[1][0]).toBe('Acme'); // first-seen spelling
    expect(o[1][2]).toBe(50);
    expect(o[2][2]).toBe(0);
    expect(o[2][4]).toBe('Unknown');
    const codes = r.warnings.map(w => w.code);
    expect(codes).toContain('not_in_toast');
    expect(codes).toContain('duplicate_orders');
    // blank persona on an unmapped dial → Not in database; blank disposition → No Answer
    const dial = r.data!.dials[1];
    expect(dial[5]).toBe('Not in database');
    expect(r.data!.dispositions[dial[11]]).toBe('No Answer');
    expect(dial[6]).toEqual(['Not in database']);
    expect(r.data!.meta.weekStart).toBe('2026-10-05'); // from call dates (no Industry_Summary)
  });

  it('blocks on missing columns and unparseable dates', () => {
    const r1 = processWorkbook(book({ YTD_Orders: [['Order #'], ['x']], Calls_This_Week: [[...CALL_COLS], call()] }), DEFAULT_CONFIG);
    expect(r1.errors.map(e => e.code)).toContain('missing_column');
    const rows = Array.from({ length: 10 }, (_, i) => ['o' + i, i < 9 ? '2026-10-06' : 'garbage', 'CLOSED', 'A', 'X', 'Industry']);
    const r2 = processWorkbook(book({ YTD_Orders: [[...ORDER_COLS], ...rows], Calls_This_Week: [[...CALL_COLS], call()] }), DEFAULT_CONFIG);
    expect(r2.errors[0]).toMatchObject({ code: 'bad_dates', tab: 'YTD_Orders', column: 'Order Date', rows: [11] });
  });

  it('cannot determine the week when call dates span > 7 days', () => {
    const r = processWorkbook(book({ YTD_Orders: [[...ORDER_COLS], ['o', '2026-10-06', 'CLOSED', 'A', 'X', 'Industry']], Calls_This_Week: [[...CALL_COLS], call(), call({ 'Call Date': '2026-10-20' })] }), DEFAULT_CONFIG);
    expect(r.errors.map(e => e.code)).toEqual(['week_undetermined']);
  });
});
