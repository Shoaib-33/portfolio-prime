import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, getMe, getLang } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { date } from '@/lib/format';
import { AcceptInvite, Icon } from '@/components/access';

export const metadata = { title: 'Your invitation | Maasland & Partners', robots: { index: false, follow: false } };
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const [me, r, lang] = await Promise.all([getMe(), api(`/invites/${encodeURIComponent(token)}`), getLang()]); const t = tr(lang);
  if (!r.ok) return <section className="gate-screen"><div className="gate-card"><span className="gate-icon"><Icon name="link" /></span><p className="eyebrow">{t('INVITATION')}</p><h1>{t('This link does not work.')}</h1><p>{r.data?.message ? t(r.data.message) : t('The invitation link is not valid.')}</p>
    <div className="row"><Link className="btn navy" href="/login">{t('Log in')} ↗</Link><Link className="btn outline" href="/#request">{t('Request access')}</Link></div></div></section>;
  if (me.user) redirect('/');
  const d = r.data;
  return <section className="invite-page"><div className="invite-welcome"><p className="eyebrow light">{t('PERSONAL INVITATION · VALID UNTIL {date}', { date: date(d.expiresAt, t).toUpperCase() })}</p>
      <h1>{t('Welcome, {name}.', { name: d.name.split(' ')[0] })}</h1><p className="lead-light">{d.companyName ? t('{by} invited you to Maasland & Partners on behalf of {company}.', { by: d.invitedBy, company: d.companyName }) : t('{by} invited you to Maasland & Partners.', { by: d.invitedBy })}</p>
      {d.message && <blockquote>“{d.message}”<cite>— {d.invitedBy}</cite></blockquote>}
      <div className="inv-grid"><div className="inv-stat"><b>{d.staff ? 'All' : d.listings === 'all' ? t('All') : d.listings}</b><span>{d.staff ? `properties · ${d.roleLabel} role` : d.listings === 'all' ? t('properties, including new ones') : t(d.listings === 1 ? 'property selected for you' : 'properties selected for you')}</span></div>
        {!d.staff && d.accountManager && <div className="inv-stat"><b className="initials">{d.accountManager.split(' ').map((w: string) => w[0]).join('')}</b><span>{t('{name}, your account manager', { name: d.accountManager })}</span></div>}</div>
      {!d.staff && d.features.length > 0 && <><p className="eyebrow light">{t('INCLUDED IN YOUR ACCESS')}</p><ul className="inv-features">{d.features.map((f: any) => <li key={f.key}><Icon name="check" /><span><b>{t(f.label)}</b><small>{t(f.desc)}</small></span></li>)}</ul></>}</div>
    <div className="invite-form-card"><p className="eyebrow">{t('STEP 1 OF 1')}</p><h2>{t('Set your password.')}</h2><p className="muted-small">{t('Then you go straight to your selection.')}</p><AcceptInvite token={token} staff={d.staff} email={d.email} /></div></section>;
}
