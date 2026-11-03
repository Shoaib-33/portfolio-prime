import Link from 'next/link';
import { api, getMe, getLang, Me } from '@/lib/api';
import { ListingCard, SoldTable } from '@/components/ui';
import { Icon, RequestAccessForm } from '@/components/access';
import { navFor, can } from '@/lib/access';
import { moneyShort } from '@/lib/format';
import { tr, T } from '@/lib/i18n';

export default async function Home() {
  const me = await getMe();
  return me.user ? <MemberHome me={me} /> : <PublicHome />;
}

/* ---------- Visitors: who we are and how access works. No listings. ---------- */
const STEPS: [string, string, string][] = [['Request access', 'Tell us what you invest in. Takes one minute.', 'mail'], ['Introduction', 'A partner calls to understand your mandate; KYC follows for transactions.', 'users'], ['Your invitation', 'A personal link with the properties selected for you and the tools you need.', 'link'], ['Review and bid', 'Underwrite, open the data room, make an offer or join a structured sale.', 'key']];
const INSIDE: [string, string, string][] = [['vault', 'Private deal rooms', 'Codename teasers, staged sale processes and anonymised Q&A for portfolio sales.'], ['spark', 'AI analyst', 'Questions answered from the data of each property, with sources and scenarios.'], ['doc', 'Valuation & stress tests', 'Comparables, 10-year DCF, rent-regulation exposure and ESG per asset.'], ['lock', 'Secure data room', 'NDA, two-factor login and documents watermarked with your name.'], ['target', 'Smart finder', 'What your equity and financing can buy, ranked by deal score.'], ['chart', 'Market intelligence', 'Yields, prices and transactions per city, updated quarterly.']];
async function PublicHome() {
  const [stats, sold, lang] = await Promise.all([api('/stats'), api('/listings/sold'), getLang()]); const s = stats.data || {}; const t = tr(lang);
  return <div className="pub">
    <section className="pub-hero"><img src="/img/hero.jpg" alt={t('Historic canal-side architecture in Amsterdam')} /><div className="pub-hero-in">
      <div className="pub-hero-copy"><p className="eyebrow light"><span className="tiny-line" /> {t('PRIVATE OFFERING · BY INVITATION')}</p><h1>{t('Dutch residential property,')} <em>{t('offered privately.')}</em></h1>
        <p className="pub-lead">{t('We buy apartment buildings, mixed-use assets and whole portfolios, and offer them to a closed circle of investors. Every investor sees a personal selection, with every number and document in one place.')}</p>
        <div className="row hero-ctas"><Link className="btn cream" href="#request">{t('Request access')} <span>↗</span></Link><Link className="btn ghost-light" href="/login">{t('I have an invitation')}</Link></div></div>
      <aside className="glass-card" aria-label={t('How we work')}><p className="eyebrow light">{t('INVITATION ONLY')}</p>{[['Personal selection', 'You see the properties chosen for your mandate, nothing else.'], ['Verified counterparties', 'Every buyer is known to us and KYC-checked before a transaction.'], ['Discreet for sellers', 'Assets are never published on the open market.']].map(([h, p]) => <div key={h} className="gc-row"><span><Icon name="check" /></span><div><b>{t(h)}</b><small>{t(p)}</small></div></div>)}</aside></div>
      <span className="hero-caption">{t('Amsterdam · reference photography')}</span></section>

    <section className="pub-stats" aria-label={t('Track record in numbers')}>{[[s.dealsClosed, 'deals closed'], [`€${s.volumeM}m`, 'transaction volume'], [s.verifiedInvestors?.toLocaleString('nl-NL'), 'investors in our network'], [s.avgDaysToOffer, 'average days to an accepted offer']].map(([v, l]) => <div key={l as string}><b>{v ?? '—'}</b><span>{t(l as string)}</span></div>)}</section>

    <section className="section" id="approach"><div className="section-heading"><div><p className="eyebrow">{t('WHAT WE DO')}</p><h2>{t('Buy well. Offer privately.')}<br /><em>{t('Close with certainty.')}</em></h2></div></div>
      <div className="pillars">{[['01', 'Acquire', 'Our acquisition team buys residential portfolios, apartment buildings and mixed-use assets directly from owners, funds and developers.'], ['02', 'Curate', 'Each investor receives a selection that fits their mandate: region, size, yield and risk. Nothing is published on the open market.'], ['03', 'Close||deal', 'NDA, data room, offers or a structured bid process, through to the notary. One account manager from first look to transfer.']].map(([n, h, p]) => <article key={n} className="pillar"><span>{n}</span><h3>{t(h)}</h3><p>{t(p)}</p></article>)}</div></section>

    <section className="section pub-band" id="access"><div className="band-in"><div className="section-heading"><div><p className="eyebrow light">{t('HOW ACCESS WORKS')}</p><h2>{t('From introduction to your own selection.')}</h2></div></div>
      <ol className="steps4">{STEPS.map(([h, p, ic], i) => <li key={h}><span className="st-ic"><Icon name={ic} /></span><small>{t('Step {n}', { n: i + 1 })}</small><b>{t(h)}</b><p>{t(p)}</p></li>)}</ol></div></section>

    <section className="section"><div className="section-heading"><div><p className="eyebrow">{t('INSIDE THE PLATFORM')}</p><h2>{t('Tools for serious capital.')}</h2></div><p className="muted-small heading-note">{t('Switched on per investor, so every member sees what they need.')}</p></div>
      <div className="inside-grid">{INSIDE.map(([ic, h, p]) => <article key={h} className="inside"><span className="in-ic"><Icon name={ic} /></span><h3>{t(h)}</h3><p>{t(p)}</p></article>)}</div></section>

    <section className="section" id="record"><div className="section-heading"><div><p className="eyebrow">{t('TRACK RECORD')}</p><h2>{t('Recently closed.')}</h2></div><p className="muted-small heading-note">{t('Anonymised: city, type and price band only.')}</p></div><SoldTable rows={sold.data || []} /></section>

    <section className="section"><div className="sell-band"><div><p className="eyebrow light">{t('OWNERS AND FUNDS')}</p><h2>{t('Selling a portfolio?')}</h2><p>{t('We buy directly: a firm offer, certainty of funding and full discretion. Your asset is never advertised.')}</p></div><Link className="btn cream" href="#request">{t('Talk to our acquisition team')} ↗</Link></div></section>

    <section className="section request" id="request"><div className="req-copy"><p className="eyebrow">{t('REQUEST ACCESS')}</p><h2>{t('Start with a conversation.')}</h2><p>{t('Tell us briefly what you invest in or want to sell. A partner replies within one working day. Access is personal; we never share your details.')}</p>
      <ul className="req-points"><li><Icon name="check" />{t('No cost, no obligation')}</li><li><Icon name="check" />{t('Tickets from €1m to €250m+')}</li><li><Icon name="check" />{t('English, Dutch and German')}</li></ul></div>
      <div className="req-card"><RequestAccessForm /></div></section>
  </div>;
}

