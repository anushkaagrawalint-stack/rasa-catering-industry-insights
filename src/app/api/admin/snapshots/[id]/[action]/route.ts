import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getAdmin, unauthorized } from '@/lib/auth';
import { deleteBlob, readBlob } from '@/lib/blob';
import { XLSX_MIME } from '@/lib/constants';
import { archive, ConflictError, deleteSnapshot, getSnapshot, publishDraft, republish } from '@/lib/store';

type Ctx = { params: Promise<{ id: string; action: string }> };

/** GET …/download — the original workbook from the audit store. */
export async function GET(_: Request, { params }: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { id, action } = await params;
  if (action !== 'download') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const row = await getSnapshot(id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const buf = await readBlob(row.blob_url);
  const name = row.source_filename.replace(/["\\\r\n]/g, '_');
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(row.source_filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}

/** POST …/publish | discard | archive | republish */
export async function POST(_: Request, { params }: Ctx) {
  if (!(await getAdmin())) return unauthorized();
  const { id, action } = await params;
  try {
    let body: Record<string, unknown> = { ok: true };
    if (action === 'publish') body = { ok: true, ...(await publishDraft(id)) };
    else if (action === 'discard') await deleteBlob(await deleteSnapshot(id, ['draft'])).catch(() => {});
    else if (action === 'archive') await archive(id);
    else if (action === 'republish') body = { ok: true, weekStart: await republish(id) };
    else return NextResponse.json({ error: 'Not found' }, { status: 404 });
    revalidatePath('/');
    return NextResponse.json(body);
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
