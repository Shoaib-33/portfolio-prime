import { LoginForm } from '@/components/client';
import { tr } from '@/lib/i18n';
import { getLang } from '@/lib/api';
export const metadata = { title: 'Log in | Maasland & Partners', robots: { index: false, follow: false } };
const DEMO: [string, string][] = [['developer@demo.nl', 'Developer · everything, incl. CRM & API'], ['admin@demo.nl', 'Admin · invites investors, runs the workspace'], ['investor@demo.nl', 'Investor · 6 shared properties, every feature']];
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams; const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined; const t = tr(await getLang());
  return <><section className="page-heading"><p className="eyebrow">{t('LOG IN')}</p><h1>{t('Welcome back.')}</h1><p>{t('For invited investors and staff. New investors join through the personal invitation link an admin sends them.')}</p></section><section className="section"><LoginForm next={safeNext} demo={DEMO.map(([e, d]) => [e, t(d)] as [string, string])} /></section></>;
}
