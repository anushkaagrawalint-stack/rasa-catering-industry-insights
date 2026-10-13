'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Upload' },
  { href: '/admin/history', label: 'History' },
  { href: '/admin/settings', label: 'Settings' },
];

export function AdminNav() {
  const path = usePathname();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }
  return (
    <nav className="nav" aria-label="Admin">
      {LINKS.map(l => <Link key={l.href} href={l.href} className={path === l.href ? 'on' : ''}>{l.label}</Link>)}
      <Link href="/">Dashboard</Link>
      <button className="btn" onClick={logout}>Log out</button>
    </nav>
  );
}
