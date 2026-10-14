import 'server-only';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession, type Session } from './session';

/** The signed-in user (admin or viewer), or null. */
export async function getSession(): Promise<Session | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Re-checks the admin session inside each admin route handler (the proxy check is only the first gate). */
export async function getAdmin(): Promise<Session | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, 'admin');
}

export const unauthorized = () => NextResponse.json({ error: 'Not signed in' }, { status: 401 });

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'unknown').trim();
}

const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5;
const failures = new Map<string, number[]>();

/** Failed-attempt rate limit, kept in memory. It is per server instance, so it slows guessing but is not a hard global limit. */
export async function isRateLimited(bucket: string): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return false; // no lockout while developing locally
  const recent = (failures.get(bucket) ?? []).filter(t => Date.now() - t < WINDOW_MS);
  if (recent.length) failures.set(bucket, recent); else failures.delete(bucket);
  return recent.length >= MAX_FAILS;
}

export async function recordFailure(bucket: string) {
  failures.set(bucket, [...(failures.get(bucket) ?? []), Date.now()]);
}

export async function clearFailures(bucket: string) {
  failures.delete(bucket);
}
