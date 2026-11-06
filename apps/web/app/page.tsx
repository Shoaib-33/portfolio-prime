import Link from 'next/link';
import { api, getMe, getLang, Me } from '@/lib/api';
import { ListingCard } from '@/components/ui';
import { RegisterHome } from '@/components/home/register';
import { Icon } from '@/components/access';
import { navFor, can } from '@/lib/access';
import { moneyShort } from '@/lib/format';
import { tr, T } from '@/lib/i18n';

export default async function Home() {
  const me = await getMe();
  return me.user ? <MemberHome me={me} /> : <PublicHome />;
}

/* ---------- Visitors: the Register homepage (components/home/register.tsx). No listings. ---------- */
async function PublicHome() {
  const [stats, sold, lang] = await Promise.all([api('/stats'), api('/listings/sold'), getLang()]);
  return <RegisterHome stats={stats.data} sold={sold.data || []} lang={lang} demo={process.env.PP_DEMO !== '0'} />;
}

/* ---------- Invited people: their selection and their tools ---------- */
function greeting(t: T) { const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Amsterdam' })); return t(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'); }
async function MemberHome({ me }: { me: Me }) {
  const [lang, res, dash] = await Promise.all([getLang(), api('/listings'), me.user!.staff ? Promise.resolve(null) : api('/me/dashboard')]);
  const t = tr(lang); const u = me.user!; const rows: any[] = res.ok ? res.data : []; const tools = navFor(me); const notes: any[] = (dash?.data?.notifications || []).filter((n: any) => !n.readAt).slice(0, 3);
  const live = rows.filter(l => !l.locked); const total = rows.reduce((a, l) => a + (l.askingPrice || 0), 0);
  return <>
    <section className="member-hero"><div><p className="eyebrow">{u.staff ? t('STAFF · {role}', { role: t(`${u.role[0].toUpperCase()}${u.role.slice(1)}||role`).toUpperCase() }) : `${t('YOUR PRIVATE SELECTION')}${u.accountManager ? ` · ${t('CURATED BY {name}', { name: u.accountManager.toUpperCase() })}` : ''}`}</p>
      <h1>{greeting(t)}, {u.name.split(' ')[0]}.</h1>
      <p>{u.staff ? t('Every property and every feature. Manage who sees what in People & access.') : rows.length ? (u.listingScope === 'all' ? t(rows.length === 1 ? '{n} property has been shared with you, including new listings as they arrive.' : '{n} properties have been shared with you, including new listings as they arrive.', { n: rows.length }) : t(rows.length === 1 ? '{n} property has been shared with you.' : '{n} properties have been shared with you.', { n: rows.length })) : t('Your account manager is preparing your selection. You will get an alert as soon as it is ready.')}</p></div>
      <div className="mh-stats"><div><b>{rows.length}</b><span>{u.staff ? t('Live properties') : t('In your selection')}</span></div><div><b>{total ? moneyShort(total) : '—'}</b><span>{t('Combined guide value')}</span></div><div><b>{u.staff ? t('All') : u.features.length}</b><span>{t('Tools switched on')}</span></div></div></section>
    {u.staff && <section className="section slim"><div className="staff-cta"><span className="in-ic"><Icon name="users" /></span><div><b>{t('People & access')}</b><p>{t('Invite buyers, share properties and switch features on or off per person.')}</p></div><Link className="btn navy small" href="/admin?tab=access">{t('Open||button')} ↗</Link></div></section>}
    {notes.length > 0 && <section className="section slim"><div className="notes-strip">{notes.length === 1 ? <Link href={notes[0].listingSlug ? `/listings/${notes[0].listingSlug}` : '/account'} className="note-pill"><i />{notes[0].title}<small>{notes[0].body}</small></Link>
      : <Link href="/account#updates" className="note-pill"><i />{t('{n} new updates', { n: notes.length })}<small>{[...new Set(notes.map(n => n.title))].join(' · ')}</small></Link>}</div></section>}
    <section className="section"><div className="section-heading"><div><p className="eyebrow">{u.staff ? t('THE OFFERING') : t('MY SELECTION')}</p><h2>{u.staff ? t('All properties.') : t('Shared with you.')}</h2></div><div className="row">{can(me, 'map') && <Link className="text-link" href="/listings?view=map">{t('View on map')} ↗</Link>}<Link className="text-link" href="/listings">{t('Search and filter')} ↗</Link></div></div>
      {rows.length ? <div className="property-grid">{(u.staff ? live.slice(0, 6) : rows).map(l => <ListingCard key={l.slug} l={l} lang={lang} signedIn />)}</div>
        : <div className="empty-state"><span className="in-ic"><Icon name="home" /></span><h3>{t('Your selection is on its way.')}</h3><p>{t('We match properties to your mandate before sharing them. You will receive an alert when the first ones are ready.')}</p>{can(me, 'messages') && <Link className="btn navy small" href="/account/messages?listing=general">{t('Message your account manager')} ↗</Link>}</div>}</section>
    {(tools.length > 0 || can(me, 'messages')) && <section className="section"><div className="section-heading"><div><p className="eyebrow">{t('YOUR TOOLS')}</p><h2>{t('Switched on for you.')}</h2></div></div>
      <div className="tool-grid">{tools.map(f => <Link key={f.key} href={f.href} className="tool"><span className="in-ic"><Icon name={f.icon} /></span><b>{t(f.label)}</b><small>{t(f.blurb)}</small><span className="go">↗</span></Link>)}
        {can(me, 'messages') && !u.staff && <Link href="/account/messages" className="tool"><span className="in-ic"><Icon name="chat" /></span><b>{t('Messages')}</b><small>{t('Your account manager replies within 24 hours.')}</small><span className="go">↗</span></Link>}
        <Link href={u.staff ? '/admin' : '/account'} className="tool"><span className="in-ic"><Icon name="users" /></span><b>{u.staff ? t('Staff workspace') : t('My account')}</b><small>{u.staff ? t('Offers, deals, compliance, CRM and access.') : t('Verification, security, buy box and alerts.')}</small><span className="go">↗</span></Link></div></section>}
  </>;
}
