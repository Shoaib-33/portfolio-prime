/* Server components for the listing's Analysis and Process tabs (data from /api/listings/:slug/analysis and /process). */
import Link from 'next/link';
import { api, getLang, Me } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { money, moneyShort, date } from '@/lib/format';
import { ActionForm } from '@/components/client';
import { StressTest } from '@/components/analyst';
import { Shield } from '@/components/ui';

const LEVEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low', positive: 'Strength' };

export async function AnalysisTab({ l, me }: { l: any; me: Me }) {
  const u = me.user; const t = tr(await getLang());
  if (!l.full) return <div className="access-gate"><Shield /><h2>{t('The institutional analysis.')}</h2><p>{t('Valuation and comparables, a 10-year DCF with stress tests, Dutch rent-regulation exposure, ESG and due-diligence flags. Join free to open it.')}</p><Link className="btn navy" href={`/login?next=/listings/${l.slug}?tab=analysis`}>{t('Join free')} ↗</Link></div>;
  const r = await api(`/listings/${l.slug}/analysis`); if (!r.ok) return <p className="form-error">{r.data?.message}</p>;
  const a = r.data; const v = a.valuation; const L = a.listing;
  const lo = Math.min(v.low, L.askingPrice) * 0.97, hi = Math.max(v.high, L.askingPrice) * 1.03; const at = (x: number) => ((x - lo) / (hi - lo) * 100) + '%';
  const deep = !!a.regulation;
  return <div className="analysis">
    <div className="row between wrap"><div><p className="eyebrow">{t('ANALYSIS')} · {t(a.access).toUpperCase()}</p><h2>{t('The numbers behind the deal.')}</h2></div>
      {u && (u.verified || u.staff) ? <a className="btn outline small" href={`/api/listings/${l.slug}/memo`} target="_blank" rel="noopener">{t('Generate IC memo (PDF)')} ↓</a> : <Link className="btn outline small" href="/account/verify">{t('Verify to generate the IC memo')}</Link>}</div>

    <section className="an-block"><p className="eyebrow">01 · {t('VALUATION CHECK')}</p><h3>{t(v.verdict)}.</h3>
      <div className="range-bar" role="img" aria-label={t('Estimated value {low} to {high}, asking {ask}', { low: money(v.low), high: money(v.high), ask: money(L.askingPrice) })}><div className="band" style={{ left: at(v.low), width: `calc(${at(v.high)} - ${at(v.low)})` }} /><i className="mid" style={{ left: at(v.point) }} /><i className="ask" style={{ left: at(L.askingPrice) }}><span>{t('Asking {price}', { price: moneyShort(L.askingPrice) })}</span></i></div>
      <div className="kf-mini"><div><span>{t('Estimated value')}</span><b>{moneyShort(v.point)}</b></div><div><span>{t('Range')}</span><b>{moneyShort(v.low)}–{moneyShort(v.high)}</b></div><div><span>{t('Asking vs estimate')}</span><b>{v.vsAsking > 0 ? '+' : ''}{v.vsAsking}%</b></div><div><span>{t('Market BAR · €/m²')}</span><b>{v.marketBar}% · {money(v.marketPerM2)}</b></div></div>
      <p className="fine-print">{t(v.method)}. {t('Benchmarks {date}.', { date: v.asOf })}</p>
      <div className="table-wrap" tabIndex={0}><table><thead><tr><th>{t('Comparable transaction')}</th><th>{t('City')}</th><th>{t('Units')}</th><th>{t('Price')}</th><th>{t('Per unit')}</th><th>BAR</th><th>{t('Label')}</th><th>{t('Date')}</th><th>{t('Buyer')}</th></tr></thead><tbody>{a.comparables.map((c: any) => <tr key={c.name}><td>{c.name}</td><td>{c.city}</td><td>{c.units}</td><td>{moneyShort(c.price)}</td><td>{money(c.perUnit)}</td><td>{c.bar}%</td><td>{c.label}</td><td>{c.date}</td><td>{t(c.buyer)}</td></tr>)}<tr className="this-row"><td><b>{L.name} ({t('asking')})</b></td><td>{L.city}</td><td>{L.units}</td><td>{moneyShort(L.askingPrice)}</td><td>{money(Math.round(L.askingPrice / L.units))}</td><td>{L.bar ?? '—'}%</td><td>{L.energyLabel}</td><td>{t('Now')}</td><td>—</td></tr></tbody></table></div>
      <p className="fine-print">{t('Comparable transactions are fictional demo data. Production uses a transaction-data feed.')}</p></section>

    {a.scenarioBase && <section className="an-block"><p className="eyebrow">02 · {t('RETURNS & STRESS TESTS')}</p><h3>{t('Move the assumptions.')}</h3><StressTest slug={l.slug} base={a.scenarioInputs} /></section>}

    <section className="an-block"><p className="eyebrow">03 · {t('DUTCH RENT REGULATION (WWS)')}</p><h3>{deep ? t('{pct}% of rent above the points cap.', { pct: a.regulation.lossPct }) : t('Unit-level exposure.')}</h3>
      {deep ? <><div className="seg-bar">{(['social', 'mid', 'free'] as const).map(k => a.regulation.segments[k] > 0 && <div key={k} className={`seg ${k}`} style={{ flex: a.regulation.segments[k] }}><b>{a.regulation.segments[k]}</b><span>{k === 'social' ? t('Social ≤{n} pts', { n: a.regulation.thresholds.socialPts }) : k === 'mid' ? t('Mid-rent ≤{n} pts', { n: a.regulation.thresholds.midPts }) : t('Free sector')}</span></div>)}</div>
        <div className="kf-mini"><div><span>{t('Rent today')}</span><b>{moneyShort(a.regulation.rentNow)}</b></div><div><span>{t('At WWS caps')}</span><b>{moneyShort(a.regulation.rentAfter)}</b></div><div><span>{t('Annual exposure')}</span><b className="warn">{money(a.regulation.annualLoss)}</b></div><div><span>{t('Units above cap')}</span><b>{a.regulation.affected} / {a.regulation.units}</b></div></div>
        <div className="table-wrap" tabIndex={0}><table><thead><tr><th>{t('Unit')}</th><th>{t('Area')}</th><th>{t('Label')}</th><th>{t('Points')}</th><th>{t('Segment')}</th><th>{t('Rent')}</th><th>{t('Max rent')}</th><th>{t('Above cap')}</th></tr></thead><tbody>{a.regulation.worst.filter((w: any) => w.excess > 0).map((w: any) => <tr key={w.ref}><td>{w.ref}</td><td>{w.areaM2} m²</td><td>{w.label}</td><td>{w.points}</td><td>{t(w.segment)}</td><td>{money(w.rent)}</td><td>{money(w.maxRent)}</td><td className="neg-text">{money(w.excess)}{t('/mo')}</td></tr>)}</tbody></table></div>
        <p className="fine-print">{t(a.regulation.note)}</p></>
        : <div className="note">{t('The points check runs per unit on the rent roll, which opens after verification and the property NDA.')} {u?.verified ? <Link className="text-link" href={`/listings/${l.slug}?tab=${l.dealType === 'institutional' ? 'process' : 'dataroom'}`}>{t('Sign the NDA')} ↗</Link> : <Link className="text-link" href="/account/verify">{t('Get verified')} ↗</Link>}</div>}</section>

    <section className="an-block"><p className="eyebrow">04 · ESG</p><h3>{a.esg.taxonomyAligned ? t('Likely EU Taxonomy-aligned.') : t('Not Taxonomy-aligned on the label test.')}</h3>
      {a.esg.unitLevel && <div className="label-bars">{a.esg.distribution.map((d: any) => <div key={d.label}><i className={`energy lb-${d.label}`}>{d.label}</i><div className="t"><span style={{ width: d.units / L.units * 100 + '%' }} /></div><b>{d.units}</b></div>)}</div>}
      <div className="kf-mini"><div><span>{t('Label A/B (floor area)')}</span><b>{a.esg.shareAorB}%</b></div><div><span>{t('Energy intensity')}</span><b>~{a.esg.energyIntensity} kWh/m²</b></div><div><span>{t('CO₂ a year')}</span><b>~{a.esg.co2Total} t</b></div><div><span>{t('Capex to label B')}</span><b>{moneyShort(a.esg.upgradeCapexToB)}</b></div></div>
      <p className="fine-print">{t(a.esg.note)} {t('SFDR energy-inefficient share: {pct}%.', { pct: a.esg.sfdrInefficientShare })}{!a.esg.unitLevel && ' ' + t('Label per unit opens with the rent roll.')}</p></section>

    <section className="an-block"><p className="eyebrow">05 · {t('DUE-DILIGENCE FLAGS')}</p><h3>{t('What to check first.')}</h3>
      <ul className="flags">{a.flags.map((f: any) => <li key={f.title} className={`flag ${f.level}`}><span className="lvl">{t(LEVEL[f.level])}</span><div><b>{f.title}</b><p>{f.detail}</p><small>{t('Source')}: {f.source}</small></div></li>)}</ul>
      <p className="fine-print">{deep ? t('Generated from the property file and the rent roll.') : t('Generated from the property file.')} {t('Production adds document AI that reads leases, valuation reports, VvE minutes and MJOPs in the data room.')}</p></section>
  </div>;
}

