import Link from 'next/link';
import { Me } from '@/lib/api';
import { money, pct, STATUS, DEAL } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { ActionButton, LangToggle, SaveButton, Ring, Countdown } from './client';

export function Header({ me, lang, page }: { me: Me; lang: string; page?: string }) {
  const t = tr(lang); const u = me.user;
  const cur = (p: string) => (page === p ? { 'aria-current': 'page' as const } : {});
  return <div id="site-header"><div className="demo-strip"><span><i></i> DEMO DATABASE · fictional listings and people</span><span className="hide-mobile">Demo accounts on the <Link href="/login">login page</Link></span>{u?.staff ? <Link href="/admin">{t('Staff workspace')} ↗</Link> : <Link href="/login?next=/admin">{t('Staff workspace')} ↗</Link>}</div>
    <header className="header"><Link className="brand" href="/" aria-label="Portfolio and Prime home"><span className="brand-mark">P<span>∕</span>P</span><span>PORTFOLIO <i>&amp;</i> PRIME<small>PROPERTY. WITH PERSPECTIVE.</small></span></Link>
      <nav id="navigation" aria-label="Main navigation"><Link href="/listings" {...cur('listings')}>{t('Properties')}</Link><Link href="/finder" {...cur('finder')}>{t('Smart finder')}</Link><Link href="/membership" {...cur('membership')}>{t('Membership')}</Link><Link href="/sell" {...cur('sell')}>{t('Sell to us')}</Link><LangToggle lang={lang} signedIn={!!u} />
        {u ? <><Link className="account-btn" href={u.staff ? '/admin' : '/account'}><span className="avatar">{u.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span><span>{u.staff ? 'Staff' : t('My account')}{me.unread ? <i className="dot">{me.unread}</i> : null}</span>{!u.staff && <span className={`tier-pill tier-${u.tier}`}>{u.tierLabel}</span>}</Link><ActionButton url="/api/auth/logout" label={t('Log out')} className="link-button" redirect="/" /></>
          : <><Link href="/login">{t('Log in')}</Link><Link className="btn small navy" href="/register">{t('Join free')} <span>↗</span></Link></>}</nav></header></div>;
}
export function Footer({ lang }: { lang: string }) {
  const t = tr(lang);
  return <footer><div className="footer-top"><div><p className="eyebrow light">PORTFOLIO &amp; PRIME</p><h2>Good property.<br />A better conversation.</h2><Link className="btn cream" href="/sell">{t('Sell your property to us')} ↗</Link></div><div className="footer-links"><Link href="/listings">{t('Properties')}</Link><Link href="/finder">{t('Smart finder')}</Link><Link href="/membership">{t('Membership')}</Link><Link href="/sell">{t('Sell to us')}</Link><Link href="/account">{t('My account')}</Link><Link href="/admin">{t('Staff workspace')}</Link></div></div>
    <div className="footer-bottom"><span>© 2026 Portfolio &amp; Prime</span><span>Prices k.k. unless stated · Figures indicative, not advice</span><span>Next.js · NestJS · PostgreSQL (PGlite demo)</span></div>
    <p className="disclosure">Demo build of the Product &amp; Technical Plan (23 October 2026). All listings, investors and figures are fictional; photographs are reference imagery. KYC, payments, e-signing and emails are simulated adapters; nothing leaves this computer.</p></footer>;
}
const isNew = (d?: string) => !!d && Date.now() - new Date(d).getTime() < 7 * 864e5;
export function ListingCard({ l, lang, signedIn, me }: { l: any; lang: string; signedIn: boolean; me?: Me }) {
  const t = tr(lang); const nl = lang === 'nl';
  if (l.locked) return <article className="property-card locked-card"><div className="card-image"><img className="private-image" src={`/img/${l.image}.jpg`} alt="" /><span className="property-tag dark">Off-market · Pro first look</span><span className="lock-center"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg></span></div>
    <div className="card-info"><div className="card-top"><p className="eyebrow">{l.city} region</p><span className="pill pro">PRO</span></div><span className="card-title">{nl && l.propertyTypeNl ? l.propertyTypeNl : l.propertyType}, {l.areaM2} m²</span><p className="card-type">Investor Pro members see this deal first.</p>{l.offMarket === 'pro-window' && l.proEarlyAccessUntil && <p className="opens">Opens for you in <Countdown until={l.proEarlyAccessUntil} /></p>}
      <div className="card-actions"><Link className="btn small outline" href={l.offMarket === 'pro-window' ? '/account/upgrade' : signedIn ? '/account/verify' : '/register'}>{l.offMarket === 'pro-window' ? 'Upgrade to Pro' : signedIn ? 'Get verified' : t('Join free')} ↗</Link></div></div></article>;
  const price = l.askingPrice ? money(l.askingPrice) : l.priceDisplay || t('Price on request');
  return <article className="property-card"><div className="card-image"><Link href={`/listings/${l.slug}`} aria-label={l.name}><img src={`/img/${l.image}.jpg`} alt={`Reference architecture for ${l.city}`} loading="lazy" /></Link><span className={`property-tag ${l.previousPrice ? 'drop' : ''}`}>{l.previousPrice ? 'Price reduced' : t(DEAL[l.dealType])}</span>{isNew(l.publishedAt) && l.status !== 'coming_soon' && <span className="new-flag">{t('New')}</span>}<SaveButton slug={l.slug} saved={l.saved} signedIn={signedIn} /><span className="score-badge"><Ring v={l.dealScore.total} cls="sm" /><span>{t('Deal score')}<small>{l.dealScore.band}</small></span></span></div>
    <div className="card-info"><div className="card-top"><p className="eyebrow">{l.city} <span> / {l.district}</span></p><span className={`pill st-${l.status}`}>{t(STATUS[l.status])}</span></div><Link className="card-title" href={`/listings/${l.slug}`}>{nl && l.nameNl ? l.nameNl : l.name} <span>↗</span></Link>
      <p className="card-type">{nl && l.propertyTypeNl ? l.propertyTypeNl : l.propertyType} · {l.areaM2.toLocaleString('nl-NL')} m² · {l.address || <span className="muted-lock">{t('Address shown to members')}</span>}</p>
      <dl className="card-stats"><div><dt>{t('Price')}</dt><dd>{price}{l.previousPrice ? <s>{money(l.previousPrice)}</s> : null}</dd></div><div><dt>{l.bar ? 'BAR' : t('Plot')}</dt><dd>{l.bar ? pct(l.bar) : l.plotM2 ? l.plotM2.toLocaleString('nl-NL') + ' m²' : '—'}</dd></div><div><dt>{l.unitsCount > 1 ? t('Units') : t('Energy')}</dt><dd>{l.unitsCount > 1 ? l.unitsCount : l.energyLabel || '—'}</dd></div></dl>
      <div className="card-actions"><span className="owned">✓ Own stock · k.k.</span><Link className="chip-btn" href={`/listings/${l.slug}`}>View ↗</Link></div></div></article>;
}
export function TierCards({ me, compact, pro }: { me: Me; compact?: boolean; pro: number }) {
  const cur = me.user ? me.user.tier : 'visitor';
  const rows: [string, string, string, string][] = [['visitor', 'Visitor', '€0', 'Teaser: city, type, price band, headline yield, photos'], ['free', 'Free member', '€0', '+ exact address, full financials, floor plans · weekly alerts'], ['verified', 'Verified investor', '€0 · KYC', '+ data room after NDA · offers and bid rounds · off-market 48 h after Pro · daily alerts'], ['pro', 'Investor Pro', `€${pro}/mo`, '+ off-market first look · instant alerts · portfolio deals · account manager']];
  return <div className={`tier-grid ${compact ? 'compact' : ''}`}>{rows.map(([k, label, price, txt]) => <div key={k} className={`tier-card ${k === cur ? 'current' : ''} ${k === 'pro' ? 'pro' : ''}`}><p className="eyebrow">{label.toUpperCase()}</p><b className="tier-price">{price}</b><p>{txt}</p>
    {k === cur ? <span className="pill">Your level</span> : k === 'free' && cur === 'visitor' ? <Link className="btn small navy" href="/register">Join free</Link> : k === 'verified' && cur === 'free' ? <Link className="btn small navy" href="/account/verify">Get verified</Link> : k === 'pro' && cur === 'verified' ? <Link className="btn small brass" href="/account/upgrade">Upgrade to Pro</Link> : null}</div>)}</div>;
}
export function SoldTable({ rows }: { rows: any[] }) {
  return <div className="table-wrap"><table className="sold-table"><thead><tr><th>City</th><th>Type</th><th>Units</th><th>Price band</th><th>Deal</th><th>Days to offer</th></tr></thead><tbody>{rows.map((x, i) => <tr key={i}><td>{x.city}</td><td>{x.propertyType}</td><td>{x.units}</td><td>{x.priceBand}</td><td>{DEAL[x.dealType]}</td><td>{x.daysToOffer}</td></tr>)}</tbody></table></div>;
}
export const Shield = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>;
