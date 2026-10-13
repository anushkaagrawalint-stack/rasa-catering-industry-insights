// What the admin sees before publishing (spec 7.2). Built from a stored draft so it survives reloads.
import { pc } from './format';
import { tvdRows, type TvdRow } from './metrics';
import type { Issue, SnapshotCounts, SnapshotData } from './pipeline/types';

export interface Preview {
  id: string;
  filename: string;
  weekStart: string;
  weekEnd: string;
  ytdStart: string;
  ytdEnd: string;
  detectedWeekStart: string;
  counts: SnapshotCounts;
  unmappedPct: number;
  connectedPct: number;
  agents: string[];
  tvd: TvdRow[];
  warnings: Issue[];
  /** Version number currently published for this week, if any (publishing will archive it). */
  replaces: number | null;
}

export function buildPreview(id: string, filename: string, data: SnapshotData, warnings: Issue[], replaces: number | null): Preview {
  const c = data.meta.counts;
  return {
    id,
    filename,
    weekStart: data.meta.weekStart,
    weekEnd: data.meta.weekEnd,
    ytdStart: data.meta.ytdStart,
    ytdEnd: data.meta.ytdEnd,
    detectedWeekStart: data.meta.detectedWeekStart,
    counts: c,
    unmappedPct: pc(c.unmapped, c.dials),
    connectedPct: pc(c.connected, c.dials),
    agents: data.agents,
    tvd: tvdRows(data.orders, data.dials),
    warnings,
    replaces,
  };
}
