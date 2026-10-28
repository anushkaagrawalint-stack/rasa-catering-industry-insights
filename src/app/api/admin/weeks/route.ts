// Delete a week's workbook from data/ on GitHub. Vercel then redeploys without that week.
import { NextResponse } from 'next/server';
import { getAdmin, unauthorized } from '@/lib/auth';
import { deleteFile } from '@/lib/github';

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function DELETE(req: Request) {
  const admin = await getAdmin();
  if (!admin) return unauthorized();

  const { weekStart } = (await req.json().catch(() => ({}))) as { weekStart?: unknown };
  if (typeof weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return bad('Invalid week.');

  try {
    const removed = await deleteFile(`data/week-${weekStart}.xlsx`, `Remove weekly data for ${weekStart} (deleted by ${admin.name})`);
    if (!removed) return bad(`No file named week-${weekStart}.xlsx was found on GitHub. Remove it from the data folder there instead.`, 404);
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'Could not delete from GitHub.', 502);
  }
  return NextResponse.json({ ok: true, weekStart });
}
