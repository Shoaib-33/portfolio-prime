import Link from 'next/link';
import { api, getLang } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { Icon } from '@/components/access';
import { Unsubscribe } from '@/components/buyers';

/* Unsubscribe link from an outreach email (no login needed). */
export const metadata = { title: 'Unsubscribe | Maasland & Partners', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const r = await api(`/m/${encodeURIComponent(token)}/info`); const t = tr(await getLang());
  return <section className="gate-screen"><div className="gate-card"><span className="gate-icon"><Icon name="mail" /></span><p className="eyebrow">{t('EMAIL PREFERENCES')}</p>
    {r.ok ? <Unsubscribe token={token} email={r.data.email} already={r.data.unsubscribed} /> : <><h1>{t('This link does not work.')}</h1><p>{r.data?.message ? t(r.data.message) : t('The link is not valid.')}</p></>}
    <div className="row"><Link className="text-link" href="/">Maasland &amp; Partners ↗</Link></div></div></section>;
}
