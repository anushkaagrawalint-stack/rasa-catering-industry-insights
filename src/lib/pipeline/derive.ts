// Config-driven derived fields. Used at publish time and again when Settings change (spec 7.5).
import type { AppConfig } from '../config';
import { NO_ANSWER, NO_STORE, NOT_IN_DB, UNKNOWN_LOCATION } from '../constants';
import type { Issue, SnapshotData } from './types';

const norm = (s: string) => s.trim().toLowerCase();

export interface Deriver {
  /** 1 = connected; unknown dispositions count as not connected (and are reported). */
  connected(disposition: string): 0 | 1;
  isKnownDisposition(disposition: string): boolean;
  /** Spec 4.3 stores[]; `unknownParts` collects tag parts no keyword matched. */
  stores(raw: string, matched: boolean, unknownParts?: Set<string>): string[];
  location(toastLocationName: string): string;
}

export function makeDeriver(cfg: AppConfig): Deriver {
  const disp = new Map(cfg.dispositions.map(d => [norm(d.value), d.connected]));
  const loc = new Map(cfg.locationMap.map(l => [norm(l.source), l.label]));
  const kw = cfg.storeKeywords.filter(k => k.keyword.trim()).map(k => ({ kw: norm(k.keyword), label: k.label }));
  return {
    connected: d => (disp.get(norm(d || NO_ANSWER)) ? 1 : 0),
    isKnownDisposition: d => disp.has(norm(d || NO_ANSWER)),
    stores(raw, matched, unknownParts) {
      if (!matched) return [NOT_IN_DB];
      const out: string[] = [];
      for (const part of raw.split(';')) {
        const p = norm(part);
        if (!p) continue;
        let hit = false;
        for (const k of kw) {
          if (p.includes(k.kw)) {
            hit = true;
            if (!out.includes(k.label)) out.push(k.label);
          }
        }
        if (!hit) unknownParts?.add(part.trim());
      }
      return out.length ? out : [NO_STORE];
    },
    location: name => (name ? loc.get(norm(name)) ?? UNKNOWN_LOCATION : UNKNOWN_LOCATION),
  };
}

export function unknownDispositionsIssue(data: SnapshotData, d: Deriver): Issue | null {
  const counts = new Map<string, number>();
  for (const r of data.dials) {
    const v = data.dispositions[r[11]];
    if (!d.isKnownDisposition(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return {
    code: 'unknown_disposition',
    title: 'Dispositions not in the connected / not-connected mapping',
    message: `${counts.size} disposition value(s) are not mapped and were counted as not connected. Classify them in Settings.`,
    tab: 'Calls_This_Week',
    column: 'Disposition',
    items: [...counts].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} — ${n} dials`),
  };
}

/**
 * Re-apply the current config to a stored snapshot in place: connected, stores, order location,
 * plus the counts and the unknown-disposition warning that depend on them.
 */
export function recomputeDerived(data: SnapshotData, warnings: Issue[], cfg: AppConfig): Issue[] {
  const d = makeDeriver(cfg);
  for (const r of data.dials) {
    r[3] = d.connected(data.dispositions[r[11]]);
    r[6] = d.stores(r[12] >= 0 ? data.storeRaw[r[12]] : '', r[1] === 1);
  }
  for (const o of data.orders) o[4] = d.location(o[7] >= 0 ? data.locRaw[o[7]] : '');
  data.meta.counts.connected = data.dials.reduce((s, r) => s + r[3], 0);
  const issue = unknownDispositionsIssue(data, d);
  const rest = warnings.filter(w => w.code !== 'unknown_disposition');
  return issue ? [...rest, issue] : rest;
}
