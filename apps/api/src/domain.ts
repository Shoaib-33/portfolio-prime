/* Pure business rules. No database access here, so they are easy to test (plan: 100% branch coverage on calculators and access rules). */
export type Tier = 'visitor' | 'free' | 'verified' | 'pro';
export interface Viewer { id?: string; role?: string; verified?: boolean; pro?: boolean; twofaEnabled?: boolean; investorType?: string }
export const STAFF_ROLES = ['admin', 'acquisition', 'sales', 'compliance', 'editor', 'readonly'];
export const isStaff = (v?: Viewer | null) => !!v && STAFF_ROLES.includes(v.role || '');
export function tierOf(v?: Viewer | null): Tier { if (!v?.id) return 'visitor'; if (v.pro && v.verified) return 'pro'; if (v.verified) return 'verified'; return 'free'; }
export const TIER_LABEL: Record<Tier, string> = { visitor: 'Visitor', free: 'Free member', verified: 'Verified investor', pro: 'Investor Pro' };
export const alertFrequency = (v?: Viewer | null) => ({ visitor: null, free: 'weekly', verified: 'daily', pro: 'instant' } as const)[tierOf(v)];
export const canDetails = (v?: Viewer | null) => tierOf(v) !== 'visitor' || isStaff(v);
export const canOffer = (v?: Viewer | null) => !!v?.verified;

/* Qualified (institutional) investors: verified funds, family offices, pension funds and insurers (KYB + proof of funds). */
export const INSTITUTIONAL_TYPES = ['Fund', 'Family office', 'Pension fund', 'Insurer', 'Institutional investor'];
export const isQualified = (v?: Viewer | null) => isStaff(v) || (!!v?.verified && INSTITUTIONAL_TYPES.includes(v.investorType || ''));

/** Off-market visibility: Pro first, verified investors after the early-access window, everyone else locked.
    Institutional deals (private deal rooms) open to qualified investors only. */
export function offMarketState(dealType: string, proUntil: Date | string | null, v?: Viewer | null, now = Date.now()): 'open' | 'pro-window' | 'locked' {
  if (dealType === 'institutional') return isQualified(v) ? 'open' : 'locked';
  if (dealType !== 'off_market' || isStaff(v)) return 'open';
  const t = tierOf(v);
  if (t === 'pro') return 'open';
  if (t === 'verified') return proUntil && now >= new Date(proUntil).getTime() ? 'open' : 'pro-window';
  return 'locked';
}

export function priceBand(price: number, onRequest = false): string {
  if (onRequest) return 'Price on request';
  const step = price < 2e6 ? 250000 : price < 5e7 ? 500000 : 5e7; const lo = Math.floor(price / step) * step;
  const f = (x: number) => String(+(x / 1e6).toFixed(2));
  return `€${f(lo)}–${f(lo + step)}m`;
}

/* ---------- Config table (plan: TaxRate / Config, never hard-coded) ---------- */
export type ConfigMap = Record<string, number>;
export const CONFIG_DEFAULTS: { key: string; label: string; value: number; unit: string; validFrom: string }[] = [
  { key: 'transfer_tax_residential_investor', label: 'Transfer tax · residential, investor', value: 8, unit: '%', validFrom: '2026-01-01' },
  { key: 'transfer_tax_own_home', label: 'Transfer tax · own main residence', value: 2, unit: '%', validFrom: '2026-01-01' },
  { key: 'transfer_tax_commercial', label: 'Transfer tax · commercial property', value: 10.4, unit: '%', validFrom: '2026-01-01' },
  { key: 'other_acquisition_costs', label: 'Notary, valuation and financing fees', value: 1, unit: '%', validFrom: '2026-01-01' },
  { key: 'buyer_fee', label: 'Buyer’s fee on own stock (open question in plan)', value: 0, unit: '%', validFrom: '2026-01-01' },
  { key: 'pro_price_month', label: 'Investor Pro · monthly', value: 99, unit: '€', validFrom: '2026-01-01' },
  { key: 'pro_price_year', label: 'Investor Pro · yearly', value: 990, unit: '€', validFrom: '2026-01-01' },
  { key: 'source_of_funds_threshold', label: 'Source-of-funds check above', value: 1000000, unit: '€', validFrom: '2026-01-01' },
  { key: 'wws_social_points', label: 'WWS · social rent up to (points)', value: 143, unit: 'pts', validFrom: '2026-07-01' },
  { key: 'wws_mid_points', label: 'WWS · mid rent up to (points)', value: 186, unit: 'pts', validFrom: '2026-07-01' },
  { key: 'wws_rent_per_point', label: 'WWS · maximum rent per point (approx.)', value: 6.4, unit: '€', validFrom: '2026-07-01' },
  { key: 'institutional_min_ticket', label: 'Private deal room · minimum ticket', value: 25000000, unit: '€', validFrom: '2026-01-01' },
];
export const cfg = (c: ConfigMap, key: string) => (c && c[key] !== undefined ? Number(c[key]) : CONFIG_DEFAULTS.find(x => x.key === key)?.value ?? 0);

