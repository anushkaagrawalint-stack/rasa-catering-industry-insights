'use client';
import { upload } from '@vercel/blob/client';
import { useEffect, useRef, useState } from 'react';
import { MAX_UPLOAD_BYTES } from '@/lib/constants';
import { weekShortLabel } from '@/lib/pipeline/dates';
import type { Issue } from '@/lib/pipeline/types';
import type { Preview } from '@/lib/preview';
import { IssueList } from './IssueList';
import { PreviewView } from './PreviewView';

type State =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'failed'; filename: string; errors: Issue[]; warnings: Issue[] }
  | { kind: 'preview'; preview: Preview }
  | { kind: 'published'; weekStart: string; version: number };

export function UploadClient({ mode, initialPreview, abbrev, reuploadWeek = null }: {
  mode: 'vercel' | 'local'; initialPreview: Preview | null; abbrev: Record<string, string>;
  /** Set when opened from History → Re-upload: the new file is pinned to this week. */
  reuploadWeek?: string | null;
}) {
  const [state, setState] = useState<State>(initialPreview ? { kind: 'preview', preview: initialPreview } : { kind: 'idle' });
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false); // set once hydrated, so tests (and users) never drop into a dead input
  useEffect(() => setReady(true), []);

  async function handleFile(file: File) {
    setError('');
    if (!file.name.toLowerCase().endsWith('.xlsx')) return setError('Only .xlsx files are accepted.');
    if (file.size > MAX_UPLOAD_BYTES) return setError('File is larger than 30 MB.');
    try {
      let res: Response;
      if (mode === 'vercel') {
        setState({ kind: 'busy', label: 'Uploading… 0%' });
        const blob = await upload(`uploads/${file.name}`, file, {
          access: 'private',
          handleUploadUrl: '/api/admin/blob-upload',
          multipart: file.size > 5 * 1024 * 1024,
          onUploadProgress: p => setState({ kind: 'busy', label: `Uploading… ${Math.round(p.percentage)}%` }),
        });
        setState({ kind: 'busy', label: 'Parsing and validating…' });
        res = await fetch('/api/admin/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blobUrl: blob.url, filename: file.name }) });
      } else {
        setState({ kind: 'busy', label: 'Uploading, parsing and validating…' });
        const form = new FormData();
        form.append('file', file);
        res = await fetch('/api/admin/parse', { method: 'POST', body: form });
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status}).`);
      if (body.ok && reuploadWeek && body.preview.weekStart !== reuploadWeek) {
        const fix = await fetch(`/api/admin/snapshots/${body.preview.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart: reuploadWeek }) });
        const fixed = await fix.json();
        if (!fix.ok) throw new Error(fixed.error ?? 'Could not set the week.');
        body.preview = fixed.preview;
      }
      setState(body.ok ? { kind: 'preview', preview: body.preview } : { kind: 'failed', filename: body.filename, errors: body.errors, warnings: body.warnings });
    } catch (e) {
      setState({ kind: 'idle' });
      setError((e as Error).message);
    }
  }

  const dropzone = (
    <div className="panel">
      <h2>{reuploadWeek ? `Re-upload ${weekShortLabel(reuploadWeek)}` : 'Upload weekly workbook'}</h2>
      <div className="hint">{reuploadWeek
        ? `The new workbook is checked and previewed for ${weekShortLabel(reuploadWeek)}. Publishing it replaces the current version (which is archived).`
        : 'One .xlsx per week (max 30 MB). It is parsed and validated first — nothing is public until you press Publish.'}</div>
      <div
        className={`drop${over ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Choose an .xlsx workbook to upload"
        onClick={() => input.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      >
        {state.kind === 'busy' ? state.label : 'Drop the workbook here, or click to choose a file'}
      </div>
      <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden data-testid="file-input" data-ready={ready || undefined}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); }} />
      {error && <div className="msg err" role="alert">{error}</div>}
    </div>
  );

  if (state.kind === 'preview') {
    return (
      <PreviewView
        preview={state.preview}
        abbrev={abbrev}
        onChange={p => setState({ kind: 'preview', preview: p })}
        onDone={r => setState(r ? { kind: 'published', ...r } : { kind: 'idle' })}
      />
    );
  }

  return (
    <>
      {state.kind === 'published' && (
        <div className="panel" style={{ borderTop: '3px solid var(--pos)' }}>
          <h2>Published</h2>
          <div className="hint">Week of {state.weekStart} is live as version {state.version}.</div>
          <a className="btn primary" href={`/?week=${state.weekStart}`}>Open on dashboard</a>
        </div>
      )}
      {dropzone}
      {state.kind === 'failed' && (
        <div className="panel">
          <h2>Cannot publish {state.filename}</h2>
          <div className="hint">Fix these problems in the workbook and upload it again.</div>
          <IssueList issues={state.errors} kind="err" />
          <IssueList issues={state.warnings} kind="warn" />
        </div>
      )}
    </>
  );
}
