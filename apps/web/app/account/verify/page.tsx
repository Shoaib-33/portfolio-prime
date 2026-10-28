import { redirect } from 'next/navigation';
import { getMe } from '@/lib/api';
import { ActionForm } from '@/components/client';
export const metadata = { title: 'Verification | Portfolio & Prime', robots: { index: false, follow: false } };
export default async function Verify() {
  const me = await getMe(); if (!me.user) redirect('/login?next=/account/verify'); const u = me.user; const company = u.investorType !== 'Private person';
  if (u.verified) return <section className="page-heading"><h1>You are verified.</h1><p>You can open data rooms, make offers and join bid rounds.</p></section>;
  if (me.kyc?.status === 'pending') return <section className="page-heading"><p className="eyebrow">KYC IN REVIEW · {me.kyc.risk?.toUpperCase()} RISK</p><h1>Thank you. We are reviewing your documents.</h1><p>Our compliance officer usually decides within one working day. Demo: log in as compliance@demo.nl and approve it in the staff workspace.</p></section>;
  return <><section className="page-heading"><p className="eyebrow">VERIFY ONCE · WWFT CUSTOMER DUE DILIGENCE</p><h1>Become a verified investor.</h1><p>Verified investors open data rooms, make offers and join bid rounds. Files are stored encrypted in production and only compliance staff can open them.</p></section>
    <section className="section"><ActionForm action="/api/kyc/cases" multipart redirect="/account/verify" className="panel auth-card wide" success="Submitted for review." submitLabel="Submit for review ↗">
      <label>Identity document (passport or ID card · PDF, PNG, JPG)<input type="file" name="idDoc" accept=".pdf,.png,.jpg,.jpeg" required /></label>
      <label className="check-label"><input type="checkbox" name="liveness" required /><span>I completed the selfie liveness check (simulated in this demo).</span></label>
      {company && <div className="form-grid"><label>KVK number<input name="kvk" required pattern="\d{8}" inputMode="numeric" placeholder="12345678" /></label><label>Ultimate beneficial owner (UBO)<input name="ubo" required minLength={2} /></label></div>}
      <label>Proof of funds or financing<input type="file" name="proof" accept=".pdf,.png,.jpg,.jpeg" required /></label>
      <div className="form-grid"><label>Typical ticket<select name="ticket"><option value="1000000">Up to €1 million</option><option value="5000000">€1–5 million</option><option value="20000000">€5–20 million</option></select></label><label>Politically exposed person (PEP)?<select name="pep"><option value="no">No</option><option value="yes">Yes</option></select></label></div>
      <p className="fine-print">Production: ID and liveness via a KYC provider or iDIN, KVK and UBO register checks, PEP and sanctions screening, ongoing monitoring.</p></ActionForm></section></>;
}
