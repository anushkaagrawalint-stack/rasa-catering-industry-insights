// Metric definitions (spec 5). Pure functions over the row-level snapshot data.
import { pc } from './format';
import type { DialRow, OrderRow } from './pipeline/types';

export interface OrderSummary {
  total: number;
  identified: number;
  personal: number;
  unclassifiable: number;
  /** YTD identified orders per industry key, in first-seen order */
  ind: Map<string, number>;
}

export function orderSummary(orders: OrderRow[]): OrderSummary {
  const s: OrderSummary = { total: orders.length, identified: 0, personal: 0, unclassifiable: 0, ind: new Map() };
  for (const o of orders) {
    if (o[6] === 'Industry') {
      s.identified++;
      if (o[1]) s.ind.set(o[1], (s.ind.get(o[1]) ?? 0) + 1);
    } else if (o[6] === 'Personal') s.personal++;
    else s.unclassifiable++;
  }
  return s;
}

/** Dials with matched = 1 and a non-empty industry (the dial-share denominator dTot). */
export const industryDials = (dials: DialRow[]) => dials.filter(r => r[1] && r[4]);

export interface TvdRow {
  ind: string;
  orders: number;
  orderShare: number;
  dials: number;
  dialShare: number;
  gap: number;
}

/** Targeting vs demand: top N industries by YTD identified orders. */
export function tvdRows(orders: OrderRow[], dials: DialRow[], n = 15): TvdRow[] {
  const os = orderSummary(orders);
  const di = industryDials(dials);
  const dc = new Map<string, number>();
  for (const r of di) dc.set(r[4], (dc.get(r[4]) ?? 0) + 1);
  return [...os.ind.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([ind, oc]) => {
      const orderShare = pc(oc, os.identified);
      const d = dc.get(ind) ?? 0;
      const dialShare = pc(d, di.length);
      return { ind, orders: oc, orderShare, dials: d, dialShare, gap: dialShare - orderShare };
    });
}

export const uniqueContacts = (dials: DialRow[]) => new Set(dials.filter(r => r[7] >= 0).map(r => r[7])).size;

export function dialKpis(dials: DialRow[]) {
  const d = dials.length;
  const unique = uniqueContacts(dials);
  const connected = dials.filter(r => r[3]).length;
  const conv90 = dials.filter(r => r[2]).length;
  return { dials: d, unique, repeat: d - unique, connected, conv90, connPct: pc(connected, d), convPct: pc(conv90, connected) };
}
