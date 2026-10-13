// Upload → validate → commit to data/ on GitHub. Vercel then redeploys with the new week.
import { NextResponse } from 'next/server';
import { getAdmin, unauthorized } from '@/lib/auth';
import { DEFAULT_CONFIG } from '@/lib/config';
import { commitFile } from '@/lib/github';
import { processWorkbook } from '@/lib/pipeline/process';

// Vercel caps a function request body at about 4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024;

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return unauthorized();

  const file = (await req.formData().catch(() => null))?.get('file');
  if (!(file instanceof File)) return bad('No file received.');
  if (!file.name.toLowerCase().endsWith('.xlsx')) return bad('Only .xlsx files are accepted.');
  if (file.size > MAX_BYTES) return bad('File is larger than 4 MB, the most Vercel accepts in one upload. Add it to the data folder on GitHub instead.', 413);

  const buf = Buffer.from(await file.arrayBuffer());
  const result = processWorkbook(buf, DEFAULT_CONFIG);
  if (result.errors.length || !result.data) {
    return NextResponse.json({ ok: false, error: 'The workbook has errors, so it was not saved.', errors: result.errors.map(e => e.message), warnings: result.warnings.map(w => w.message) });
  }

  const { weekStart, weekEnd } = result.data.meta;
  try {
    await commitFile(`data/week-${weekStart}.xlsx`, buf, `Add weekly data for ${weekStart} (uploaded by ${admin.name})`);
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'Could not save to GitHub.', 502);
  }
  return NextResponse.json({ ok: true, weekStart, weekEnd, warnings: result.warnings.map(w => w.message) });
}
