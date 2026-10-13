import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getAdmin, unauthorized } from '@/lib/auth';
import { deleteBlob } from '@/lib/blob';
import { getDb } from '@/lib/db';
import { mondayOf, parseDateCell } from '@/lib/pipeline/dates';
import { applyWeek, WEEK_WARNING_CODES } from '@/lib/pipeline/process';
import { buildPreview } from '@/lib/preview';
import { ConflictError, deleteSnapshot, getSnapshot, publishedVersionFor, updateSnapshotData } from '@/lib/store';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const row = await getSnapshot((await params).id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    status: row.status,
    preview: buildPreview(row.id, row.source_filename, row.data, row.warnings, await publishedVersionFor(row.week_start, row.id)),
  });
}

/** Admin override of week_start on a draft (snapped to that week's Monday). */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { weekStart?: string };
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart ?? '') ? parseDateCell(body.weekStart) : null;
  if (!iso) return NextResponse.json({ error: 'Enter a valid date.' }, { status: 400 });
  const db = await getDb();
  const out = await db.tx(async q => {
    const row = await getSnapshot(id, q);
    if (!row || row.status !== 'draft') return null;
    const warnings = [...row.warnings.filter(w => !WEEK_WARNING_CODES.includes(w.code)), ...applyWeek(row.data, mondayOf(iso))];
    await updateSnapshotData(q, id, row.data, warnings);
    return { row, warnings };
  });
  if (!out) return NextResponse.json({ error: 'This upload is no longer a draft.' }, { status: 409 });
  const { row, warnings } = out;
  return NextResponse.json({ preview: buildPreview(id, row.source_filename, row.data, warnings, await publishedVersionFor(row.data.meta.weekStart)) });
}

export async function DELETE(_: Request, { params }: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  try {
    const url = await deleteSnapshot((await params).id);
    await deleteBlob(url).catch(() => {});
    revalidatePath('/');
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
