'use client';
/* AI analyst chat and the live scenario / stress-test panel. Both call the API; nothing is calculated in the browser. */
import { useEffect, useRef, useState, FormEvent, ReactNode } from 'react';
import { money } from '@/lib/format';

type Msg = { role: 'user' | 'assistant'; text: string; sources?: { id: string; label: string }[]; followUps?: string[]; mode?: string; error?: boolean };
async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d?.message || `Request failed (${r.status})`); return d;
}

/** Minimal, safe markdown: "- " bullets, **bold**, _italic_, [S1] source chips. Everything is rendered as text nodes. */
function inline(s: string, key: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|_[^_]+_|\[S\d\])/g).filter(Boolean).map((p, i) =>
    p.startsWith('**') ? <b key={key + i}>{p.slice(2, -2)}</b> : /^_[^_]+_$/.test(p) ? <i key={key + i}>{p.slice(1, -1)}</i> : /^\[S\d\]$/.test(p) ? <sup key={key + i} className="src-chip">{p.slice(1, -1)}</sup> : p);
}
export function Md({ text }: { text: string }) {
  const out: ReactNode[] = []; let list: string[] = [];
  const flush = (k: number) => { if (list.length) { out.push(<ul key={'u' + k}>{list.map((l, i) => <li key={i}>{inline(l, `l${k}-${i}-`)}</li>)}</ul>); list = []; } };
  text.split('\n').forEach((line, k) => { if (line.startsWith('- ')) list.push(line.slice(2)); else { flush(k); if (line.trim()) out.push(<p key={'p' + k}>{inline(line, `p${k}-`)}</p>); } });
  flush(9999); return <>{out}</>;
}

export function Analyst({ slug, name, suggestions, mode }: { slug?: string; name?: string; suggestions: string[]; mode: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const end = useRef<HTMLDivElement>(null); const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs, busy]);
  async function ask(question: string) {
    if (!question.trim() || busy) return; const history = msgs.filter(m => !m.error).map(m => ({ role: m.role, text: m.text }));
    setMsgs(m => [...m, { role: 'user', text: question }]); setQ(''); setBusy(true);
    try { const a = await post('/api/ai/ask', { question, slug, history }); setMsgs(m => [...m, { role: 'assistant', text: a.answer, sources: a.sources, followUps: a.followUps, mode: a.mode }]); }
    catch (e: any) { setMsgs(m => [...m, { role: 'assistant', text: e.message, error: true }]); } finally { setBusy(false); }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); ask(q); };
  const last = [...msgs].reverse().find(m => m.role === 'assistant' && !m.error);
  return <div className="analyst">
    <div className="analyst-head"><span className="ai-mark" aria-hidden="true">AI</span><div><b>Investment analyst{name ? ` · ${name}` : ''}</b><small>{mode === 'claude' ? 'Claude · answers from platform data with sources' : 'Built-in analyst engine · answers from platform data with sources'}</small></div></div>
    <div className="analyst-log" aria-live="polite">
      {!msgs.length && <div className="analyst-empty"><p>Ask about returns, risks, rent regulation, ESG, valuation or a rate scenario. Every figure comes from the server’s calculators and cites its source.</p></div>}
      {msgs.map((m, i) => <div key={i} className={`bubble ${m.role} ${m.error ? 'err' : ''}`}>{m.role === 'user' ? <p>{m.text}</p> : <><Md text={m.text} />{m.sources && m.sources.length > 0 && <ol className="sources">{m.sources.map(s => <li key={s.id}><b>{s.id}</b> {s.label}</li>)}</ol>}</>}</div>)}
      {busy && <div className="bubble assistant typing"><span /><span /><span /></div>}<div ref={end} />
    </div>
    <div className="chips">{(last?.followUps || suggestions).map(s => <button key={s} type="button" className="chip-q" disabled={busy} onClick={() => ask(s)}>{s}</button>)}</div>
    <form className="analyst-form" onSubmit={submit}><label className="sr-only" htmlFor={`ai-q-${slug || 'general'}`}>Your question</label><textarea id={`ai-q-${slug || 'general'}`} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q); } }} rows={2} maxLength={1000} placeholder={slug ? 'e.g. What happens to the IRR at 6% interest and a 5.5% exit yield?' : 'e.g. Which portfolios fit a €300m mandate at 5% BAR?'} /><button className="btn navy" type="submit" disabled={busy || q.trim().length < 3}>Ask ↗</button></form>
    <p className="fine-print">AI analysis, not investment advice. Answers use only the data your access level allows; verify in the data room.</p>
  </div>;
}

