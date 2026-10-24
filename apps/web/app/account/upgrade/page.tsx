import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, getMe } from '@/lib/api';
import { ActionForm } from '@/components/client';
export default async function Upgrade() {
  const me = await getMe(); if (!me.user) redirect('/login?next=/account/upgrade'); const cfg = (await api('/config/public')).data;
  if (me.user.tier === 'pro') return <section className="page-heading"><h1>You are on Investor Pro.</h1><p><Link href="/listings">See the off-market deals ↗</Link></p></section>;
  if (!me.user.verified) return <section className="page-heading"><h1>Verify first.</h1><p>Investor Pro includes data rooms and offers, so verification comes first.</p><Link className="btn navy" href="/account/verify">Get verified ↗</Link></section>;
  return <><section className="page-heading"><p className="eyebrow">INVESTOR PRO · CHECKOUT</p><h1>First look at every off-market deal.</h1></section>
    <section className="section"><ActionForm action="/api/billing/checkout" bools={['withdrawalAcknowledged']} redirect="/account" className="panel auth-card wide" success="Payment simulated. Welcome to Investor Pro." submitLabel="Pay with Mollie (demo) ↗">
      <div className="plan-choice"><label><input type="radio" name="plan" value="month" defaultChecked /><span><b>Monthly</b>€{cfg.proPriceMonth} / month · cancel any time</span></label><label><input type="radio" name="plan" value="year" /><span><b>Yearly</b>€{cfg.proPriceYear} / year · two months free</span></label></div>
      <label>Payment method<select name="method"><option>iDEAL</option><option>Card</option><option>SEPA direct debit</option></select></label>
      <label className="check-label"><input type="checkbox" name="withdrawalAcknowledged" required /><span>I know I can withdraw within 14 days and cancel monthly. Prices exclude VAT.</span></label>
      <p className="fine-print">Demo checkout: no payment is taken. Production uses Mollie subscriptions with webhooks.</p></ActionForm></section></>;
}
