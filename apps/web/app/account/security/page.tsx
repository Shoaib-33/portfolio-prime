import { redirect } from 'next/navigation';
import { getMe } from '@/lib/api';
import { TwoFactorSetup } from '@/components/client';
export default async function Security({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await getMe(); if (!me.user) redirect('/login?next=/account/security'); const { next } = await searchParams; const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined;
  return <><section className="page-heading"><p className="eyebrow">SECURITY</p><h1>Two-factor login.</h1></section><section className="section">{me.user.twofaEnabled ? <div className="panel auth-card"><h2>Two-factor login is on.</h2><p>You will be asked for a code each time you log in.</p></div> : <TwoFactorSetup next={safe} />}</section></>;
}
