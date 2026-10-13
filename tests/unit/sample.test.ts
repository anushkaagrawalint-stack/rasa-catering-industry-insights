// Acceptance numbers from spec section 10, computed by the pipeline on the sample workbook.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/lib/config';
import { dialKpis, orderSummary, tvdRows } from '@/lib/metrics';
import { processWorkbook, type ProcessResult } from '@/lib/pipeline/process';

export const SAMPLE = path.resolve(__dirname, '../../reference/rasa industry catering (1).xlsx');

let r: ProcessResult;
beforeAll(() => {
  const t = Date.now();
  r = processWorkbook(readFileSync(SAMPLE), DEFAULT_CONFIG);
  expect(Date.now() - t).toBeLessThan(15_000);
});

describe('sample workbook — Week of Oct 5, 2026', () => {
  it('has no hard errors and detects the week', () => {
    expect(r.errors).toEqual([]);
    expect(r.data!.meta).toMatchObject({ weekStart: '2026-10-05', weekEnd: '2026-10-11', ytdStart: '2026-01-01', ytdEnd: '2026-10-11' });
  });

  it('YTD orders 514 = 415 identified + 67 personal + 32 unclassifiable', () => {
    const s = orderSummary(r.data!.orders);
    expect([s.total, s.identified, s.personal, s.unclassifiable]).toEqual([514, 415, 67, 32]);
  });

  it('order share denominator is 415', () => {
    const top = tvdRows(r.data!.orders, r.data!.dials)[0];
    expect(top.ind).toBe('nonprofit organization management');
    expect(top.orderShare).toBeCloseTo((100 * top.orders) / 415, 10);
  });

  it('dial KPIs', () => {
    const k = dialKpis(r.data!.dials);
    expect(k.dials).toBe(2919);
    expect(k.unique).toBe(2530);
    expect(k.connected).toBe(282);
    expect(k.connPct.toFixed(1)).toBe('9.7');
    expect(k.conv90).toBe(237);
    expect(r.data!.dials.filter(d => !d[1]).length).toBe(872);
    expect(r.data!.meta.counts.noAnswer).toBe(2629);
  });

  it('unmapped dials are "Not in database" persona and store', () => {
    const un = r.data!.dials.filter(d => !d[1]);
    expect(un.every(d => d[5] === 'Not in database' && d[6].length === 1 && d[6][0] === 'Not in database')).toBe(true);
  });

  it('persona counts', () => {
    const c: Record<string, number> = {};
    for (const d of r.data!.dials) c[d[5]] = (c[d[5]] ?? 0) + 1;
    expect(c).toEqual({
      'Executive Assistant': 690, 'Office Manager / Admin': 673, 'Admin Support': 280, 'Chief of Staff': 168, Events: 88,
      'HR / People Ops': 68, Other: 47, 'Facilities / Operations': 19, 'Leadership / Director': 12, 'No title on file': 2, 'Not in database': 872,
    });
  });

  it('this week: 9 orders, $3,738.43, two of them $0', () => {
    const wk = r.data!.orders.filter(o => o[3]);
    expect(wk).toHaveLength(9);
    expect(wk.reduce((s, o) => s + o[2], 0)).toBeCloseTo(3738.43, 2);
    expect(wk.filter(o => o[2] === 0)).toHaveLength(2);
  });

  it('months 2026-01 … 2026-10', () => {
    expect([...new Set(r.data!.orders.map(o => o[5]))].sort()).toEqual(
      ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('every order joins to Toast; locations are mapped', () => {
    expect(r.warnings.find(w => w.code === 'not_in_toast')).toBeUndefined();
    expect(new Set(r.data!.orders.map(o => o[4]))).toEqual(new Set(['Mount Vernon Triangle', 'Rockville', 'National Landing / Arlington', 'Mosaic District / Fairfax']));
  });

  it('reconciliation has no mismatches', () => {
    expect(r.warnings.find(w => w.code === 'reconciliation')).toBeUndefined();
  });

  it('agent filter changes dial side only', () => {
    const agents = r.data!.agents;
    expect(agents).toEqual([...agents].sort((a, b) => a.localeCompare(b)));
    const ai = agents.indexOf('Nia A');
    expect(r.data!.dials.filter(d => d[0] === ai)).toHaveLength(929);
  });

  it('payload stays well under 1 MB gzipped', async () => {
    const { gzipSync } = await import('node:zlib');
    expect(gzipSync(JSON.stringify(r.data)).length).toBeLessThan(1_000_000);
  });
});
