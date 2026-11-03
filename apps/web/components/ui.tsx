import Link from 'next/link';
import { Me } from '@/lib/api';
import { money, pct, STATUS, DEAL, imgSrc } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { Suspense } from 'react';
import { ActionButton, LangToggle, SaveButton, Ring, Countdown, StaffNav, MenuToggle } from './client';
import { api, getLang } from '@/lib/api';
import { navFor, can } from '@/lib/access';

/** The demo notices ("fictional listings", demo accounts) are for testers only: real clients never see them.
    Hidden for anyone signed in with a non-demo account, on invitation and unsubscribe pages, and everywhere when PP_DEMO=0. */
const showDemo = (me: Me, page?: string) => process.env.PP_DEMO !== '0' && !['invite', 'u'].includes(page || '') && (!me.user || me.user.email.endsWith('@demo.nl'));

export async function Header({ me, lang, page }: { me: Me; lang: string; page?: string }) {
  const t = tr(lang); const u = me.user; const nav = u?.staff ? [] : navFor(me); // staff work in the Workspace; investor tools stay reachable by URL for previews
  const ws = u?.staff ? await api('/admin/workspace') : null; // staff menu = the workspace sections the developer made visible
  const staffTabs: [string, string][] = ws?.ok ? ws.data.tabs.filter((x: any) => x.visible).map((x: any) => [x.key, t(x.label)]) : [['access', t('People & access')]];
  const cur = (p: string) => (page === p ? { 'aria-current': 'page' as const } : {});
  const brand = <Link className="brand" href="/" aria-label={t('Maasland and Partners home')}><span className="brand-mark">M<span>∕</span>P</span><span>MAASLAND <i>&amp;</i> PARTNERS<small>PROPERTY. WITH PERSPECTIVE.</small></span></Link>;
  return <header id="site-header">{showDemo(me, page) && <div className="demo-strip"><span><i></i> {t('DEMO · INVITE-ONLY · fictional listings and people')}</span><span className="hide-mobile">{t('Demo accounts on the')} <Link href="/login">{t('login page')}</Link></span>{u?.staff ? <Link href="/admin">{t('Staff workspace')} ↗</Link> : <span className="hide-mobile">{t('Private by design')}</span>}</div>}
    <div className="header">{brand}<Suspense fallback={null}><MenuToggle /></Suspense>
      {u ? <nav id="navigation" aria-label={t('Main navigation')}>{u.staff ? <Suspense fallback={null}><StaffNav tabs={staffTabs} /></Suspense> : <Link href="/listings" {...cur('listings')}>{t('My selection')}{u.listings !== null ? <span className="nav-count">{u.listings}</span> : null}</Link>}
        {nav.map(f => <Link key={f.key} href={f.href} {...cur(f.href.slice(1))}>{t(f.label)}</Link>)}<LangToggle lang={lang} signedIn />
        {can(me, 'messages') && !u.staff && <Link className="icon-link" href="/account/messages" aria-label={t('Messages')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg></Link>}
        <Link className="account-btn" href={u.staff ? '/admin' : '/account'}><span className="avatar">{u.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span><span>{u.staff ? u.name.split(/\s+/)[0] : t('My account')}{me.unread ? <i className="dot">{me.unread}</i> : null}</span></Link><ActionButton url="/api/auth/logout" label={t('Log out')} className="link-button" redirect="/" /></nav>
      : <nav id="navigation" aria-label={t('Main navigation')}><Link href="/#approach">{t('What we do')}</Link><Link href="/#access">{t('How access works')}</Link><Link href="/#record">{t('Track record')}</Link><LangToggle lang={lang} signedIn={false} /><Link href="/login" {...cur('login')}>{t('Log in')}</Link><Link className="btn small navy" href="/#request">{t('Request access')} <span>↗</span></Link></nav>}</div></header>;
}
export function Footer({ lang, me, page }: { lang: string; me: Me; page?: string }) {
  const t = tr(lang); const u = me.user; const nav = u?.staff ? [] : navFor(me);
  return <footer><div className="footer-top"><div><p className="eyebrow light">MAASLAND &amp; PARTNERS</p><h2>{t('Good property.')}<br />{t('A private conversation.')}</h2>{u ? (can(me, 'sell') ? <Link className="btn cream" href="/sell">{t('Sell your property to us')} ↗</Link> : null) : <Link className="btn cream" href="/#request">{t('Request access')} ↗</Link>}</div>
    <div className="footer-links">{u ? <><Link href="/listings">{u.staff ? t('Properties') : t('My selection')}</Link>{nav.map(f => <Link key={f.key} href={f.href}>{t(f.label)}</Link>)}<Link href="/account">{t('My account')}</Link>{u.staff && <Link href="/admin">{t('Staff workspace')}</Link>}</>
      : <><Link href="/#approach">{t('What we do')}</Link><Link href="/#access">{t('How access works')}</Link><Link href="/#record">{t('Track record')}</Link><Link href="/#request">{t('Request access')}</Link><Link href="/invest-in-dutch-real-estate">{t('Invest in Dutch real estate')}</Link><Link href="/de/immobilien-investment-niederlande">Immobilien-Investment Niederlande</Link><Link href="/login">{t('Log in')}</Link></>}</div></div>
    <div className="footer-bottom"><span>© 2026 Maasland &amp; Partners</span><span>{t('Private offering · by invitation · figures indicative, not advice')}</span><span>Next.js · FastAPI · PostgreSQL</span></div>
    {showDemo(me, page) && <p className="disclosure">{t('Demo build. All listings, investors and figures are fictional; photographs are reference imagery. KYC, payments, e-signing and emails are simulated adapters. Listings arrive from the company CRM through the integration API.')}</p>}</footer>;
}
const isNew = (d?: string) => !!d && Date.now() - new Date(d).getTime() < 7 * 864e5;
export function ListingCard({ l, lang, signedIn, me }: { l: any; lang: string; signedIn: boolean; me?: Me }) {
  const t = tr(lang); const nl = lang === 'nl';
  if (l.locked && l.dealType === 'institutional') return <article className="property-card locked-card inst-card"><div className="card-image"><Link href={`/listings/${l.slug}`} aria-label={l.name}><img className="private-image" src={imgSrc(l.image)} alt="" /></Link><span className="property-tag dark">{t('Private deal room')}</span><span className="lock-center"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg></span></div>
    <div className="card-info"><div className="card-top"><p className="eyebrow">{l.city} · {t('institutional')}</p><span className="pill pro">{t('QUALIFIED')}</span></div><Link className="card-title" href={`/listings/${l.slug}`}>{l.name} <span>↗</span></Link><p className="card-type">{nl && l.propertyTypeNl ? l.propertyTypeNl : l.propertyType} · {t('{n} units', { n: l.unitsCount?.toLocaleString(nl ? 'nl-NL' : 'en-GB') ?? '' })}</p>
      <dl className="card-stats"><div><dt>{t('Guide')}</dt><dd>{l.priceDisplay}</dd></div><div><dt>{t('Units')}</dt><dd>{l.unitsCount}</dd></div><div><dt>{t('Access')}</dt><dd>KYB</dd></div></dl>
      <div className="card-actions"><span className="owned">{t('Funds · family offices · insurers')}</span><Link className="chip-btn" href={`/listings/${l.slug}`}>{t('Request access')} ↗</Link></div></div></article>;
  if (l.locked) return <article className="property-card locked-card"><div className="card-image"><img className="private-image" src={imgSrc(l.image)} alt="" /><span className="property-tag dark">{t('Off-market · Pro first look')}</span><span className="lock-center"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg></span></div>
    <div className="card-info"><div className="card-top"><p className="eyebrow">{t('{city} region', { city: l.city })}</p><span className="pill pro">PRO</span></div><span className="card-title">{nl && l.propertyTypeNl ? l.propertyTypeNl : l.propertyType}, {l.areaM2} m²</span><p className="card-type">{t('Investor Pro members see this deal first.')}</p>{l.offMarket === 'pro-window' && l.proEarlyAccessUntil && <p className="opens">{t('Opens for you in')} <Countdown until={l.proEarlyAccessUntil} /></p>}
      <div className="card-actions"><Link className="btn small outline" href={l.offMarket === 'pro-window' ? '/account/upgrade' : signedIn ? '/account/verify' : '/#request'}>{l.offMarket === 'pro-window' ? t('Upgrade to Pro') : signedIn ? t('Get verified') : t('Join free')} ↗</Link></div></div></article>;
  const price = l.askingPrice ? money(l.askingPrice) : l.priceDisplay || t('Price on request');
  return <article className="property-card"><div className="card-image"><Link href={`/listings/${l.slug}`} aria-label={l.name}><img src={imgSrc(l.image)} alt={t('Reference architecture for {city}', { city: l.city })} loading="lazy" /></Link><span className={`property-tag ${l.previousPrice ? 'drop' : ''}`}>{l.previousPrice ? t('Price reduced') : t(DEAL[l.dealType])}</span>{isNew(l.publishedAt) && l.status !== 'coming_soon' && <span className="new-flag">{t('New')}</span>}<SaveButton slug={l.slug} saved={l.saved} signedIn={signedIn} /><span className="score-badge"><Ring v={l.dealScore.total} cls="sm" /><span>{t('Deal score')}<small>{t(l.dealScore.band)}</small></span></span></div>
    <div className="card-info"><div className="card-top"><p className="eyebrow">{l.city} <span> / {l.district}</span></p><span className={`pill st-${l.status}`}>{t(STATUS[l.status])}</span></div><Link className="card-title" href={`/listings/${l.slug}`}>{nl && l.nameNl ? l.nameNl : l.name} <span>↗</span></Link>
      <p className="card-type">{nl && l.propertyTypeNl ? l.propertyTypeNl : l.propertyType} · {l.areaM2.toLocaleString('nl-NL')} m² · {l.address || <span className="muted-lock">{t('Address shown to members')}</span>}</p>
      <dl className="card-stats"><div><dt>{t('Price')}</dt><dd>{price}{l.previousPrice ? <s>{money(l.previousPrice)}</s> : null}</dd></div><div><dt>{l.bar ? 'BAR' : t('Plot')}</dt><dd>{l.bar ? pct(l.bar) : l.plotM2 ? l.plotM2.toLocaleString('nl-NL') + ' m²' : '—'}</dd></div><div><dt>{l.unitsCount > 1 ? t('Units') : t('Energy')}</dt><dd>{l.unitsCount > 1 ? l.unitsCount : l.energyLabel || '—'}</dd></div></dl>
      <div className="card-actions"><span className="owned">{t('✓ Own stock · k.k.')}</span><Link className="chip-btn" href={`/listings/${l.slug}`}>{t('View')} ↗</Link></div></div></article>;
}
export async function TierCards({ me, compact, pro }: { me: Me; compact?: boolean; pro: number }) {
  const t = tr(await getLang()); const cur = me.user ? me.user.tier : 'visitor';
  const rows: [string, string, string, string][] = [['visitor', 'Visitor', '€0', 'Teaser: city, type, price band, headline yield, photos'], ['free', 'Free member', '€0', '+ exact address, full financials, floor plans · weekly alerts'], ['verified', 'Verified investor', '€0 · KYC', '+ data room after NDA · offers and bid rounds · off-market 48 h after Pro · daily alerts'], ['pro', 'Investor Pro', t('€{pro}/mo', { pro }), '+ off-market first look · instant alerts · portfolio deals · account manager']];
  return <div className={`tier-grid ${compact ? 'compact' : ''}`}>{rows.map(([k, label, price, txt]) => <div key={k} className={`tier-card ${k === cur ? 'current' : ''} ${k === 'pro' ? 'pro' : ''}`}><p className="eyebrow">{t(label).toUpperCase()}</p><b className="tier-price">{t(price)}</b><p>{t(txt)}</p>
    {k === cur ? <span className="pill">{t('Your level')}</span> : k === 'free' && cur === 'visitor' ? <Link className="btn small navy" href="/#request">{t('Join free')}</Link> : k === 'verified' && cur === 'free' ? <Link className="btn small navy" href="/account/verify">{t('Get verified')}</Link> : k === 'pro' && cur === 'verified' ? <Link className="btn small brass" href="/account/upgrade">{t('Upgrade to Pro')}</Link> : null}</div>)}</div>;
}
export async function SoldTable({ rows }: { rows: any[] }) {
  const t = tr(await getLang());
  return <div className="table-wrap" tabIndex={0}><table className="sold-table"><thead><tr><th>{t('City')}</th><th>{t('Type')}</th><th>{t('Units')}</th><th>{t('Price band')}</th><th>{t('Deal')}</th><th>{t('Days to offer')}</th></tr></thead><tbody>{rows.map((x, i) => <tr key={i}><td>{x.city}</td><td>{t(x.propertyType)}</td><td>{x.units}</td><td>{t(x.priceBand)}</td><td>{t(DEAL[x.dealType])}</td><td>{x.daysToOffer}</td></tr>)}</tbody></table></div>;
}
export const Shield = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>;
