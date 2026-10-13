// Signed session cookie (HS256 JWT via jose). Imported by proxy.ts and by route handlers.
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'rasa_session';
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 h

export type Role = 'admin' | 'viewer';
export interface Session { role: Role; name: string }

function key(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters');
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session, maxAge: number): Promise<string> {
  return new SignJWT({ role: s.role, name: s.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(key());
}

/** Any valid session, or only one with the given role. */
export async function verifySession(token: string | undefined, role?: Role): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    const r = payload.role;
    if (r !== 'admin' && r !== 'viewer') return null;
    if (role && r !== role) return null;
    return { role: r, name: String(payload.name ?? '') };
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

/** Same-site relative path for post-login redirects (never "//host" or "/\host"). */
export const safeNext = (next: string | null | undefined, fallback = '/') =>
  next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
