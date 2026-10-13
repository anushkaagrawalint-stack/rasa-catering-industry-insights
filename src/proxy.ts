import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/session';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/login') return session ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();

  if (pathname.startsWith('/api/admin')) {
    if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    // Same-origin check for state-changing requests (cookies are SameSite=Lax as well).
    const origin = req.headers.get('origin');
    if (req.method !== 'GET' && origin && new URL(origin).host !== req.headers.get('host')) {
      return NextResponse.json({ error: 'Cross-origin request refused' }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (!session) {
    const url = new URL('/login', req.url);
    if (pathname !== '/' || req.nextUrl.search) url.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  // The admin area is hidden from non-admin accounts.
  if (pathname.startsWith('/admin') && session.role !== 'admin') return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/', '/login', '/admin/:path*', '/api/admin/:path*'] };
