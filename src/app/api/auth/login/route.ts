import { NextResponse } from 'next/server';
import { clearFailures, clientIp, isRateLimited, recordFailure } from '@/lib/auth';
import { cookieOptions, SESSION_COOKIE, SESSION_MAX_AGE, signSession } from '@/lib/session';
import { authenticate } from '@/lib/users';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = String(body.email ?? '').trim().slice(0, 200);
  const password = String(body.password ?? '');
  if (!email || !password) return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });

  const bucket = 'login:' + (await clientIp());
  if (await isRateLimited(bucket)) return NextResponse.json({ error: 'Too many failed attempts. Try again in 15 minutes.' }, { status: 429 });
  const user = authenticate(email, password);
  if (!user) {
    await recordFailure(bucket);
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
  }
  await clearFailures(bucket);
  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(SESSION_COOKIE, await signSession({ role: user.role, name: user.email }, SESSION_MAX_AGE), cookieOptions(SESSION_MAX_AGE));
  return res;
}
