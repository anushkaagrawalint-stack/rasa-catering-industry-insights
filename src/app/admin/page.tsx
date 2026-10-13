import { redirect } from 'next/navigation';
import { UploadForm } from '@/components/UploadForm';
import { getAdmin } from '@/lib/auth';
import { listWeeks } from '@/lib/repoData';
import { weekShortLabel } from '@/lib/pipeline/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — RASA Weekly' };

export default async function AdminPage() {
  const admin = await getAdmin();
  if (!admin) redirect('/');
  const weeks = listWeeks();
  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <header className="top">
        <div><div className="brand">KUTLERRI</div><h1>RASA Weekly — Admin</h1><div className="sub">Signed in as {admin.name}</div></div>
        <a className="btn" href="/">Dashboard</a>
      </header>
      <UploadForm />
      <div className="panel"><h2>Weeks on the dashboard</h2>
        <div className="hint">{weeks.length ? weeks.map(weekShortLabel).join(' · ') : 'None yet.'}</div></div>
      <div className="foot">Prepared by Kutlerri for RASA | Confidential</div>
    </div>
  );
}
