import 'server-only';
import { CONFIG_KEYS, DEFAULT_CONFIG, type AppConfig } from './config';
import { getDb, type Db } from './db';
import type { Issue, SnapshotData } from './pipeline/types';

export type Status = 'draft' | 'published' | 'archived';

export interface SnapshotRow {
  id: string;
  week_start: string;
  week_end: string;
  version: number | null;
  status: Status;
  uploaded_at: string;
  uploaded_by: string;
  source_filename: string;
  blob_url: string;
  data: SnapshotData;
  warnings: Issue[];
  published_at: string | null;
}

const COLS = `id::text, week_start::text, week_end::text, version, status, uploaded_at::text, uploaded_by, source_filename, blob_url, warnings, published_at::text`;

// ---- config -----------------------------------------------------------------------------
export async function getConfig(db?: Db): Promise<AppConfig> {
  const d = db ?? (await getDb());
  const rows = await d.query<{ key: string; value: unknown }>('select key, value from config');
  const cfg: AppConfig = structuredClone(DEFAULT_CONFIG);
  for (const r of rows) if ((CONFIG_KEYS as string[]).includes(r.key)) (cfg as unknown as Record<string, unknown>)[r.key] = r.value;
  return cfg;
}

export async function saveConfig(db: Db, cfg: AppConfig) {
  for (const k of CONFIG_KEYS) {
    await db.query(
      `insert into config (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`, [k, JSON.stringify(cfg[k])]);
  }
}

// ---- snapshots --------------------------------------------------------------------------
export async function listPublishedWeeks(): Promise<string[]> {
  const rows = await (await getDb()).query<{ w: string }>(`select week_start::text as w from weekly_snapshots where status = 'published' order by week_start desc`);
  return rows.map(r => r.w);
}

export async function getPublished(weekStart?: string): Promise<{ id: string; data: SnapshotData } | null> {
  const db = await getDb();
  const rows = weekStart
    ? await db.query<{ id: string; data: SnapshotData }>(`select id::text, data from weekly_snapshots where status = 'published' and week_start = $1::date`, [weekStart])
    : await db.query<{ id: string; data: SnapshotData }>(`select id::text, data from weekly_snapshots where status = 'published' order by week_start desc limit 1`);
  return rows[0] ?? null;
}

export async function getSnapshot(id: string, db?: Db): Promise<SnapshotRow | null> {
  if (!/^\d+$/.test(id)) return null;
  const rows = await (db ?? (await getDb())).query<SnapshotRow>(`select ${COLS}, data from weekly_snapshots where id = $1`, [id]);
  return rows[0] ?? null;
}

export interface HistoryRow {
  id: string; week_start: string; version: number | null; status: Status; uploaded_at: string; uploaded_by: string;
  source_filename: string; ytd_orders: number; dials: number;
}

export async function listHistory(): Promise<HistoryRow[]> {
  return (await getDb()).query<HistoryRow>(
    `select id::text, week_start::text, version, status, uploaded_at::text, uploaded_by, source_filename,
            (data->'meta'->'counts'->>'ytdOrders')::int as ytd_orders, (data->'meta'->'counts'->>'dials')::int as dials
       from weekly_snapshots where status <> 'draft' order by week_start desc, version desc`);
}

export async function insertDraft(d: { weekStart: string; weekEnd: string; uploadedBy: string; filename: string; blobUrl: string; data: SnapshotData; warnings: Issue[] }): Promise<string> {
  const db = await getDb();
  const [r] = await db.query<{ id: string }>(
    `insert into weekly_snapshots (week_start, week_end, status, uploaded_by, source_filename, blob_url, data, warnings)
     values ($1::date, $2::date, 'draft', $3, $4, $5, $6::jsonb, $7::jsonb) returning id::text`,
    [d.weekStart, d.weekEnd, d.uploadedBy, d.filename, d.blobUrl, JSON.stringify(d.data), JSON.stringify(d.warnings)]);
  return r.id;
}

export async function getLatestDraft(): Promise<SnapshotRow | null> {
  const rows = await (await getDb()).query<{ id: string }>(`select id::text from weekly_snapshots where status = 'draft' order by uploaded_at desc limit 1`);
  return rows[0] ? getSnapshot(rows[0].id) : null;
}

