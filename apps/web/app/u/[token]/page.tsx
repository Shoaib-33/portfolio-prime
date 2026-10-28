import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from '@/components/access';
import { Unsubscribe } from '@/components/buyers';

/* Unsubscribe link from an outreach email (no login needed). */
export const metadata = { title: 'Unsubscribe | Portfolio & Prime', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const r = await api(`/m/${encodeURIComponent(token)}/info`);
  return <section className="gate-screen"><div className="gate-card"><span className="gate-icon"><Icon name="mail" /></span><p className="eyebrow">EMAIL PREFERENCES</p>
    {r.ok ? <Unsubscribe token={token} email={r.data.email} already={r.data.unsubscribed} /> : <><h1>This link does not work.</h1><p>{r.data?.message || 'The link is not valid.'}</p></>}
    <div className="row"><Link className="text-link" href="/">Portfolio &amp; Prime ↗</Link></div></div></section>;
}
