/* Server components for the listing's Analysis and Process tabs (data from /api/listings/:slug/analysis and /process). */
import Link from 'next/link';
import { api, Me } from '@/lib/api';
import { money, moneyShort, date } from '@/lib/format';
import { ActionForm } from '@/components/client';
import { StressTest } from '@/components/analyst';
import { Shield } from '@/components/ui';

const LEVEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low', positive: 'Strength' };

export async function AnalysisTab({ l, me }: { l: any; me: Me }) {
  const u = me.user;
  if (!l.full) return <div className="access-gate"><Shield /><h2>The institutional analysis.</h2><p>Valuation and comparables, a 10-year DCF with stress tests, Dutch rent-regulation exposure, ESG and due-diligence flags. Join free to open it.</p><Link className="btn navy" href={`/login?next=/listings/${l.slug}?tab=analysis`}>Join free ↗</Link></div>;
  const r = await api(`/listings/${l.slug}/analysis`); if (!r.ok) return <p className="form-error">{r.data?.message}</p>;
  const a = r.data; const v = a.valuation; const L = a.listing;
  const lo = Math.min(v.low, L.askingPrice) * 0.97, hi = Math.max(v.high, L.askingPrice) * 1.03; const at = (x: number) => ((x - lo) / (hi - lo) * 100) + '%';
  const deep = !!a.regulation;
  return <div className="analysis">
    <div className="row between wrap"><div><p className="eyebrow">ANALYSIS · {a.access.toUpperCase()}</p><h2>The numbers behind the deal.</h2></div>
      {u && (u.verified || u.staff) ? <a className="btn outline small" href={`/api/listings/${l.slug}/memo`} target="_blank" rel="noopener">Generate IC memo (PDF) ↓</a> : <Link className="btn outline small" href="/account/verify">Verify to generate the IC memo</Link>}</div>

    <section className="an-block"><p className="eyebrow">01 · VALUATION CHECK</p><h3>{v.verdict}.</h3>
      <div className="range-bar" role="img" aria-label={`Estimated value ${money(v.low)} to ${money(v.high)}, asking ${money(L.askingPrice)}`}><div className="band" style={{ left: at(v.low), width: `calc(${at(v.high)} - ${at(v.low)})` }} /><i className="mid" style={{ left: at(v.point) }} /><i className="ask" style={{ left: at(L.askingPrice) }}><span>Asking {moneyShort(L.askingPrice)}</span></i></div>
      <div className="kf-mini"><div><span>Estimated value</span><b>{moneyShort(v.point)}</b></div><div><span>Range</span><b>{moneyShort(v.low)}–{moneyShort(v.high)}</b></div><div><span>Asking vs estimate</span><b>{v.vsAsking > 0 ? '+' : ''}{v.vsAsking}%</b></div><div><span>Market BAR · €/m²</span><b>{v.marketBar}% · {money(v.marketPerM2)}</b></div></div>
      <p className="fine-print">{v.method}. Benchmarks {v.asOf}.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table><thead><tr><th>Comparable transaction</th><th>City</th><th>Units</th><th>Price</th><th>Per unit</th><th>BAR</th><th>Label</th><th>Date</th><th>Buyer</th></tr></thead><tbody>{a.comparables.map((c: any) => <tr key={c.name}><td>{c.name}</td><td>{c.city}</td><td>{c.units}</td><td>{moneyShort(c.price)}</td><td>{money(c.perUnit)}</td><td>{c.bar}%</td><td>{c.label}</td><td>{c.date}</td><td>{c.buyer}</td></tr>)}<tr className="this-row"><td><b>{L.name} (asking)</b></td><td>{L.city}</td><td>{L.units}</td><td>{moneyShort(L.askingPrice)}</td><td>{money(Math.round(L.askingPrice / L.units))}</td><td>{L.bar ?? '—'}%</td><td>{L.energyLabel}</td><td>Now</td><td>—</td></tr></tbody></table></div>
      <p className="fine-print">Comparable transactions are fictional demo data. Production uses a transaction-data feed.</p></section>

    {a.scenarioBase && <section className="an-block"><p className="eyebrow">02 · RETURNS & STRESS TESTS</p><h3>Move the assumptions.</h3><StressTest slug={l.slug} base={a.scenarioInputs} /></section>}

    <section className="an-block"><p className="eyebrow">03 · DUTCH RENT REGULATION (WWS)</p><h3>{deep ? `${a.regulation.lossPct}% of rent above the points cap.` : 'Unit-level exposure.'}</h3>
      {deep ? <><div className="seg-bar">{(['social', 'mid', 'free'] as const).map(k => a.regulation.segments[k] > 0 && <div key={k} className={`seg ${k}`} style={{ flex: a.regulation.segments[k] }}><b>{a.regulation.segments[k]}</b><span>{k === 'social' ? `Social ≤${a.regulation.thresholds.socialPts} pts` : k === 'mid' ? `Mid-rent ≤${a.regulation.thresholds.midPts} pts` : 'Free sector'}</span></div>)}</div>
        <div className="kf-mini"><div><span>Rent today</span><b>{moneyShort(a.regulation.rentNow)}</b></div><div><span>At WWS caps</span><b>{moneyShort(a.regulation.rentAfter)}</b></div><div><span>Annual exposure</span><b className="warn">{money(a.regulation.annualLoss)}</b></div><div><span>Units above cap</span><b>{a.regulation.affected} / {a.regulation.units}</b></div></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Table"><table><thead><tr><th>Unit</th><th>Area</th><th>Label</th><th>Points</th><th>Segment</th><th>Rent</th><th>Max rent</th><th>Above cap</th></tr></thead><tbody>{a.regulation.worst.filter((w: any) => w.excess > 0).map((w: any) => <tr key={w.ref}><td>{w.ref}</td><td>{w.areaM2} m²</td><td>{w.label}</td><td>{w.points}</td><td>{w.segment}</td><td>{money(w.rent)}</td><td>{money(w.maxRent)}</td><td className="neg-text">{money(w.excess)}/mo</td></tr>)}</tbody></table></div>
        <p className="fine-print">{a.regulation.note}</p></>
        : <div className="note">The points check runs per unit on the rent roll, which opens after verification and the property NDA. {u?.verified ? <Link className="text-link" href={`/listings/${l.slug}?tab=${l.dealType === 'institutional' ? 'process' : 'dataroom'}`}>Sign the NDA ↗</Link> : <Link className="text-link" href="/account/verify">Get verified ↗</Link>}</div>}</section>

    <section className="an-block"><p className="eyebrow">04 · ESG</p><h3>{a.esg.taxonomyAligned ? 'Likely EU Taxonomy-aligned.' : 'Not Taxonomy-aligned on the label test.'}</h3>
      {a.esg.unitLevel && <div className="label-bars">{a.esg.distribution.map((d: any) => <div key={d.label}><i className={`energy lb-${d.label}`}>{d.label}</i><div className="t"><span style={{ width: d.units / L.units * 100 + '%' }} /></div><b>{d.units}</b></div>)}</div>}
      <div className="kf-mini"><div><span>Label A/B (floor area)</span><b>{a.esg.shareAorB}%</b></div><div><span>Energy intensity</span><b>~{a.esg.energyIntensity} kWh/m²</b></div><div><span>CO₂ a year</span><b>~{a.esg.co2Total} t</b></div><div><span>Capex to label B</span><b>{moneyShort(a.esg.upgradeCapexToB)}</b></div></div>
      <p className="fine-print">{a.esg.note} SFDR energy-inefficient share: {a.esg.sfdrInefficientShare}%.{!a.esg.unitLevel && ' Label per unit opens with the rent roll.'}</p></section>

    <section className="an-block"><p className="eyebrow">05 · DUE-DILIGENCE FLAGS</p><h3>What to check first.</h3>
      <ul className="flags">{a.flags.map((f: any) => <li key={f.title} className={`flag ${f.level}`}><span className="lvl">{LEVEL[f.level]}</span><div><b>{f.title}</b><p>{f.detail}</p><small>Source: {f.source}</small></div></li>)}</ul>
      <p className="fine-print">Generated from the property file{deep ? ' and the rent roll' : ''}. Production adds document AI that reads leases, valuation reports, VvE minutes and MJOPs in the data room.</p></section>
  </div>;
}