const pc = (n?: number | null) => n === null || n === undefined ? '—' : n.toFixed(2) + '%';
export function StressTest({ slug, base }: { slug: string; base: any }) {
  const [v, setV] = useState({ interest: base.interest, ltv: base.ltv, vacancy: base.vacancy, rentGrowth: base.rentGrowth, exitYield: 0, years: base.years });
  const [r, setR] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(async () => { try { const { exitYield, ...rest } = v; setR(await post('/api/analysis/scenario', { slug, ...rest, ...(exitYield ? { exitYield } : {}) })); setErr(''); } catch (e: any) { setErr(e.message); } }, 200); return () => clearTimeout(t); }, [v, slug]);
  useEffect(() => { if (r && !v.exitYield) setV(x => ({ ...x, exitYield: r.scenario.inputs.exitYield })); }, [r]); // eslint-disable-line
  const fields: [keyof typeof v, string, number, number, number, string][] = [['interest', 'Interest rate', 0, 10, 0.1, '%'], ['ltv', 'Loan to value', 0, 75, 1, '%'], ['vacancy', 'Vacancy', 0, 20, 0.5, '%'], ['rentGrowth', 'Rent growth a year', -2, 6, 0.1, '%'], ['exitYield', 'Exit yield (NIY)', 2, 9, 0.05, '%'], ['years', 'Hold period', 3, 20, 1, ' yrs']];
  const s = r?.scenario; const max = s ? Math.max(1, ...s.cashFlows.map((x: number) => Math.abs(x))) : 1;
  return <div className="stress">
    <div className="finance-fields six">{fields.map(([k, l, min, max, step, u]) => <label key={k}>{l}<span><output>{Number(v[k]).toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0)}{u}</output></span><input type="range" min={min} max={max} step={step} value={v[k]} onChange={e => setV({ ...v, [k]: Number(e.target.value) })} /></label>)}</div>
    {err ? <p className="form-error">{err}</p> : s && <>
      <div className="finance-output four"><div><span>Levered IRR</span><b>{pc(s.leveredIrr)}</b></div><div><span>Unlevered IRR</span><b>{pc(s.unleveredIrr)}</b></div><div><span>Equity multiple</span><b>{s.equityMultiple ?? '—'}x</b></div><div><span>DSCR year 1</span><b className={s.dscr !== null && s.dscr < 1.2 ? 'warn' : ''}>{s.dscr ?? '—'}</b></div></div>
      <div className="cf-chart" aria-label="Annual cash flow after debt service">{s.cashFlows.map((c: number, i: number) => <div key={i} title={`Year ${i + 1}: ${money(c)}`}><i className={c < 0 ? 'neg' : ''} style={{ height: Math.max(2, Math.abs(c) / max * 100) + '%' }} /><span>{i + 1}</span></div>)}</div>
      <p className="muted-small">Cash flow after interest, years 1–{s.inputs.years} · equity {money(s.equity)} · exit value {money(s.exitValue)}</p>
      <div className="table-wrap" tabIndex={0}><table><thead><tr><th>Stress case</th><th>Levered IRR</th><th>Unlevered</th><th>DSCR</th><th>Multiple</th></tr></thead><tbody>{r.stress.map((x: any) => <tr key={x.name}><td><b>{x.name}</b><small>{x.detail}</small></td><td className={x.leveredIrr !== null && x.leveredIrr < 0 ? 'neg-text' : ''}>{pc(x.leveredIrr)}</td><td>{pc(x.unleveredIrr)}</td><td>{x.dscr ?? '—'}</td><td>{x.equityMultiple ?? '—'}x</td></tr>)}</tbody></table></div></>}
    <p className="fine-print">10-year DCF on the server (POST /api/analysis/scenario): interest-only debt, {base.costsPct}% acquisition costs from the config table, 1.5% selling costs. Indicative, not investment advice.</p>
  </div>;
}
