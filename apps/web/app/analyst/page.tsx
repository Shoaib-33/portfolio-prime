import Link from 'next/link';
import { api, getMe } from '@/lib/api';
import { Analyst } from '@/components/analyst';

export const metadata = { title: 'AI investment analyst for Dutch real estate | Portfolio & Prime', description: 'Ask about Dutch residential yields, rent regulation (WWS), transfer tax, ESG and specific portfolios. Answers come from live platform data, with sources.', alternates: { canonical: '/analyst' } };

const CAN: [string, string][] = [['Market questions', 'City yields and prices, transfer tax, the WWS points system and how institutional sales run.'], ['Deal screening', '“Which portfolios fit a €300m mandate at 5% BAR?” ranks what your access level can see.'], ['Per-property analysis', 'Open a property and ask about risks, valuation, rent-regulation exposure or a rate scenario.'], ['Scenarios on demand', '“What if interest is 6% and the exit yield 5.5%?” runs the platform DCF, not a guess.']];

export default async function AnalystPage() {
  const [me, st] = await Promise.all([getMe(), api('/ai/status')]); const u = me.user;
  return <>
    <section className="page-heading"><p className="eyebrow">AI INVESTMENT ANALYST</p><h1>Ask it what your<br /><em>committee will ask.</em></h1><p>An analyst for Dutch residential real estate that answers from live platform data: listings you can access, rent rolls after the NDA, market benchmarks and the config table. Every answer lists its sources. It analyses; it never tells you to buy.</p></section>
    <section className="section analyst-layout"><div>{u ? <Analyst mode={st.data?.mode} suggestions={['Which portfolio has the highest yield?', 'I want to deploy €500m. What fits?', 'Explain the WWS points system', 'What does it cost to buy as an investor?']} /> : <div className="access-gate"><h2>Join free to ask.</h2><p>The analyst is free for members. Verified investors get unit-level answers after the property NDA.</p><Link className="btn navy" href="/login?next=/analyst">Join free ↗</Link></div>}</div>
      <aside className="analyst-side">{CAN.map(([h, t]) => <div key={h}><b>{h}</b><p>{t}</p></div>)}<div><b>How it stays reliable</b><p>{st.data?.mode === 'claude' ? `Claude (${st.data.model}) reads only the data your access level allows and runs scenarios through the platform’s calculators.` : 'The built-in analyst engine answers from the same data and calculators. Connect Claude (ANTHROPIC_API_KEY) for free-form questions in any language.'}</p></div></aside></section>
  </>;
}
