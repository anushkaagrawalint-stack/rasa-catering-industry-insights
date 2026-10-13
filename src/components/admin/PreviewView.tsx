'use client';
import { useState } from 'react';
import { fmt, gapText, makeDisp, pct, usd } from '@/lib/format';
import { rangeLabel, weekShortLabel, weekTitle } from '@/lib/pipeline/dates';
import type { Preview } from '@/lib/preview';
import { IssueList } from './IssueList';

interface Props {
  preview: Preview;
  abbrev: Record<string, string>;
  onChange(p: Preview): void;
  /** Called after publish (with the result) or discard (null). */
  onDone(r: { weekStart: string; version: number } | null): void;
}

export function PreviewView({ preview: p, abbrev, onChange, onDone }: Props) {
  const disp = makeDisp(abbrev);
  const [week, setWeek] = useState(p.weekStart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const c = p.counts;

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
      return body;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function applyWeek() {
    const body = await call(`/api/admin/snapshots/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart: week }) });
    if (body) { onChange(body.preview); setWeek(body.preview.weekStart); }
  }
  async function publish() {
    if (p.replaces != null && !confirming) return setConfirming(true);
    const body = await call(`/api/admin/snapshots/${p.id}/publish`, { method: 'POST' });
    if (body) onDone({ weekStart: body.weekStart, version: body.version });
  }
  async function discard() {
    if (await call(`/api/admin/snapshots/${p.id}/discard`, { method: 'POST' })) onDone(null);
  }

  const cards = [
    { v: fmt(c.ytdOrders), l: 'YTD orders', n: `${fmt(c.identified)} identified · ${fmt(c.personal)} personal · ${fmt(c.unclassifiable)} unclassifiable` },
    { v: fmt(c.weekOrders), l: 'Orders this week', n: `${usd(c.weekValue)} value` },
    { v: fmt(c.dials), l: 'Dials', n: `${fmt(c.uniqueContacts)} unique contacts` },
    { v: pct(p.unmappedPct), l: 'Unmapped dials', n: `${fmt(c.unmapped)} not in database` },
    { v: pct(p.connectedPct), l: 'Connected', n: `${fmt(c.connected)} connected · ${fmt(c.noAnswer)} No Answer` },
    { v: fmt(p.agents.length), l: 'Agents', n: p.agents.join(', ') },
  ];

  return (
    <>
      <div className="panel" style={{ borderTop: '3px solid var(--accent)' }}>
        <h2 style={{ fontSize: 16 }}>Preview · {weekTitle(p)}</h2>
        <div className="hint">Source file: {p.filename} · YTD window {rangeLabel(p.ytdStart, p.ytdEnd)}
          {p.weekStart !== p.detectedWeekStart && <> · detected week was {p.detectedWeekStart}</>}</div>
        <div className="row">
          <div>
            <label className="f" htmlFor="wk">Week start (Monday)</label>
            <input id="wk" type="date" value={week} onChange={e => setWeek(e.target.value)} />
          </div>
          <button className="btn" onClick={applyWeek} disabled={busy || !week || week === p.weekStart}>Apply week</button>
        </div>
        <div className="kpis">
          {cards.map(k => <div className="kpi" key={k.l}><div className="v">{k.v}</div><div className="l">{k.l}</div><div className="n">{k.n}</div></div>)}
        </div>
        <div className="row">
          <button className="btn primary" onClick={publish} disabled={busy}>Publish</button>
          <button className="btn" onClick={discard} disabled={busy}>Discard</button>
        </div>
        {confirming && (
          <div className="issue warn" style={{ marginTop: 12 }} role="alertdialog" aria-label="Confirm replace">
            <div style={{ fontWeight: 700 }}>Replace {weekShortLabel(p.weekStart)}? The current version will be archived.</div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn primary" onClick={publish} disabled={busy}>Replace and publish</button>
              <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        )}
        {error && <div className="msg err" role="alert">{error}</div>}
      </div>

      <div className="panel">
        <h2>Validation</h2>
        <div className="hint">{p.warnings.length ? `${p.warnings.length} warning(s) — review, then publish.` : 'No warnings.'}</div>
        <IssueList issues={p.warnings} kind="warn" />
      </div>

      <div className="panel">
        <h2>Targeting vs demand — preview</h2>
        <div className="hint">Top 15 industries by YTD identified orders · all agents</div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Industry</th><th className="num">Orders</th><th className="num">Order share</th><th className="num">Dials</th><th className="num">Dial share</th><th className="num">Gap (pp)</th></tr></thead>
          <tbody>{p.tvd.map(r => (
            <tr key={r.ind}><td>{disp(r.ind)}</td><td className="num">{r.orders}</td><td className="num">{pct(r.orderShare)}</td><td className="num">{fmt(r.dials)}</td><td className="num">{pct(r.dialShare)}</td>
              <td className={`num ${r.gap >= 0 ? 'pp-pos' : 'pp-neg'}`}>{gapText(r.gap)}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}