/* ---------- Invited people: their selection and their tools ---------- */
function greeting(t: T) { const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Amsterdam' })); return t(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'); }
async function MemberHome({ me }: { me: Me }) {
  const [lang, res, dash] = await Promise.all([getLang(), api('/listings'), me.user!.staff ? Promise.resolve(null) : api('/me/dashboard')]);
  const t = tr(lang); const u = me.user!; const rows: any[] = res.ok ? res.data : []; const tools = navFor(me); const notes: any[] = (dash?.data?.notifications || []).filter((n: any) => !n.readAt).slice(0, 3);
  const live = rows.filter(l => !l.locked); const total = rows.reduce((a, l) => a + (l.askingPrice || 0), 0);
  return <>
    <section className="member-hero"><div><p className="eyebrow">{u.staff ? `STAFF · ${u.role.toUpperCase()}` : `${t('YOUR PRIVATE SELECTION')}${u.accountManager ? ` · ${t('CURATED BY {name}', { name: u.accountManager.toUpperCase() })}` : ''}`}</p>
      <h1>{greeting(t)}, {u.name.split(' ')[0]}.</h1>
      <p>{u.staff ? 'Every property and every feature. Manage who sees what in People & access.' : rows.length ? (u.listingScope === 'all' ? t(rows.length === 1 ? '{n} property has been shared with you, including new listings as they arrive.' : '{n} properties have been shared with you, including new listings as they arrive.', { n: rows.length }) : t(rows.length === 1 ? '{n} property has been shared with you.' : '{n} properties have been shared with you.', { n: rows.length })) : t('Your account manager is preparing your selection. You will get an alert as soon as it is ready.')}</p></div>
      <div className="mh-stats"><div><b>{rows.length}</b><span>{u.staff ? 'Live properties' : t('In your selection')}</span></div><div><b>{total ? moneyShort(total) : '—'}</b><span>{t('Combined guide value')}</span></div><div><b>{u.staff ? 'All' : u.features.length}</b><span>{t('Tools switched on')}</span></div></div></section>
    {u.staff && <section className="section slim"><div className="staff-cta"><span className="in-ic"><Icon name="users" /></span><div><b>People &amp; access</b><p>Invite buyers, share properties and switch features on or off per person.</p></div><Link className="btn navy small" href="/admin?tab=access">Open ↗</Link></div></section>}
    {notes.length > 0 && <section className="section slim"><div className="notes-strip">{notes.length === 1 ? <Link href={notes[0].listingSlug ? `/listings/${notes[0].listingSlug}` : '/account'} className="note-pill"><i />{notes[0].title}<small>{notes[0].body}</small></Link>
      : <Link href="/account#updates" className="note-pill"><i />{t('{n} new updates', { n: notes.length })}<small>{[...new Set(notes.map(n => n.title))].join(' · ')}</small></Link>}</div></section>}
    <section className="section"><div className="section-heading"><div><p className="eyebrow">{u.staff ? 'THE OFFERING' : t('MY SELECTION')}</p><h2>{u.staff ? 'All properties.' : t('Shared with you.')}</h2></div><div className="row">{can(me, 'map') && <Link className="text-link" href="/listings?view=map">{t('View on map')} ↗</Link>}<Link className="text-link" href="/listings">{t('Search and filter')} ↗</Link></div></div>
      {rows.length ? <div className="property-grid">{(u.staff ? live.slice(0, 6) : rows).map(l => <ListingCard key={l.slug} l={l} lang={lang} signedIn />)}</div>
        : <div className="empty-state"><span className="in-ic"><Icon name="home" /></span><h3>{t('Your selection is on its way.')}</h3><p>{t('We match properties to your mandate before sharing them. You will receive an alert when the first ones are ready.')}</p>{can(me, 'messages') && <Link className="btn navy small" href="/account/messages?listing=general">{t('Message your account manager')} ↗</Link>}</div>}</section>
    {(tools.length > 0 || can(me, 'messages')) && <section className="section"><div className="section-heading"><div><p className="eyebrow">{t('YOUR TOOLS')}</p><h2>{t('Switched on for you.')}</h2></div></div>
      <div className="tool-grid">{tools.map(f => <Link key={f.key} href={f.href} className="tool"><span className="in-ic"><Icon name={f.icon} /></span><b>{t(f.label)}</b><small>{t(f.blurb)}</small><span className="go">↗</span></Link>)}
        {can(me, 'messages') && !u.staff && <Link href="/account/messages" className="tool"><span className="in-ic"><Icon name="chat" /></span><b>{t('Messages')}</b><small>{t('Your account manager replies within 24 hours.')}</small><span className="go">↗</span></Link>}
        <Link href={u.staff ? '/admin' : '/account'} className="tool"><span className="in-ic"><Icon name="users" /></span><b>{u.staff ? 'Staff workspace' : t('My account')}</b><small>{u.staff ? 'Offers, deals, compliance, CRM and access.' : t('Verification, security, buy box and alerts.')}</small><span className="go">↗</span></Link></div></section>}
  </>;
}