/* ---------- Underwriting (plan section 5) ---------- */
export function acquisition(price: number, c: ConfigMap, opts: { ownHome?: boolean; homes?: boolean } = {}) {
  const taxRate = opts.ownHome && opts.homes ? cfg(c, 'transfer_tax_own_home') : cfg(c, 'transfer_tax_residential_investor');
  const tax = Math.round(price * taxRate / 100), other = Math.round(price * cfg(c, 'other_acquisition_costs') / 100), fee = Math.round(price * cfg(c, 'buyer_fee') / 100);
  return { taxRate, tax, other, fee, total: price + tax + other + fee };
}
export function figures(l: { askingPrice: number; grossRentAnnual: number; operatingCostsAnnual?: number | null; areaM2: number; unitsCount: number }, c: ConfigMap) {
  const a = acquisition(l.askingPrice, c); const rent = l.grossRentAnnual || 0; const opex = l.operatingCostsAnnual ?? rent * 0.22;
  return { bar: rent ? rent / l.askingPrice * 100 : 0, nar: rent ? (rent - opex) / a.total * 100 : 0, perM2: l.askingPrice / l.areaM2, perUnit: l.askingPrice / Math.max(1, l.unitsCount), grm: rent ? l.askingPrice / rent : 0, opex, acquisition: a };
}
export function finance(price: number, rent: number, { ltv = 60, interest = 4, expense = 22, vacancy = 3, costs = 9 } = {}) {
  const loan = price * ltv / 100, equity = price - loan + price * costs / 100, net = rent * (1 - vacancy / 100) * (1 - expense / 100), debt = loan * interest / 100, cash = net - debt;
  return { loan, equity, net, debt, cash, coc: equity ? cash / equity * 100 : 0, dscr: debt ? net / debt : 0 };
}
export const maxPrice = (equity: number, ltv: number) => Math.floor(equity / (1 - ltv / 100 + 0.09));

export const LABEL_SCORE: Record<string, number> = { A: 95, B: 85, C: 70, D: 55, E: 40, F: 30, G: 20 };
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
export function dealScore(l: { askingPrice: number; grossRentAnnual: number; energyLabel: string; demand?: number; occupancy?: number | null; plotM2?: number | null; areaM2: number; buildYear: number }) {
  const income = !!l.grossRentAnnual; const y = income ? l.grossRentAnnual / l.askingPrice * 100 : 0;
  const parts: [string, number][] = [
    [income ? 'Rental yield' : 'Space & setting', income ? clamp((y - 3.5) / 3 * 100) : clamp(45 + Math.min((l.plotM2 || 0) / 1500, 1) * 30 + Math.min(l.areaM2 / 400, 1) * 20)],
    ['Energy performance', LABEL_SCORE[l.energyLabel] ?? 50],
    ['Buyer demand', clamp(25 + (l.demand || 0) * 5)],
    [income ? 'Income stability' : 'Building condition', income ? clamp(l.occupancy ?? 80) : clamp(l.buildYear >= 2000 ? 85 : l.buildYear >= 1950 ? 72 : 62)]];
  const w = [0.35, 0.2, 0.2, 0.25];
  const total = clamp(parts.reduce((a, [, v], i) => a + v * w[i], 0));
  return { total, band: total >= 75 ? 'Strong' : total >= 60 ? 'Good' : 'Fair', parts };
}

/* ---------- CRM, compliance ---------- */
export function leadScore(e: { kind: string; amount?: number | null; message?: string | null; units?: number[] }, verified: boolean, askingPrice?: number) {
  let v = ({ offer: 50, bid: 55, viewing: 35, question: 20 } as Record<string, number>)[e.kind] ?? 15;
  if (verified) v += 15;
  if (e.amount && askingPrice && e.amount >= askingPrice * 0.95) v += 20; else if (e.amount) v += 8;
  if (e.units?.length) v += 5; if ((e.message || '').length > 80) v += 5;
  v = clamp(v); return { value: v, band: v >= 70 ? 'Hot' : v >= 45 ? 'Warm' : 'Cold' };
}
export function kycRisk({ investorType = 'Private person', country = 'NL', ticket = 0, pep = false }: { investorType?: string; country?: string; ticket?: number; pep?: boolean }) {
  let v = 0; if (!['NL', 'BE', 'DE', 'FR', 'LU'].includes(country)) v += 2; if (['Fund', 'Family office'].includes(investorType)) v += 1; if (Number(ticket) > 5e6) v += 1; if (pep) v += 3;
  return v >= 4 ? 'high' : v >= 2 ? 'medium' : 'low';
}
export const DEAL_STAGES = ['Offer accepted', 'LOI signed', 'Purchase agreement signed', 'Cooling-off period (3 days, private buyers)', 'Deposit paid to notary', 'Due diligence & conditions lapse', 'Notary transfer'];
export const LEAD_STAGES = ['new', 'contacted', 'valuation', 'offer_made', 'under_contract', 'acquired', 'lost'];
export const LISTING_STATUSES = ['draft', 'coming_soon', 'available', 'under_offer', 'sold_stc', 'sold', 'withdrawn'];
export const DEAL_TYPES = ['direct', 'portfolio', 'bid_round', 'off_market', 'institutional'];

