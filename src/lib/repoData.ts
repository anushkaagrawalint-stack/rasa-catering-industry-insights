import 'server-only';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { abbrevMap, DEFAULT_CONFIG } from './config';
import { processWorkbook } from './pipeline/process';
import type { SnapshotData } from './pipeline/types';

const DATA_DIR = path.join(process.cwd(), 'data');

export const abbrev = abbrevMap(DEFAULT_CONFIG);

let cache: Map<string, SnapshotData> | null = null;

/** Every .xlsx in ./data, parsed once per server instance and keyed by week start. If two files hold the same week, the later filename wins. */
function load(): Map<string, SnapshotData> {
  if (cache) return cache;
  const weeks = new Map<string, SnapshotData>();
  for (const file of readdirSync(DATA_DIR).filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$')).sort()) {
    const r = processWorkbook(readFileSync(path.join(DATA_DIR, file)), DEFAULT_CONFIG);
    if (r.errors.length || !r.data) {
      console.error(`data/${file}: skipped — ${r.errors.map(e => e.message).join('; ')}`);
      continue;
    }
    weeks.set(r.data.meta.weekStart, r.data);
  }
  return (cache = weeks);
}

/** Week start dates, newest first. */
export function listWeeks(): string[] {
  return [...load().keys()].sort().reverse();
}

export function getWeek(weekStart?: string): SnapshotData | null {
  const weeks = load();
  return weeks.get(weekStart ?? listWeeks()[0]) ?? null;
}
