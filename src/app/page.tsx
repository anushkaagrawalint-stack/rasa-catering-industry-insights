import { notFound } from 'next/navigation';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { getSession } from '@/lib/auth';
import { abbrevMap } from '@/lib/config';
import { getConfig, getPublished, listPublishedWeeks } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  if (week !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(week)) notFound();
  const [weeks, snap, cfg, session] = await Promise.all([listPublishedWeeks(), getPublished(week), getConfig(), getSession()]);
  const isAdmin = session?.role === 'admin';

  if (!snap) {
    if (week) notFound();
    return (
      <div className="wrap">
        <header className="top"><div><div className="brand">KUTLERRI</div><h1>RASA Weekly — Dials, Targeting &amp; Demand</h1></div></header>
        <div className="panel"><h2>No week published yet</h2>
          <div className="hint">{isAdmin ? <>Upload and publish a weekly workbook in the <a href="/admin">admin area</a>.</> : 'Check back once this week’s data is published.'}</div></div>
        <div className="foot">Prepared by Kutlerri for RASA | Confidential</div>
      </div>
    );
  }
  return <Dashboard data={snap.data} weeks={weeks} abbrev={abbrevMap(cfg)} isAdmin={isAdmin} />;
}
