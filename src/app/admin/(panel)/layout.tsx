import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/AdminNav';
import { getAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — RASA Weekly' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect('/');
  return (
    <div className="wrap">
      <header className="top">
        <div><div className="brand">KUTLERRI</div><h1>RASA Weekly — Admin</h1>
          <div className="sub">Signed in as {admin.name}</div></div>
        <AdminNav />
      </header>
      {children}
      <div className="foot">Prepared by Kutlerri for RASA | Confidential</div>
    </div>
  );
}