/** Simulated BAG response. Production: BAG API Individuele Bevragingen v2 behind the same adapter. */
export function bagLookup(postcode: string, number: string) {
  const pc = String(postcode || '').toUpperCase().replace(/\s/g, ''); if (!/^\d{4}[A-Z]{2}$/.test(pc) || !String(number || '').trim()) return null;
  const h = [...pc + number].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); const p2 = +pc.slice(0, 2);
  const city = p2 <= 11 ? 'Amsterdam' : p2 >= 25 && p2 <= 26 ? 'Den Haag' : p2 >= 30 && p2 <= 31 ? 'Rotterdam' : p2 === 35 ? 'Utrecht' : p2 === 56 ? 'Eindhoven' : 'Haarlem';
  const g = CITY_GEO[city];
  return { address: `Sample street ${number}`, postcode: `${pc.slice(0, 4)} ${pc.slice(4)}`, city, buildYear: 1900 + h % 118, areaM2: 420 + h % 1600, units: 4 + h % 30, use: 'woonfunctie', energyLabel: 'ABCDEF'[h % 6], lat: +(g.lat + ((h % 41) - 20) / 1000).toFixed(4), lng: +(g.lng + ((h >> 8) % 41 - 20) / 1000).toFixed(4), source: 'Simulated BAG response' };
}

/** Saved search / buy-box matching. */
export function matchesSearch(l: { city: string; category: string; askingPrice: number; grossRentAnnual: number; dealType: string; status: string }, f: any) {
  if (['under_offer', 'sold', 'sold_stc', 'draft', 'withdrawn'].includes(l.status)) return false;
  const bar = l.grossRentAnnual ? l.grossRentAnnual / l.askingPrice * 100 : 0;
  if (f.city && f.city !== 'all' && l.city !== f.city) return false;
  if (f.regions?.length && !f.regions.includes(l.city)) return false;
  if (f.category && f.category !== 'all' && l.category !== f.category) return false;
  if (f.types?.length && !f.types.includes(l.category)) return false;
  if (f.dealType && f.dealType !== 'all' && l.dealType !== f.dealType) return false;
  if (f.budget && l.askingPrice > Number(f.budget)) return false;
  if (f.ticketMax && l.askingPrice > Number(f.ticketMax)) return false;
  if (f.ticketMin && l.askingPrice < Number(f.ticketMin)) return false;
  if (f.minYield && bar < Number(f.minYield)) return false;
  if (f.targetBar && bar < Number(f.targetBar)) return false;
  return true;
}

/* ---------- TOTP (RFC 6238) without dependencies ---------- */
import { createHmac, randomBytes } from 'crypto';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf: Buffer) { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function unbase32(s: string) { let bits = ''; for (const c of s.replace(/=+$/, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes); }
export const newTotpSecret = () => base32(randomBytes(20));
export function totp(secret: string, at = Date.now(), step = 30) { const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / step))); const h = createHmac('sha1', unbase32(secret)).update(ctr).digest(); const o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); }
export const verifyTotp = (secret: string, code: string, at = Date.now()) => [-1, 0, 1].some(w => totp(secret, at + w * 30000) === String(code).trim());

/* ---------- Location: provinces, city centres, distance (map and radius search) ---------- */
export const CITY_GEO: Record<string, { province: string; lat: number; lng: number }> = {
  Amsterdam: { province: 'Noord-Holland', lat: 52.3728, lng: 4.8936 }, Haarlem: { province: 'Noord-Holland', lat: 52.3808, lng: 4.6368 },
  Rotterdam: { province: 'Zuid-Holland', lat: 51.9225, lng: 4.4792 }, 'Den Haag': { province: 'Zuid-Holland', lat: 52.0705, lng: 4.3007 }, Wassenaar: { province: 'Zuid-Holland', lat: 52.1428, lng: 4.4014 },
  Utrecht: { province: 'Utrecht', lat: 52.0907, lng: 5.1214 }, Eindhoven: { province: 'Noord-Brabant', lat: 51.4416, lng: 5.4697 },
};
export const PROVINCES = ['Drenthe', 'Flevoland', 'Friesland', 'Gelderland', 'Groningen', 'Limburg', 'Noord-Brabant', 'Noord-Holland', 'Overijssel', 'Utrecht', 'Zeeland', 'Zuid-Holland'];
export const provinceOf = (city: string) => CITY_GEO[city]?.province || null;
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => d * Math.PI / 180; const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
