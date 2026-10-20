import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/lib/config';
import { isEnrichedWorkbook, processEnriched } from '@/lib/pipeline/enriched';
import { orderSummary } from '@/lib/metrics';

const dataDir = path.resolve(__dirname, '../../data');
const buf = readFileSync(path.join(dataDir, 'week-2026-10-05.xlsx'));
const r = processEnriched(buf, DEFAULT_CONFIG);

describe('RASA_Dashboard_Data workbook', () => {
  it('is detected and parses without errors', () => {
    expect(isEnrichedWorkbook(buf)).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.data!.meta.weekStart).toBe('2026-10-05');
  });
  it('counts every order with no company, and unclassified orders, as personal', () => {
    const d = r.data!;
    expect(d.orders.filter(o => o[6] === 'Personal').every(o => o[0] === '(individual / no company)')).toBe(true);
    expect(d.orders.some(o => o[6] === 'Industry' && (!o[0] || /unclassified|personal|no company/i.test(o[1])))).toBe(false);
    expect(orderSummary(d.orders).unclassifiable).toBe(0);
  });
  it('has the expected totals', () => {
    const c = r.data!.meta.counts;
    expect([c.ytdOrders, c.personal, c.identified, c.dials, c.weekOrders]).toEqual([497, 76, 421, 2333, 7]);
    expect(c.weekValue).toBeCloseTo(3738.43, 2);
    expect([c.connected, c.conv90]).toEqual([221, 98]);
  });
  it('drops calls with an unknown industry', () => {
    const d = r.data!;
    expect(d.dials.length).toBe(2333);
    expect(d.dials.some(x => !x[4] || x[4] === 'unknown')).toBe(false);
  });
  it('maps personas (known-industry calls only)', () => {
    const m: Record<string, number> = {};
    for (const x of r.data!.dials) m[x[5]] = (m[x[5]] ?? 0) + 1;
    expect(m).toEqual({
      'Office Manager / Admin': 834, 'Executive Assistant': 780, 'No title on file': 265, 'Chief of Staff': 186,
      'Admin Support': 125, 'HR / People Ops': 63, Events: 49, Other: 25, 'Leadership / Director': 6,
    });
  });
  it('puts all education industries in one category', () => {
    const d = r.data!;
    const all = [...d.orders.map(o => o[1]), ...d.dials.map(x => x[4])];
    expect(all.some(i => /higher education|k-12|education services/.test(i))).toBe(false);
    expect(d.orders.some(o => o[1] === 'education') && d.dials.some(x => x[4] === 'education')).toBe(true);
  });
});

describe('week of Oct 12 workbook', () => {
  const w2 = processEnriched(readFileSync(path.join(dataDir, 'week-2026-10-12.xlsx')), DEFAULT_CONFIG);
  it('parses and has the expected totals', () => {
    expect(w2.errors).toEqual([]);
    const d = w2.data!;
    expect([d.meta.weekStart, d.meta.weekEnd]).toEqual(['2026-10-12', '2026-10-18']);
    const c = d.meta.counts;
    expect([c.ytdOrders, c.weekOrders, c.dials, c.connected, c.conv90]).toEqual([510, 12, 2866, 331, 122]);
    expect(c.weekValue).toBeCloseTo(7310.57, 2);
  });
});
