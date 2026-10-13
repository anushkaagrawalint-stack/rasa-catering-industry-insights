import 'server-only';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb } from './db';
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

const WINDOW_MIN = 15;
const MAX_FAILS = 5;

/** Failed-attempt rate limit, stored in Postgres so it holds across serverless instances. */
export async function isRateLimited(bucket: string): Promise<boolean> {
  const db = await getDb();
  await db.query(`delete from login_attempts where attempted_at < now() - interval '1 day'`);
  const [r] = await db.query<{ n: string }>(
    `select count(*)::text as n from login_attempts where ip = $1 and attempted_at > now() - interval '${WINDOW_MIN} minutes'`, [bucket]);
  return Number(r.n) >= MAX_FAILS;
}

export async function recordFailure(bucket: string) {
  await (await getDb()).query('insert into login_attempts (ip) values ($1)', [bucket]);
}

export async function clearFailures(bucket: string) {
  await (await getDb()).query('delete from login_attempts where ip = $1', [bucket]);
}
