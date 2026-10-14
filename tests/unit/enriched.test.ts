import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/lib/config';
import { isEnrichedWorkbook, processEnriched } from '@/lib/pipeline/enriched';
import { orderSummary } from '@/lib/metrics';

const buf = readFileSync(path.resolve(__dirname, '../../data/week-2026-10-05.xlsx'));
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
    expect([c.ytdOrders, c.personal, c.identified, c.dials, c.weekOrders]).toEqual([479, 73, 406, 2333, 6]);
    expect(c.weekValue).toBeCloseTo(2789.52, 2);
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
});
