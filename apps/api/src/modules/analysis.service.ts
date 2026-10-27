/* Builds the analysis pack for one listing, applying the same access rules as the rest of the API:
   - free members and up: valuation, comparables, property-level ESG and risk flags, scenarios;
   - verified investors with the property NDA (or staff): unit-level rent regulation, ESG and red flags from the rent roll.
   The AI analyst only ever sees this pack, so it can never reveal more than the viewer may see. */
import { eq } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { Viewer, canDetails, offMarketState, isStaff, acquisition } from '../domain';
import { getConfig } from '../common';
import { valuation, comparables, esg, ddFlags, rentRegulation, stressTests, scenario, UnitIn } from '../analytics';
import { getListing, hasNda, unitCounts } from './listings.service';

export async function unitAccess(db: DB, v: Viewer | null, listingId: string) { return isStaff(v) || (!!v?.verified && await hasNda(db, v.id, listingId)); }

export async function analysisPack(db: DB, slug: string, v: Viewer | null) {
  const x = await getListing(db, slug); if (!x || ['draft', 'withdrawn'].includes(x.l.status)) return { status: 404 as const };
  if (offMarketState(x.l.dealType, x.l.proEarlyAccessUntil, v) !== 'open') return { status: 403 as const, message: 'This deal is not open to you.' };
  if (!canDetails(v)) return { status: 401 as const, message: 'Join free to see the analysis.' };
  const { l, p } = x; const c = await getConfig(db); const n = (await unitCounts(db, [p.id]))[p.id] || 1;
  const deep = await unitAccess(db, v, l.id);
  const units: UnitIn[] = deep ? (await db.select().from(S.units).where(eq(S.units.propertyId, p.id))).map(u => ({ ref: u.ref, areaM2: u.areaM2, rentMonthly: u.rentMonthly, rentType: u.rentType, energyLabel: u.energyLabel, occupancy: u.occupancy })) : [];
  const reg = deep && l.grossRentAnnual ? rentRegulation(units, p, c) : null;
  const acq = acquisition(l.askingPrice, c); const costsPct = Math.round((acq.total / l.askingPrice - 1) * 1000) / 10;
  const base = { price: l.askingPrice, rent: l.grossRentAnnual, opexPct: l.grossRentAnnual ? Math.round((l.operatingCostsAnnual ?? l.grossRentAnnual * 0.22) / l.grossRentAnnual * 100) : 22, vacancy: 3, ltv: n >= 100 ? 40 : 55, interest: 4, rentGrowth: 2.5, years: 10, costsPct };
  return { status: 200 as const, l, p, unitsCount: n, deep,
    pack: {
      listing: { slug: l.slug, name: l.name, city: p.city, district: p.district, propertyType: p.propertyType, dealType: l.dealType, status: l.status, units: n, areaM2: p.areaM2, buildYear: p.buildYear, energyLabel: p.energyLabel, tenure: p.tenure,
        askingPrice: l.askingPrice, grossRentAnnual: l.grossRentAnnual, operatingCostsAnnual: l.operatingCostsAnnual, occupancy: l.occupancy, bar: l.grossRentAnnual ? Math.round(l.grossRentAnnual / l.askingPrice * 10000) / 100 : null, wozValue: p.wozValue },
      acquisition: acq,
      valuation: valuation(l, p, n), comparables: comparables(p, n), esg: esg(units, p), flags: ddFlags(l, p, units, reg), regulation: reg,
      scenarioBase: l.grossRentAnnual ? scenario(base) : null, stress: l.grossRentAnnual ? stressTests(base, reg ? reg.rentAfter : null) : [], scenarioInputs: base,
      access: deep ? 'unit-level (rent roll)' : 'property-level (verify and sign the NDA for the rent roll)',
    } };
}
export type Pack = Extract<Awaited<ReturnType<typeof analysisPack>>, { status: 200 }>['pack'];
