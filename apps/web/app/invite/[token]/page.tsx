import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, getMe } from '@/lib/api';
import { date } from '@/lib/format';
import { AcceptInvite, Icon } from '@/components/access';

export const metadata = { title: 'Your invitation | Portfolio & Prime', robots: { index: false, follow: false } };
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const [me, r] = await Promise.all([getMe(), api(`/invites/${encodeURIComponent(token)}`)]);
  if (!r.ok) return <section className="gate-screen"><div className="gate-card"><span className="gate-icon"><Icon name="link" /></span><p className="eyebrow">INVITATION</p><h1>This link does not work.</h1><p>{r.data?.message || 'The invitation link is not valid.'}</p>
    <div className="row"><Link className="btn navy" href="/login">Log in ↗</Link><Link className="btn outline" href="/#request">Request access</Link></div></div></section>;
  if (me.user) redirect('/');
  const d = r.data;
  return <section className="invite-page"><div className="invite-welcome"><p className="eyebrow light">PERSONAL INVITATION · VALID UNTIL {date(d.expiresAt).toUpperCase()}</p>
      <h1>Welcome, {d.name.split(' ')[0]}.</h1><p className="lead-light">{d.invitedBy} invited you to Portfolio &amp; Prime{d.companyName ? ` on behalf of ${d.companyName}` : ''}.</p>
      {d.message && <blockquote>“{d.message}”<cite>— {d.invitedBy}</cite></blockquote>}
      <div className="inv-grid"><div className="inv-stat"><b>{d.staff ? 'All' : d.listings === 'all' ? 'All' : d.listings}</b><span>{d.staff ? `properties · ${d.roleLabel} role` : d.listings === 'all' ? 'properties, including new ones' : `propert${d.listings === 1 ? 'y' : 'ies'} selected for you`}</span></div>
        {!d.staff && d.accountManager && <div className="inv-stat"><b className="initials">{d.accountManager.split(' ').map((w: string) => w[0]).join('')}</b><span>{d.accountManager}, your account manager</span></div>}</div>
      {!d.staff && d.features.length > 0 && <><p className="eyebrow light">INCLUDED IN YOUR ACCESS</p><ul className="inv-features">{d.features.map((f: any) => <li key={f.key}><Icon name="check" /><span><b>{f.label}</b><small>{f.desc}</small></span></li>)}</ul></>}</div>
    <div className="invite-form-card"><p className="eyebrow">STEP 1 OF 1</p><h2>Set your password.</h2><p className="muted-small">Then you go straight to your selection.</p><AcceptInvite token={token} staff={d.staff} email={d.email} /></div></section>;
}
