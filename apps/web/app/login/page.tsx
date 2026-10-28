import { LoginForm } from '@/components/client';
export const metadata = { title: 'Log in | Portfolio & Prime', robots: { index: false, follow: false } };
const DEMO: [string, string][] = [['developer@demo.nl', 'Developer · everything, incl. CRM & API'], ['admin@demo.nl', 'Admin · invites investors, runs the workspace'], ['investor@demo.nl', 'Investor · 6 shared properties, every feature']];
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams; const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined;
  return <><section className="page-heading"><p className="eyebrow">LOG IN</p><h1>Welcome back.</h1><p>For invited investors and staff. New investors join through the personal invitation link an admin sends them.</p></section><section className="section"><LoginForm next={safeNext} demo={DEMO} /></section></>;
}
