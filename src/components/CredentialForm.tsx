'use client';
import { useEffect, useState } from 'react';

/** Email + password sign-in. */
export function CredentialForm({ next = '/' }: { next?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Disabled until hydrated: a native (pre-hydration) submit would put the password in the URL.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.assign(next);
        return;
      }
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Sign-in failed (server error ${res.status}).`);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  return (
    <form className="panel" method="post" onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <h2>Sign in</h2>
      <div>
        <label className="f" htmlFor="email">Email</label>
        <input id="email" type="text" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%' }} />
      </div>
      <div>
        <label className="f" htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%' }} />
      </div>
      <div><button className="btn primary" type="submit" disabled={busy || !ready}>{busy ? 'Signing in…' : 'Sign in'}</button></div>
      {error && <div className="msg err" role="alert">{error}</div>}
    </form>
  );
}
