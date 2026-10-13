'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LOCATION_LABELS, STORE_LABELS, type AppConfig } from '@/lib/config';
import { weekShortLabel } from '@/lib/pipeline/dates';

interface Props {
  initial: AppConfig;
  weeks: { id: string; week_start: string; version: number | null; status: string }[];
  seenDispositions: string[];
}

type Field = { k: string; label: string; options?: string[] };

/** One editable rule table: rows of text inputs / selects, with add + remove. */
function RuleTable<T extends Record<string, unknown>>({ rows, fields, blank, onChange }: {
  rows: T[]; fields: Field[]; blank: T; onChange(rows: T[]): void;
}) {
  const set = (i: number, k: string, v: unknown) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <>
      <div className="tbl-wrap"><table>
        <thead><tr>{fields.map(f => <th key={f.k}>{f.label}</th>)}<th /></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            {fields.map(f => (
              <td key={f.k}>
                {f.options ? (
                  <select aria-label={f.label} value={String(r[f.k])} onChange={e => set(i, f.k, f.k === 'connected' ? e.target.value === 'true' : e.target.value)}>
                    {f.options.map(o => <option key={o} value={o}>{f.k === 'connected' ? (o === 'true' ? 'Connected' : 'Not connected') : o}</option>)}
                  </select>
                ) : (
                  <input type="text" aria-label={f.label} value={String(r[f.k] ?? '')} onChange={e => set(i, f.k, e.target.value)} style={{ width: '100%' }} />
                )}
              </td>
            ))}
            <td style={{ width: 1 }}><button className="btn danger" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <button className="btn" style={{ marginTop: 8 }} onClick={() => onChange([...rows, { ...blank }])}>Add row</button>
    </>
  );
}

export function SettingsClient({ initial, weeks, seenDispositions }: Props) {
  const router = useRouter();
  const [cfg, setCfg] = useState<AppConfig>(initial);
  const [applyTo, setApplyTo] = useState<Set<string>>(new Set(weeks.filter(w => w.status === 'published').map(w => w.id)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const patch = <K extends keyof AppConfig>(k: K) => (rows: AppConfig[K]) => setCfg({ ...cfg, [k]: rows });

  const known = new Set(cfg.dispositions.map(d => d.value.trim().toLowerCase()));
  const unknown = seenDispositions.filter(d => !known.has(d.trim().toLowerCase()));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg, applyTo: [...applyTo] }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: body.error ?? 'Save failed.' });
    setCfg(body.config);
    setMsg({ ok: true, text: `Saved. Recomputed ${body.updated} stored week version(s).` });
    router.refresh();
  }

  return (
    <>
      <div className="panel">
        <h2>Disposition mapping</h2>
        <div className="hint">Which JustCall dispositions count as connected. Blank dispositions are stored as “No Answer”. Unmapped values count as not connected.</div>
        {unknown.length > 0 && (
          <div className="issue warn">
            <div style={{ fontWeight: 700 }}>Unclassified values found in uploads</div>
            {unknown.map(v => (
              <div key={v} className="row" style={{ marginTop: 6, alignItems: 'center' }}>
                <span>{v}</span>
                <button className="btn" onClick={() => patch('dispositions')([...cfg.dispositions, { value: v, connected: true }])}>Connected</button>
                <button className="btn" onClick={() => patch('dispositions')([...cfg.dispositions, { value: v, connected: false }])}>Not connected</button>
              </div>
            ))}
          </div>
        )}
        <RuleTable rows={cfg.dispositions} onChange={patch('dispositions')} blank={{ value: '', connected: false }}
          fields={[{ k: 'value', label: 'Disposition' }, { k: 'connected', label: 'Counts as', options: ['true', 'false'] }]} />
      </div>

      <div className="panel">
        <h2>Industry display abbreviations</h2>
        <div className="hint">Industry key (lowercase) → label shown on the dashboard. Other industries are shown in Title Case.</div>
        <RuleTable rows={cfg.industryAbbrev} onChange={patch('industryAbbrev')} blank={{ key: '', label: '' }}
          fields={[{ k: 'key', label: 'Industry key' }, { k: 'label', label: 'Display label' }]} />
      </div>

      <div className="grid2">
        <div className="panel" style={{ marginBottom: 0 }}>
          <h2>Location mapping</h2>
          <div className="hint">Toast location_name → dashboard store label (exact, case-insensitive). Anything else is “Unknown”.</div>
          <RuleTable rows={cfg.locationMap} onChange={patch('locationMap')} blank={{ source: '', label: LOCATION_LABELS[0] }}
            fields={[{ k: 'source', label: 'Toast location_name' }, { k: 'label', label: 'Store', options: LOCATION_LABELS }]} />
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <h2>Store keyword mapping</h2>
          <div className="hint">If a Store Location tag contains the keyword (case-insensitive), the dial counts for that store.</div>
          <RuleTable rows={cfg.storeKeywords} onChange={patch('storeKeywords')} blank={{ keyword: '', label: STORE_LABELS[0] }}
            fields={[{ k: 'keyword', label: 'Keyword' }, { k: 'label', label: 'Store', options: STORE_LABELS }]} />
        </div>
      </div>

      <div className="panel">
        <h2>Apply and save</h2>
        <div className="hint">Saving recomputes connected / stores / order location for the selected stored weeks (and any pending upload). Abbreviations apply everywhere immediately.</div>
        {weeks.length ? (
          <div style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
            {weeks.map(w => (
              <label key={w.id} style={{ fontSize: 13 }}>
                <input type="checkbox" checked={applyTo.has(w.id)}
                  onChange={e => { const s = new Set(applyTo); if (e.target.checked) s.add(w.id); else s.delete(w.id); setApplyTo(s); }} />{' '}
                {weekShortLabel(w.week_start)} · v{w.version} · {w.status}
              </label>
            ))}
          </div>
        ) : <div className="hint">No stored weeks yet.</div>}
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        {msg && <div className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</div>}
      </div>
    </>
  );
}