/** Drafts other than `keepId`, with their blob URLs (so the caller can delete the files). */
export async function deleteOtherDrafts(keepId: string): Promise<string[]> {
  const rows = await (await getDb()).query<{ blob_url: string }>(`delete from weekly_snapshots where status = 'draft' and id <> $1 returning blob_url`, [keepId]);
  return rows.map(r => r.blob_url);
}

export async function updateSnapshotData(db: Db, id: string, data: SnapshotData, warnings: Issue[]) {
  await db.query(`update weekly_snapshots set week_start = $2::date, week_end = $3::date, data = $4::jsonb, warnings = $5::jsonb where id = $1`,
    [id, data.meta.weekStart, data.meta.weekEnd, JSON.stringify(data), JSON.stringify(warnings)]);
}

export async function publishedVersionFor(weekStart: string, excludeId?: string): Promise<number | null> {
  const rows = await (await getDb()).query<{ version: number }>(
    `select version from weekly_snapshots where status = 'published' and week_start = $1::date and id <> coalesce($2::bigint, -1)`, [weekStart, excludeId ?? null]);
  return rows[0]?.version ?? null;
}

class ConflictError extends Error {}
export { ConflictError };

/** Draft → published as version n+1 of its week; the week's current published version is archived. */
export async function publishDraft(id: string): Promise<{ weekStart: string; version: number }> {
  const db = await getDb();
  return db.tx(async q => {
    const [row] = await q.query<{ status: Status; week_start: string }>(`select status, week_start::text from weekly_snapshots where id = $1 for update`, [id]);
    if (!row || row.status !== 'draft') throw new ConflictError('This upload is no longer a draft.');
    await q.query(`update weekly_snapshots set status = 'archived' where week_start = $1::date and status = 'published'`, [row.week_start]);
    const [v] = await q.query<{ v: number }>(`select coalesce(max(version), 0) + 1 as v from weekly_snapshots where week_start = $1::date`, [row.week_start]);
    await q.query(`update weekly_snapshots set status = 'published', version = $2, published_at = now() where id = $1`, [id, v.v]);
    return { weekStart: row.week_start, version: v.v };
  });
}

export async function republish(id: string): Promise<string> {
  const db = await getDb();
  return db.tx(async q => {
    const [row] = await q.query<{ status: Status; week_start: string }>(`select status, week_start::text from weekly_snapshots where id = $1 for update`, [id]);
    if (!row || row.status !== 'archived') throw new ConflictError('Only an archived version can be re-published.');
    await q.query(`update weekly_snapshots set status = 'archived' where week_start = $1::date and status = 'published'`, [row.week_start]);
    await q.query(`update weekly_snapshots set status = 'published', published_at = now() where id = $1`, [id]);
    return row.week_start;
  });
}

export async function archive(id: string): Promise<void> {
  const rows = await (await getDb()).query(`update weekly_snapshots set status = 'archived' where id = $1 and status = 'published' returning id`, [id]);
  if (!rows.length) throw new ConflictError('Only a published version can be archived.');
}

/** Deletes a version (published, archived or draft); returns its blob URL. Deleting the published version removes that week from the dashboard. */
export async function deleteSnapshot(id: string, allowed: Status[] = ['published', 'archived', 'draft']): Promise<string> {
  const rows = await (await getDb()).query<{ blob_url: string }>(
    `delete from weekly_snapshots where id = $1 and status = any($2::text[]) returning blob_url`, [id, allowed]);
  if (!rows.length) throw new ConflictError(allowed.includes('archived') ? 'This version no longer exists.' : 'This upload is no longer a draft.');
  return rows[0].blob_url;
}

export async function listForSettings(): Promise<{ id: string; week_start: string; version: number | null; status: Status }[]> {
  return (await getDb()).query(`select id::text, week_start::text, version, status from weekly_snapshots where status <> 'draft' order by week_start desc, version desc`);
}

/** Distinct disposition values across stored snapshots (for the Settings "unknown values" list). */
export async function storedDispositions(): Promise<Map<string, number>> {
  const rows = await (await getDb()).query<{ d: string[] }>(`select data->'dispositions' as d from weekly_snapshots`);
  const m = new Map<string, number>();
  for (const r of rows) for (const v of r.d ?? []) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}
