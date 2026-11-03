import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, getMe, getLang } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { ActionForm } from '@/components/client';
export const metadata = { title: 'Investor Pro | Maasland & Partners', robots: { index: false, follow: false } };
export default async function Upgrade() {
  const me = await getMe(); if (!me.user) redirect('/login?next=/account/upgrade'); const cfg = (await api('/config/public')).data; const t = tr(await getLang());
  if (me.user.tier === 'pro') return <section className="page-heading"><h1>{t('You are on Investor Pro.')}</h1><p><Link href="/listings">{t('See the off-market deals ↗')}</Link></p></section>;
  if (!me.user.verified) return <section className="page-heading"><h1>{t('Verify first.')}</h1><p>{t('Investor Pro includes data rooms and offers, so verification comes first.')}</p><Link className="btn navy" href="/account/verify">{t('Get verified ↗')}</Link></section>;
  return <><section className="page-heading"><p className="eyebrow">{t('INVESTOR PRO · CHECKOUT')}</p><h1>{t('First look at every off-market deal.')}</h1></section>
    <section className="section"><ActionForm action="/api/billing/checkout" bools={['withdrawalAcknowledged']} redirect="/account" className="panel auth-card wide" success={t('Payment simulated. Welcome to Investor Pro.')} submitLabel={t('Pay with Mollie (demo) ↗')}>
      <div className="plan-choice"><label><input type="radio" name="plan" value="month" defaultChecked /><span><b>{t('Monthly')}</b>{t('€{price} / month · cancel any time', { price: cfg.proPriceMonth })}</span></label><label><input type="radio" name="plan" value="year" /><span><b>{t('Yearly')}</b>{t('€{price} / year · two months free', { price: cfg.proPriceYear })}</span></label></div>
      <label>{t('Payment method')}<select name="method"><option value="iDEAL">iDEAL</option><option value="Card">{t('Card')}</option><option value="SEPA direct debit">{t('SEPA direct debit')}</option></select></label>
      <label className="check-label"><input type="checkbox" name="withdrawalAcknowledged" required /><span>{t('I know I can withdraw within 14 days and cancel monthly. Prices exclude VAT.')}</span></label>
      <p className="fine-print">{t('Demo checkout: no payment is taken. Production uses Mollie subscriptions with webhooks.')}</p></ActionForm></section></>;
}
