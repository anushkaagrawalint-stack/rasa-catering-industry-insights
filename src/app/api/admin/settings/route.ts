import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getAdmin, unauthorized } from '@/lib/auth';
import { cleanConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { recomputeDerived } from '@/lib/pipeline/derive';
import { getSnapshot, saveConfig, updateSnapshotData } from '@/lib/store';

export const maxDuration = 60;

/** Save the rules (7.5) and recompute derived fields for the chosen stored weeks (plus any pending draft). */
export async function PUT(req: Request) {
  if (!(await getAdmin())) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { config?: unknown; applyTo?: unknown };
  const { config, error } = cleanConfig(body.config);
  if (!config) return NextResponse.json({ error }, { status: 400 });
  const ids = Array.isArray(body.applyTo) ? body.applyTo.map(String).filter(x => /^\d+$/.test(x)) : [];

  const db = await getDb();
  const updated = await db.tx(async q => {
    await saveConfig(q, config);
    const drafts = await q.query<{ id: string }>(`select id::text from weekly_snapshots where status = 'draft'`);
    let n = 0;
    for (const id of new Set([...ids, ...drafts.map(d => d.id)])) {
      const row = await getSnapshot(id, q);
      if (!row) continue;
      const warnings = recomputeDerived(row.data, row.warnings, config);
      await updateSnapshotData(q, id, row.data, warnings);
      if (row.status !== 'draft') n++;
    }
    return n;
  });
  revalidatePath('/');
  return NextResponse.json({ ok: true, config, updated });
}
