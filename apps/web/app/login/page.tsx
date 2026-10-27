import { LoginForm } from '@/components/client';
const DEMO: [string, string][] = [['developer@demo.nl', 'Developer · everything, incl. CRM & API'], ['admin@demo.nl', 'Admin · invites investors, runs the workspace'], ['free@demo.nl', 'Investor · 3 shared properties'], ['verified@demo.nl', 'Investor · verified buyer, 6 properties'], ['pro@demo.nl', 'Investor · all properties, every feature'], ['fund@demo.nl', 'Investor · pension fund, private deal rooms']];
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams; const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined;
  return <><section className="page-heading"><p className="eyebrow">LOG IN</p><h1>Welcome back.</h1><p>For invited investors and staff. New here? Open the link in your invitation, or try the demo invitation at <a className="text-link" href="/invite/demo-invite-pieter">/invite/demo-invite-pieter</a>.</p></section><section className="section"><LoginForm next={safeNext} demo={DEMO} /></section></>;
}
