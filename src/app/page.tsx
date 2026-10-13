import { notFound } from 'next/navigation';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { abbrev, getWeek, listWeeks } from '@/lib/repoData';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  if (week !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(week)) notFound();
  const data = getWeek(week);

  if (!data) {
    if (week) notFound();
    return (
      <div className="wrap">
        <header className="top"><div><div className="brand">KUTLERRI</div><h1>RASA Weekly — Dials, Targeting &amp; Demand</h1></div></header>
        <div className="panel"><h2>No data yet</h2>
          <div className="hint">Add a weekly workbook (.xlsx) to the <b>data</b> folder in the repository and redeploy.</div></div>
        <div className="foot">Prepared by Kutlerri for RASA | Confidential</div>
      </div>
    );
  }
  return <Dashboard data={data} weeks={listWeeks()} abbrev={abbrev} />;
}
