'use client';
import { useState } from 'react';

interface Result { ok: boolean; error?: string; errors?: string[]; warnings?: string[]; weekStart?: string; weekEnd?: string }

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setResult(null);
    const body = new FormData();
    body.set('file', file);
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body });
      setResult(await res.json().catch(() => ({ ok: false, error: `Upload failed (${res.status}).` })));
    } catch {
      setResult({ ok: false, error: 'Upload failed. Check your connection and try again.' });
    }
    setBusy(false);
  }

  return (
    <form className="panel" onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <h2>Upload weekly workbook</h2>
      <div className="hint">Choose the week’s .xlsx file (up to 4 MB). It is checked, then saved to GitHub, and the site redeploys in about a minute. Uploading a week that already exists replaces it.</div>
      <input type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      <div><button className="btn primary" type="submit" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload'}</button></div>
      {result?.ok && <div className="msg ok" role="status">Saved week of {result.weekStart}. It will appear on the dashboard after the redeploy finishes (about a minute).</div>}
      {result && !result.ok && <div className="msg err" role="alert">{result.error}</div>}
      {result?.errors?.map((m, i) => <div key={i} className="msg err">{m}</div>)}
      {result?.warnings?.map((m, i) => <div key={i} className="hint">Warning: {m}</div>)}
    </form>
  );
}
