import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Role } from './session';

/**
 * Accounts come from the APP_USERS env var (kept out of the repo), a JSON array:
 * [{"email":"someone@example.com","password":"…","role":"admin" | "viewer"}]
 * Only "admin" accounts can see and use the admin area.
 */
export interface AppUser { email: string; password: string; role: Role }

function loadUsers(): AppUser[] {
  let raw: unknown;
  try {
    raw = JSON.parse(process.env.APP_USERS || '[]');
  } catch {
    throw new Error('APP_USERS is not valid JSON');
  }
  if (!Array.isArray(raw)) throw new Error('APP_USERS must be a JSON array');
  return raw
    .map(u => u as Record<string, unknown>)
    .filter(u => typeof u.email === 'string' && typeof u.password === 'string' && u.password && (u.role === 'admin' || u.role === 'viewer'))
    .map(u => ({ email: (u.email as string).trim().toLowerCase(), password: u.password as string, role: u.role as Role }));
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Email is matched case-insensitively; the password check is constant-time and runs for every account. */
export function authenticate(email: string, password: string): AppUser | null {
  const e = email.trim().toLowerCase();
  let found: AppUser | null = null;
  for (const u of loadUsers()) {
    const ok = timingSafeEqual(digest(password), digest(u.password));
    if (ok && u.email === e) found = u;
  }
  return found;
}
