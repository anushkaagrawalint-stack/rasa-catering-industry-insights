import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readBlob } from '@/lib/blob';
import { fmt } from '@/lib/format';
import { weekShortLabel } from '@/lib/pipeline/dates';
import { sheetPage, workbookTabs } from '@/lib/sheetView';
import { getSnapshot } from '@/lib/store';

export const maxDuration = 60;

/** View the original workbook uploaded for a week: one tab at a time, 100 rows per page. */
export default async function SheetPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { id } = await params;
  const { tab, page } = await searchParams;
  const row = await getSnapshot(id);
  if (!row) notFound();

  let buf: Buffer;
  try {
    buf = await readBlob(row.blob_url);
  } catch {
    return (
      <div className="panel"><h2>Original file not available</h2>
        <div className="hint">The uploaded workbook for this version could not be read. <Link href="/admin/history">Back to History</Link></div></div>
    );
  }
  const tabs = workbookTabs(buf);
  const current = tab && tabs.includes(tab) ? tab : tabs[0];
  const sheet = current ? sheetPage(buf, current, Number(page) || 1) : null;
  const href = (t: string, p = 1) => `/admin/history/${id}?tab=${encodeURIComponent(t)}${p > 1 ? `&page=${p}` : ''}`;

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>{weekShortLabel(row.week_start)} · v{row.version ?? '—'} · {row.source_filename}</h2>
          <div className="hint">Uploaded {row.uploaded_at.slice(0, 16)} UTC by {row.uploaded_by} · {row.status}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <a className="btn" href={`/api/admin/snapshots/${id}/download`}>Download original</a>
          <Link className="btn" href="/admin/history">Back to History</Link>
        </div>
      </div>
      <nav className="nav" aria-label="Workbook tabs" style={{ margin: '4px 0 12px' }}>
        {tabs.map(t => <Link key={t} href={href(t)} className={t === current ? 'on' : ''}>{t}</Link>)}
      </nav>
      {sheet ? (
        <>
          <div className="hint">
            {sheet.total ? `Rows ${fmt(sheet.firstRow)}–${fmt(sheet.firstRow + sheet.rows.length - 1)} of ${fmt(sheet.total + 1)} (row 1 is the header)` : 'This tab has no data rows.'}
          </div>
          <div className="tbl-wrap"><table>
            <thead><tr><th className="num">Row</th>{sheet.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>{sheet.rows.map((r, i) => (
              <tr key={i}><td className="num">{sheet.firstRow + i}</td>
                {r.map((c, j) => <td key={j} title={c} style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</td>)}</tr>
            ))}</tbody>
          </table></div>
          {sheet.pages > 1 && (
            <div className="row" style={{ marginTop: 12, alignItems: 'center' }}>
              {sheet.page > 1 ? <Link className="btn" href={href(current!, sheet.page - 1)}>← Previous</Link> : <span />}
              <span className="hint" style={{ margin: 0 }}>Page {sheet.page} of {sheet.pages}</span>
              {sheet.page < sheet.pages && <Link className="btn" href={href(current!, sheet.page + 1)}>Next →</Link>}
            </div>
          )}
        </>
      ) : <div className="hint">This workbook has no tabs.</div>}
    </div>
  );
}
