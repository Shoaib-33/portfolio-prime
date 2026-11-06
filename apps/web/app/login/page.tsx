import { LoginForm } from '@/components/client';
import { RegisterShell } from '@/components/home/shell';
import { tr } from '@/lib/i18n';
import { getLang } from '@/lib/api';
export const metadata = { title: 'Log in | Maasland & Partners', robots: { index: false, follow: false } };
const DEMO: [string, string][] = [['developer@demo.nl', 'Developer · everything, incl. CRM & API'], ['admin@demo.nl', 'Admin · invites investors, runs the workspace'], ['investor@demo.nl', 'Investor · 6 shared properties, every feature']];
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams; const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined; const lang = await getLang(); const t = tr(lang);
  return <RegisterShell lang={lang} demo={process.env.PP_DEMO !== '0'} current="login">
    <section className="rg-auth">
      <figure className="rg-auth-fig"><img src="/img/r1.jpg" alt={t('Historic canal-side architecture in Amsterdam')} />
        <figcaption><p className="rg-auth-quote">{t('Every investor sees a personal selection, with every number and document in one place.')}</p>
          <ul className="rg-checks">{['Two-factor login', 'Documents watermarked with your name', 'One account manager'].map(x => <li key={x}>{t(x)}</li>)}</ul></figcaption></figure>
      <div className="rg-auth-main">
        <p className="rg-eyebrow">{t('Secure investor login')}</p>
        <h1 className="rg-auth-title">{t('Welcome back.')}</h1>
        <p className="rg-auth-lead">{t('For invited investors and staff. New investors join through the personal invitation link an admin sends them.')}</p>
        <div className="rg-auth-form"><LoginForm next={safeNext} demo={DEMO.map(([e, d]) => [e, t(d)] as [string, string])} /></div>
      </div>
    </section>
  </RegisterShell>;
}
