import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, getMe, getLang } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { dateTime } from '@/lib/format';
import { ActionForm } from '@/components/client';

export const metadata = { title: 'Messages | Maasland & Partners' };

export default async function Messages({ searchParams }: { searchParams: Promise<{ listing?: string }> }) {
  const me = await getMe(); if (!me.user) redirect('/login?next=/account/messages'); if (me.user.staff) redirect('/admin?tab=messages');
  const tx = tr(await getLang());
  const sp = await searchParams; const list = (await api('/messages')).data?.threads || [];
  const current = sp.listing || list[0]?.slug || 'general';
  const th = await api('/messages/thread?listing=' + encodeURIComponent(current)); const t = th.ok ? th.data : null;
  const threads = list.some((x: any) => x.slug === current) || !t ? list : [{ slug: current, listingName: t.listing.name, last: tx('New conversation'), lastAt: null, unreadForInvestor: 0 }, ...list];
  return <>
    <section className="page-heading"><p className="eyebrow">{tx('MY ACCOUNT · MESSAGES')}</p><h1>{tx('Talk to your')} <em>{tx('account manager.')}</em></h1><p>{tx('Messages stay on the platform and are linked to a property. You get an alert when {name} replies; the email only says there is a new message.', { name: t?.accountManager || tx('your account manager') })}</p><Link className="text-link" href="/account">{tx('← My account')}</Link></section>
    <section className="section msg-layout">
      <nav className="msg-threads" aria-label={tx('Conversations')}>{threads.map((x: any) => <Link key={x.slug} href={`/account/messages?listing=${x.slug}`} className={x.slug === current ? 'on' : ''} aria-current={x.slug === current ? 'page' : undefined}><b>{x.slug === 'general' ? tx(x.listingName) : x.listingName}{x.unreadForInvestor > 0 && <i className="dot">{x.unreadForInvestor}</i>}</b><span>{x.last}</span>{x.lastAt && <small>{dateTime(x.lastAt, t)}</small>}</Link>)}
        {!threads.some((x: any) => x.slug === 'general') && <Link href="/account/messages?listing=general" className={current === 'general' ? 'on' : ''}><b>{tx('+ General question')}</b><span>{tx('Not about one property')}</span></Link>}</nav>
      <div className="msg-pane">{!t ? <p className="form-error">{th.data?.message || tx('Could not load this conversation.')}</p> : <>
        <div className="msg-head"><div><p className="eyebrow">{t.listing.slug === 'general' ? tx('GENERAL') : tx('PROPERTY')}</p><h2>{t.listing.slug === 'general' ? tx(t.listing.name) : <Link href={`/listings/${t.listing.slug}`}>{t.listing.name} ↗</Link>}</h2></div><div className="contact-avatar"><span>{t.accountManager.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span><div><b>{t.accountManager}</b><small>{tx('Account manager · replies within 24 h')}</small></div></div></div>
        <ol className="msg-list">{t.messages.length ? t.messages.map((m: any) => <li key={m.id} className={m.fromStaff ? 'them' : 'me'}><p>{m.body}</p><small>{m.fromStaff ? m.sender : tx('You')} · {dateTime(m.at, t)}{!m.fromStaff && m.read ? ` · ${tx('read')}` : ''}</small></li>) : <li className="msg-empty">{tx('No messages yet. Ask about rent, viewings, financing or the documents.')}</li>}</ol>
        <ActionForm action="/api/messages" className="msg-compose" success={tx('Sent.')} submitLabel={tx('Send ↗')}><input type="hidden" name="listing" value={t.listing.slug} /><label className="sr-only" htmlFor="msg-body">{tx('Your message')}</label><textarea id="msg-body" name="body" required minLength={2} maxLength={4000} placeholder={tx('Write a message…')} /></ActionForm></>}</div>
    </section></>;
}