const STATE: Record<string, string> = { done: '✓', current: '●', next: '' };
export async function ProcessTab({ l, me }: { l: any; me: Me }) {
  const r = await api(`/listings/${l.slug}/process`); if (!r.ok) return <p className="form-error">{r.data?.message}</p>;
  const t = tr(await getLang()); const p = r.data; const u = me.user; const bidOpen = ['indicative', 'final'].includes(p.stageKey) && (p.stageKey !== 'final' || p.shortlisted) && !u?.staff;
  return <div className="deal-process">
    <p className="eyebrow">{t('STRUCTURED SALE PROCESS')} · {p.advisor?.toUpperCase()}</p><h2>{t(p.stageLabel)}.</h2>
    {p.nextDeadline && <p className="lead-copy small">{t('Next deadline:')} <b>{t(p.nextDeadline.label)}</b>, {date(p.nextDeadline.at)}. {t('Minimum ticket {amount}.', { amount: money(p.minTicket) })} {p.bidsReceived.indicative === 1 ? t('1 indicative bid received') : t('{n} indicative bids received', { n: p.bidsReceived.indicative })}{p.bidsReceived.final ? t(', {n} final', { n: p.bidsReceived.final }) : ''}.</p>}
    <ol className="stage-line">{p.stagesList.map((s: any) => <li key={s.key} className={s.state}><span>{STATE[s.state]}</span><b>{t(s.label)}</b>{s.deadline && <small>{date(s.deadline)}</small>}</li>)}</ol>
    {p.shortlisted && <div className="note">{t('You are on the shortlist: management presentations, site visits and the vendor due-diligence reports are open to you.')}</div>}
    {!p.nda && !u?.staff ? <div className="access-gate"><Shield /><h3>{t('Sign the deal-room NDA.')}</h3><p>{t('Opens the information memorandum, the full data room, the Q&A log and bidding. NDA v1.2 (NL/EN): confidentiality, non-circumvention and no contact with tenants, staff or the vendor.')}</p>
      <ActionForm action={`/api/listings/${l.slug}/nda`} bools={['accept']} className="nda-form" success={t('NDA signed. The deal room is open.')} submitLabel={t('Sign NDA') + ' ↗'}><label>{t('Full name of the authorised signatory')}<input name="signedName" required minLength={2} defaultValue={u?.name} /></label><label className="check-label"><input type="checkbox" name="accept" required /><span>{t('I accept this NDA on behalf of {org}.', { org: u?.companyName || t('my organisation') })}</span></label></ActionForm></div>
      : <>
        {p.myBids.length > 0 && <div className="panel"><p className="eyebrow">{t('YOUR BIDS')}</p>{p.myBids.map((b: any) => <div key={b.id} className="saved-brief"><span><b>{money(b.amount)}</b> · {t(b.status)} · {t(b.financingType)} · {b.conditions.join(', ')}</span><small>{date(b.at)}</small></div>)}</div>}
        {bidOpen && <details className="side-form" open={!p.myBids.length}><summary className="btn navy">{p.myBids.some((b: any) => b.status === (p.stageKey === 'final' ? 'final' : 'indicative')) ? t('Update your bid') : p.stageKey === 'final' ? t('Submit a final binding bid') : t('Submit an indicative bid')} ↗</summary>
          <ActionForm action={`/api/listings/${l.slug}/process/bids`} bools={['acceptRules']} numbers={['amount']} className="panel" success={t('Bid received. It stays confidential.')} submitLabel={t('Submit bid') + ' ↗'}>
            <div className="form-grid"><label>{t('Bid amount k.k. (€)')}<input name="amount" type="number" min={p.minTicket} step={100000} required defaultValue={Math.round(l.askingPrice * 0.97 / 1e5) * 1e5} /></label><label>{t('Financing')}<select name="financingType"><option value="Cash">{t('Cash')}</option><option value="Mixed">{t('Mixed')}</option><option value="Debt-financed">{t('Debt-financed')}</option></select></label><label>{t('Structure')}<select name="structure"><option value="Share deal">{t('Share deal')}</option><option value="Asset deal">{t('Asset deal')}</option><option value="Either">{t('Either')}</option></select></label><label>{t('Key conditions')}<input name="conditions" maxLength={400} placeholder={t('e.g. confirmatory DD, IC approval')} /></label></div>
            <label>{t('Cover note')}<textarea name="message" maxLength={2000} placeholder={t('Your organisation, track record and timing')} /></label>
            <label className="check-label"><input type="checkbox" name="acceptRules" required /><span>{t('I accept the process letter.')} {p.stageKey === 'final' ? t('This bid is binding subject to the SPA.') : t('Indicative bids are non-binding.')}</span></label></ActionForm></details>}
        <div className="qa"><div className="row between wrap"><div><p className="eyebrow">{t('Q&A LOG · ANONYMISED')}</p><h3>{p.qa.length === 1 ? t('1 question.') : t('{n} questions.', { n: p.qa.length })}</h3></div></div>
          {p.qa.map((q: any) => <details key={q.id} className="qa-item" open={!q.answer}><summary><span className="pill">{t(q.category)}</span><b>{q.question}</b>{q.mine && <small>{t('Your question')}</small>}</summary>{q.answer ? <p>{q.answer}<small>{t('Answered {date}', { date: date(q.answeredAt) })}</small></p> : <p className="muted-small">{t('Waiting for the vendor’s answer.')}</p>}</details>)}
          {!u?.staff && <ActionForm action={`/api/listings/${l.slug}/qa`} className="panel qa-ask" success={t('Question submitted. Answers are shared with all parties, without your name.')} submitLabel={t('Submit question') + ' ↗'}><div className="form-grid"><label>{t('Category')}<select name="category">{['Financial', 'Legal', 'Technical', 'Tax', 'Process', 'General'].map(c => <option key={c} value={c}>{t(c)}</option>)}</select></label></div><label>{t('Question')}<textarea name="question" required minLength={10} maxLength={1500} /></label></ActionForm>}</div>
      </>}
  </div>;
}
