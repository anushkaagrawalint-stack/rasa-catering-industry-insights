'use client';
import { useState } from 'react';

interface Props { weeks: { weekStart: string; label: string }[] }

/** Lists the weeks on the dashboard, with Replace (upload a corrected workbook for that week) and Delete. */
export function WeekManager({ weeks }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; extra?: string[] } | null>(null);

  async function remove(weekStart: string, label: string) {
    if (!window.confirm(`Delete ${label}? It will be removed from the dashboard after the redeploy.`)) return;
    setBusy(weekStart);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/weeks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setMsg(j.ok ? { ok: true, text: `Deleted ${label}. The dashboard updates after the redeploy finishes (about a minute).` } : { ok: false, text: j.error ?? `Delete failed (${res.status}).` });
    } catch {
      setMsg({ ok: false, text: 'Delete failed. Check your connection and try again.' });
    }
    setBusy(null);
  }

  async function replace(weekStart: string, label: string, file: File | undefined) {
    if (!file) return;
    setBusy(weekStart);
    setMsg(null);
    const body = new FormData();
    body.set('file', file);
    body.set('replaceWeek', weekStart);
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; errors?: string[] };
      setMsg(j.ok ? { ok: true, text: `Replaced ${label}. The dashboard updates after the redeploy finishes (about a minute).` } : { ok: false, text: j.error ?? `Replace failed (${res.status}).`, extra: j.errors });
    } catch {
      setMsg({ ok: false, text: 'Replace failed. Check your connection and try again.' });
    }
    setBusy(null);
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <h2>Weeks on the dashboard</h2>
      {weeks.length === 0 && <div className="hint">None yet.</div>}
      {weeks.map(w => (
        <div key={w.weekStart} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 140 }}>{w.label}</span>
          <label className="btn" style={{ cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            Replace
            <input type="file" accept=".xlsx" hidden disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; replace(w.weekStart, w.label, f); }} />
          </label>
          <button className="btn" type="button" disabled={!!busy} onClick={() => remove(w.weekStart, w.label)}>{busy === w.weekStart ? 'Working…' : 'Delete'}</button>
        </div>
      ))}
      {msg && <div className={msg.ok ? 'msg ok' : 'msg err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
      {msg?.extra?.map((m, i) => <div key={i} className="msg err">{m}</div>)}
    </div>
  );
}
