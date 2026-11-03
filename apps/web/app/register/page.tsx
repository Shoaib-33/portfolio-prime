import Link from 'next/link';
import { RequestAccessForm, Icon } from '@/components/access';
import { tr } from '@/lib/i18n';
import { getLang } from '@/lib/api';
export const metadata = { title: 'Registration | Maasland & Partners', robots: { index: false, follow: false } };
/* Self-registration is closed: accounts are created by an admin and activated through a personal invitation link. */
export default async function Register() {
  const t = tr(await getLang());
  return <section className="section request solo"><div className="req-copy"><span className="gate-icon"><Icon name="lock" /></span><p className="eyebrow">{t('BY INVITATION')}</p><h1>{t('Accounts are personal.')}</h1>
    <p>{t('Maasland & Partners does not have open sign-up. Every investor receives a personal invitation with their own selection of properties after a short introduction.')}</p>
    <p>{t('Already invited? Open the link in your invitation email, or')} <Link className="text-link" href="/login">{t('log in')}</Link>.</p></div>
    <div className="req-card"><RequestAccessForm /></div></section>;
}
