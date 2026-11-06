/* Shared frame for visitor pages (home, log in): fonts, navigation, footer and motion.
   Dark and cinematic: charcoal, warm off-white and one coral accent; Cormorant Garamond display, Jost text.
   Styles live in app/register.css (scoped to .reg). */
import Link from 'next/link';
import { ReactNode } from 'react';
import { Cormorant_Garamond, Jost } from 'next/font/google';
import { LangToggle, ThemeToggle } from '@/components/client';
import { tr } from '@/lib/i18n';
import { RgNav, RgMotion } from './register-client';

const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['300', '400', '500'], variable: '--rg-display', display: 'swap' });
const sans = Jost({ subsets: ['latin'], weight: ['300', '400', '500'], variable: '--rg-sans', display: 'swap' });

export const Arrow = () => <svg className="rg-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
/** The wordmark: spaced capitals. */
export const Mark = ({ light = false }: { light?: boolean }) => <span className={`rg-mark${light ? ' is-light' : ''}`}>Maasland <i>&amp;</i> Partners</span>;

/** home: the navigation starts transparent over the hero and section links stay on the page; elsewhere they lead back home. */
export function RegisterShell({ lang, demo, home = false, current, children }: { lang: string; demo: boolean; home?: boolean; current?: string; children: ReactNode }) {
  const t = tr(lang); const base = home ? '' : '/';
  const index: [string, string][] = [['approach', t('What we do')], ['access', t('How access works')], ['platform', t('Platform')], ['record', t('Track record')]];
  // Before first paint: mark that motion is allowed, so reveal targets start hidden without a flash.
  const boot = `(function(){if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('rg-motion')})();`;
  return <div className={`reg ${display.variable} ${sans.variable}${home ? ' reg-home' : ''}`}>
    <script dangerouslySetInnerHTML={{ __html: boot }} />
    <RgNav index={index} base={base} current={current} demo={demo} over={home} mark={<Mark />} labels={{ menu: t('Menu'), close: t('Close'), login: t('Log in'), request: t('Request access'), nav: t('Main navigation'), demo: t('DEMO · INVITE-ONLY · fictional listings and people'), demoLink: `${t('Demo accounts on the')} ${t('login page')}` }} lang={<><LangToggle lang={lang} signedIn={false} /><ThemeToggle /></>} />
    {children}
    <footer className="rg-foot">
      <div className="rg-foot-cta"><div><h2>{t('Start with a conversation.')}</h2><p>{t('A partner replies within one working day.')}</p></div><a className="rg-btn rg-btn-accent" href={`${base}#request`}>{t('Request access')}<Arrow /></a></div>
      <div className="rg-foot-grid">
        <div className="rg-foot-brand"><Mark light /><p>{t('Private real estate for professional investors in the Netherlands.')}</p></div>
        <nav aria-label={t('Footer')}><h3>{t('Explore')}</h3>{index.map(([id, l]) => <a key={id} href={`${base}#${id}`}>{l}</a>)}<a href={`${base}#faq`}>{t('FAQ')}</a></nav>
        <nav aria-label={t('For investors')}><h3>{t('For investors')}</h3><Link href="/invest-in-dutch-real-estate">{t('Invest in Dutch real estate')}</Link><Link href="/de/immobilien-investment-niederlande">Immobilien-Investment Niederlande</Link><Link href="/login">{t('Log in')}</Link><a href={`${base}#request`}>{t('Request access')}</a></nav>
      </div>
      <div className="rg-foot-legal"><span>© 2026 Maasland &amp; Partners</span><span>{t('Private offering · by invitation · figures indicative, not advice')}</span></div>
      {demo && <p className="rg-foot-demo">{t('Demo build. All listings, investors and figures are fictional; photographs are reference imagery. KYC, payments, e-signing and emails are simulated adapters. Listings arrive from the company CRM through the integration API.')}</p>}
    </footer>
    <RgMotion />
  </div>;
}