const STATE: Record<string, string> = { done: '✓', current: '●', next: '' };
export async function ProcessTab({ l, me }: { l: any; me: Me }) {
  const r = await api(`/listings/${l.slug}/process`); if (!r.ok) return <p className="form-error">{r.data?.message}</p>;
  const p = r.data; const u = me.user; const bidOpen = ['indicative', 'final'].includes(p.stageKey) && (p.stageKey !== 'final' || p.shortlisted) && !u?.staff;
  return <div className="deal-process">
    <p className="eyebrow">STRUCTURED SALE PROCESS · {p.advisor?.toUpperCase()}</p><h2>{p.stageLabel}.</h2>
    {p.nextDeadline && <p className="lead-copy small">Next deadline: <b>{p.nextDeadline.label}</b>, {date(p.nextDeadline.at)}. Minimum ticket {money(p.minTicket)}. {p.bidsReceived.indicative} indicative bid{p.bidsReceived.indicative === 1 ? '' : 's'} received{p.bidsReceived.final ? `, ${p.bidsReceived.final} final` : ''}.</p>}
    <ol className="stage-line">{p.stagesList.map((s: any) => <li key={s.key} className={s.state}><span>{STATE[s.state]}</span><b>{s.label}</b>{s.deadline && <small>{date(s.deadline)}</small>}</li>)}</ol>
    {p.shortlisted && <div className="note">You are on the shortlist: management presentations, site visits and the vendor due-diligence reports are open to you.</div>}
    {!p.nda && !u?.staff ? <div className="access-gate"><Shield /><h3>Sign the deal-room NDA.</h3><p>Opens the information memorandum, the full data room, the Q&A log and bidding. NDA v1.2 (NL/EN): confidentiality, non-circumvention and no contact with tenants, staff or the vendor.</p>
      <ActionForm action={`/api/listings/${l.slug}/nda`} bools={['accept']} className="nda-form" success="NDA signed. The deal room is open." submitLabel="Sign NDA ↗"><label>Full name of the authorised signatory<input name="signedName" required minLength={2} defaultValue={u?.name} /></label><label className="check-label"><input type="checkbox" name="accept" required /><span>I accept this NDA on behalf of {u?.companyName || 'my organisation'}.</span></label></ActionForm></div>
      : <>
        {p.myBids.length > 0 && <div className="panel"><p className="eyebrow">YOUR BIDS</p>{p.myBids.map((b: any) => <div key={b.id} className="saved-brief"><span><b>{money(b.amount)}</b> · {b.status} · {b.financingType} · {b.conditions.join(', ')}</span><small>{date(b.at)}</small></div>)}</div>}
        {bidOpen && <details className="side-form" open={!p.myBids.length}><summary className="btn navy">{p.myBids.some((b: any) => b.status === (p.stageKey === 'final' ? 'final' : 'indicative')) ? 'Update your bid' : p.stageKey === 'final' ? 'Submit a final binding bid' : 'Submit an indicative bid'} ↗</summary>
          <ActionForm action={`/api/listings/${l.slug}/process/bids`} bools={['acceptRules']} numbers={['amount']} className="panel" success="Bid received. It stays confidential." submitLabel="Submit bid ↗">
            <div className="form-grid"><label>Bid amount k.k. (€)<input name="amount" type="number" min={p.minTicket} step={100000} required defaultValue={Math.round(l.askingPrice * 0.97 / 1e5) * 1e5} /></label><label>Financing<select name="financingType"><option>Cash</option><option>Mixed</option><option>Debt-financed</option></select></label><label>Structure<select name="structure"><option>Share deal</option><option>Asset deal</option><option>Either</option></select></label><label>Key conditions<input name="conditions" maxLength={400} placeholder="e.g. confirmatory DD, IC approval" /></label></div>
            <label>Cover note<textarea name="message" maxLength={2000} placeholder="Your organisation, track record and timing" /></label>
            <label className="check-label"><input type="checkbox" name="acceptRules" required /><span>I accept the process letter. {p.stageKey === 'final' ? 'This bid is binding subject to the SPA.' : 'Indicative bids are non-binding.'}</span></label></ActionForm></details>}
        <div className="qa"><div className="row between wrap"><div><p className="eyebrow">Q&A LOG · ANONYMISED</p><h3>{p.qa.length} question{p.qa.length === 1 ? '' : 's'}.</h3></div></div>
          {p.qa.map((q: any) => <details key={q.id} className="qa-item" open={!q.answer}><summary><span className="pill">{q.category}</span><b>{q.question}</b>{q.mine && <small>Your question</small>}</summary>{q.answer ? <p>{q.answer}<small>Answered {date(q.answeredAt)}</small></p> : <p className="muted-small">Waiting for the vendor’s answer.</p>}</details>)}
          {!u?.staff && <ActionForm action={`/api/listings/${l.slug}/qa`} className="panel qa-ask" success="Question submitted. Answers are shared with all parties, without your name." submitLabel="Submit question ↗"><div className="form-grid"><label>Category<select name="category">{['Financial', 'Legal', 'Technical', 'Tax', 'Process', 'General'].map(c => <option key={c}>{c}</option>)}</select></label></div><label>Question<textarea name="question" required minLength={10} maxLength={1500} /></label></ActionForm>}</div>
      </>}
  </div>;
}
