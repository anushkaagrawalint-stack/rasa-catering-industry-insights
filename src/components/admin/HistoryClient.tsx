'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmt } from '@/lib/format';
import { weekShortLabel } from '@/lib/pipeline/dates';
import type { HistoryRow } from '@/lib/store';

type Action = 'archive' | 'republish' | 'delete';

export function HistoryClient({ rows }: { rows: HistoryRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ row: HistoryRow; action: Action } | null>(null);

  async function run(row: HistoryRow, action: Action) {
    setBusy(true);
    setError('');
    const res = action === 'delete'
      ? await fetch(`/api/admin/snapshots/${row.id}`, { method: 'DELETE' })
      : await fetch(`/api/admin/snapshots/${row.id}/${action}`, { method: 'POST' });
    setBusy(false);
    setPending(null);
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Action failed.');
    router.refresh();
  }

  const label = (a: Action, r: HistoryRow) =>
    a === 'archive' ? `Archive ${weekShortLabel(r.week_start)} v${r.version}? It will no longer appear on the dashboard.`
      : a === 'republish' ? `Re-publish ${weekShortLabel(r.week_start)} v${r.version}? The currently published version of that week will be archived.`
        : `Delete ${weekShortLabel(r.week_start)} v${r.version} and its original upload permanently?${r.status === 'published' ? ' This week will no longer appear on the dashboard.' : ''}`;

  return (
    <div className="panel">
      <h2>History</h2>
      <div className="hint">Every published and archived upload. The dashboard shows the published version of each week.</div>
      {pending && (
        <div className="issue warn" role="alertdialog" aria-label="Confirm action">
          <div style={{ fontWeight: 700 }}>{label(pending.action, pending.row)}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" disabled={busy} onClick={() => run(pending.row, pending.action)}>Confirm</button>
            <button className="btn" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
      {error && <div className="msg err" role="alert">{error}</div>}
      {rows.length ? (
        <div className="tbl-wrap"><table>
          <thead><tr><th>Week</th><th className="num">Version</th><th>Uploaded at</th><th>Source file</th><th className="num">Orders YTD</th><th className="num">Dials</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}>
              <td>{weekShortLabel(r.week_start)}</td>
              <td className="num">{r.version}</td>
              <td title={`by ${r.uploaded_by}`}>{r.uploaded_at.slice(0, 16)} UTC · {r.uploaded_by}</td>
              <td>{r.source_filename}</td>
              <td className="num">{fmt(r.ytd_orders)}</td>
              <td className="num">{fmt(r.dials)}</td>
              <td><span className={`tag${r.status === 'published' ? ' pub' : ''}`}>{r.status}</span></td>
              <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                {r.status === 'published' && <a className="btn" href={`/?week=${r.week_start}`}>Open on dashboard</a>}
                <a className="btn" href={`/admin/history/${r.id}`}>View sheet</a>
                <a className="btn" href={`/api/admin/snapshots/${r.id}/download`}>Download original</a>
                <a className="btn" href={`/admin?reupload=${r.week_start}`}>Re-upload</a>
                {r.status === 'published' && <button className="btn" disabled={busy} onClick={() => setPending({ row: r, action: 'archive' })}>Archive</button>}
                {r.status === 'archived' && <button className="btn" disabled={busy} onClick={() => setPending({ row: r, action: 'republish' })}>Re-publish</button>}
                <button className="btn danger" disabled={busy} onClick={() => setPending({ row: r, action: 'delete' })}>Delete</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <div className="hint">Nothing published yet.</div>}
    </div>
  );
}
