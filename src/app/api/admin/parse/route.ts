// Upload → parse → validate → store as a draft → return the preview. Nothing is public until Publish.
import { NextResponse } from 'next/server';
import { getAdmin, unauthorized } from '@/lib/auth';
import { blobMode, deleteBlob, isOwnBlobUrl, putLocal, readBlob } from '@/lib/blob';
import { MAX_UPLOAD_BYTES } from '@/lib/constants';
import { processWorkbook } from '@/lib/pipeline/process';
import { buildPreview } from '@/lib/preview';
import { deleteOtherDrafts, getConfig, insertDraft, publishedVersionFor } from '@/lib/store';

export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return unauthorized();

  let buf: Buffer;
  let filename: string;
  let blobUrl: string;
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    if (blobMode() !== 'local') return bad('Upload through Blob storage on this deployment.');
    const file = (await req.formData()).get('file');
    if (!(file instanceof File)) return bad('No file received.');
    if (file.size > MAX_UPLOAD_BYTES) return bad('File is larger than 30 MB.', 413);
    filename = file.name;
    if (!filename.toLowerCase().endsWith('.xlsx')) return bad('Only .xlsx files are accepted.');
    buf = Buffer.from(await file.arrayBuffer());
    blobUrl = await putLocal(filename, buf);
  } else {
    const body = (await req.json().catch(() => ({}))) as { blobUrl?: string; filename?: string };
    if (!body.blobUrl || !isOwnBlobUrl(body.blobUrl)) return bad('Invalid upload reference.');
    blobUrl = body.blobUrl;
    filename = String(body.filename ?? 'upload.xlsx').slice(0, 200);
    buf = await readBlob(blobUrl);
    if (buf.length > MAX_UPLOAD_BYTES) {
      await deleteBlob(blobUrl).catch(() => {});
      return bad('File is larger than 30 MB.', 413);
    }
  }

  const result = processWorkbook(buf, await getConfig());
  if (result.errors.length || !result.data) {
    await deleteBlob(blobUrl).catch(() => {});
    return NextResponse.json({ ok: false, filename, errors: result.errors, warnings: result.warnings });
  }

  const { data, warnings } = result;
  const id = await insertDraft({ weekStart: data.meta.weekStart, weekEnd: data.meta.weekEnd, uploadedBy: admin.name, filename, blobUrl, data, warnings });
  for (const url of await deleteOtherDrafts(id)) await deleteBlob(url).catch(() => {});
  const replaces = await publishedVersionFor(data.meta.weekStart);
  return NextResponse.json({ ok: true, preview: buildPreview(id, filename, data, warnings, replaces) });
}
