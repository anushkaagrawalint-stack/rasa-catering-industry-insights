import { CredentialForm } from '@/components/CredentialForm';
import { safeNext } from '@/lib/session';

export const metadata = { title: 'Sign in — RASA Weekly' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="wrap" style={{ maxWidth: 440 }}>
      <header className="top">
        <div><div className="brand">KUTLERRI</div><h1>RASA Weekly — Dials, Targeting &amp; Demand</h1></div>
      </header>
      <CredentialForm next={safeNext(next)} />
      <div className="foot">Prepared by Kutlerri for RASA | Confidential</div>
    </div>
  );
}
