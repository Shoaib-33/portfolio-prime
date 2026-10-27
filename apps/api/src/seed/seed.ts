/* Seeds a fresh demo database. All people, companies and properties are fictional.
   Demo logins (password for all: Demo2026!): free@demo.nl, verified@demo.nl, pro@demo.nl, admin@demo.nl, compliance@demo.nl, sales@demo.nl, acquisition@demo.nl */
import { sql, eq } from 'drizzle-orm';
import { rmSync } from 'fs';
import { DB, schema as S, getDb, closeDb, DATA_DIR } from '../db/client';
import { hashPassword, saveFile } from '../common';
import { CONFIG_DEFAULTS, newTotpSecret } from '../domain';
import { samplePdf } from '../pdf';

export const DEMO_PASSWORD = 'Demo2026!';
const LISTINGS = [
  { slug: 'rotterdam-zuid', image: 'p1', name: 'A foothold in Rotterdam', nameNl: 'Een voet aan de grond in Rotterdam', city: 'Rotterdam', district: 'Zuid', address: 'Sample Maasstraat 40–48', postcode: '3072 AB', category: 'portfolios', propertyType: 'Residential portfolio', propertyTypeNl: 'Woningportefeuille', dealType: 'portfolio', price: 4260000, units: 24, area: 1788, rent: 255600, opex: 56200, woz: 4410000, label: 'C', year: 1936, tenure: 'Freehold (eigen grond)', occupancy: 96, demand: 12, status: 'available', days: 3, featured: true, lat: 51.9, lng: 4.49,
    description: 'An established residential portfolio across a connected Rotterdam neighbourhood. A considered opportunity for buyers looking for scale, an existing rental income and a long-term presence in the city.', descriptionNl: 'Een gevestigde woningportefeuille in een verbonden Rotterdamse wijk.', highlights: ['24 apartments across three buildings', 'Whole portfolio or selected units', 'Established residential neighbourhood'] },
  { slug: 'amsterdam-canal-house', image: 'r1', name: 'A piece of Amsterdam', nameNl: 'Een stukje Amsterdam', city: 'Amsterdam', district: 'Centrum', address: 'Sample Herengracht 312', postcode: '1016 BX', category: 'homes', propertyType: 'Historic canal house', propertyTypeNl: 'Historisch grachtenpand', dealType: 'direct', price: 4850000, units: 1, area: 312, plot: 160, rent: 0, opex: 0, woz: 4120000, label: 'D', year: 1665, tenure: 'Ground lease (erfpacht), canon prepaid to 2068', demand: 9, status: 'available', days: 22, featured: true, lat: 52.36, lng: 4.9,
    description: 'A characterful city home with a distinctly Amsterdam silhouette. Generous proportions, period details and outdoor space bring together the intimacy of a private residence and the energy of the city.', highlights: ['312 m² of living space', 'Historic character and a private garden', 'Viewings by appointment'] },
  { slug: 'utrecht-oost', image: 'p2', name: 'Room to grow in Utrecht', nameNl: 'Ruimte om te groeien in Utrecht', city: 'Utrecht', district: 'Oost', address: 'Sample Biltstraat 120', postcode: '3572 BK', category: 'buildings', propertyType: 'Apartment building', propertyTypeNl: 'Appartementencomplex', dealType: 'direct', price: 3180000, units: 12, area: 920, rent: 162180, opex: 34100, woz: 3260000, label: 'B', year: 1974, tenure: 'Freehold (eigen grond)', occupancy: 100, demand: 10, status: 'available', days: 5, featured: true, lat: 52.09, lng: 5.14,
    description: 'Twelve apartments in one of the Netherlands’ most connected cities. A manageable building for investors who value a clear property story, straightforward ownership and a detailed view of each unit.', highlights: ['12 apartments in one acquisition', 'Fully let in this sample rent roll', 'Individual unit breakdown available'] },
  { slug: 'eindhoven-collection', image: 'p3', name: 'The Eindhoven collection', nameNl: 'De Eindhoven-collectie', city: 'Eindhoven', district: 'Strijp', address: 'Sample Torenallee 20', postcode: '5617 BC', category: 'portfolios', propertyType: 'Residential portfolio', propertyTypeNl: 'Woningportefeuille', dealType: 'bid_round', price: 7240000, units: 38, area: 2690, rent: 456120, opex: 95800, woz: 7580000, label: 'A', year: 2008, tenure: 'Freehold (eigen grond)', occupancy: 97, demand: 14, status: 'available', days: 10, lat: 51.45, lng: 5.45,
    description: 'A larger residential holding in a city shaped by design and technology. Offered through a structured bid round with a fixed deadline and sealed bids.', highlights: ['38 residential units', 'Sealed bid round, closes 14 November', 'Whole portfolio'] },
  { slug: 'wassenaar-villa', image: 'r2', name: 'Space to slow down', nameNl: 'Ruimte om te vertragen', city: 'Wassenaar', district: 'Woodland setting', address: 'Sample Laan van Clingendael 7', postcode: '2242 AB', category: 'homes', propertyType: 'Detached villa', propertyTypeNl: 'Vrijstaande villa', dealType: 'off_market', price: 2950000, units: 1, area: 380, plot: 1450, rent: 0, opex: 0, woz: 2680000, label: 'C', year: 1934, tenure: 'Freehold (eigen grond)', demand: 6, status: 'available', days: 0, priceOnRequest: true, lat: 52.14, lng: 4.4,
    description: 'A spacious family residence in a green setting, offered off-market. Investor Pro members see it first; verified investors 48 hours later.', highlights: ['380 m² of living space', '1,450 m² plot', 'Off-market · private appointments'] },
  { slug: 'rotterdam-penthouse', image: 'r3', name: 'Above the everyday', nameNl: 'Boven het alledaagse', city: 'Rotterdam', district: 'Kop van Zuid', address: 'Sample Wilhelminakade 900', postcode: '3072 AP', category: 'homes', propertyType: 'Riverside penthouse', propertyTypeNl: 'Penthouse aan de rivier', dealType: 'direct', price: 1650000, units: 1, area: 168, plot: 70, rent: 0, opex: 0, woz: 1480000, label: 'A', year: 2009, tenure: 'Freehold (apartment right)', demand: 8, status: 'coming_soon', days: 1, priceOnRequest: true, lat: 51.91, lng: 4.49,
    description: 'An elevated city retreat with generous terrace space. A contemporary home for buyers drawn to light, open views and a well-connected Rotterdam address.', highlights: ['168 m² interior', '70 m² terrace', 'Two parking spaces in the sample specification'] },
  { slug: 'den-haag-building', image: 'p4', name: 'A classic city address', nameNl: 'Een klassiek stadsadres', city: 'Den Haag', district: 'Noord', address: 'Sample Laan van Meerdervoort 55', postcode: '2517 AB', category: 'buildings', propertyType: 'Apartment building', propertyTypeNl: 'Appartementencomplex', dealType: 'direct', price: 2380000, units: 9, area: 742, rent: 133280, opex: 30500, woz: 2450000, label: 'C', year: 1928, tenure: 'Ground lease (erfpacht), perpetual', occupancy: 100, demand: 5, status: 'under_offer', days: 36, lat: 52.09, lng: 4.31,
    description: 'A period residential building with an established rental profile. Currently under offer; save it or register interest in similar opportunities.', highlights: ['Nine residential units', 'Period architecture', 'Register interest in similar buildings'] },
];
const SOLD = [['Zwolle', 'Residential portfolio', 18, 3250000, 24, 'bid_round', 40], ['Haarlem', 'Apartment building', 10, 3150000, 31, 'direct', 70], ['Amersfoort', 'Residential portfolio', 26, 5300000, 19, 'off_market', 100], ['Delft', 'Mixed-use building', 6, 1700000, 27, 'direct', 130], ['Groningen', 'Room rental building', 14, 1250000, 16, 'off_market', 160]] as const;
const FOLDERS: [string, string[], boolean][] = [['Legal', ['Kadaster ownership extract', 'Deed of division (splitsingsakte)', 'Ground lease conditions'], false], ['Technical', ['Building inspection 2025', 'Asbestos inventory', 'Energy labels per unit', 'Floor plans'], true], ['Financial', ['Rent roll (tenant data redacted)', 'Lease agreements, sample of 6', 'Service-cost statement 2025'], false], ['Zoning', ['Omgevingsplan extract'], true]];

export async function seedIfEmpty(db: DB) {
  const n = Number((await db.select({ n: sql<number>`count(*)::int` }).from(S.users))[0].n); if (n > 0) return false;
  const now = Date.now(), day = 864e5;
  await db.insert(S.config).values(CONFIG_DEFAULTS.map(c => ({ key: c.key, label: c.label, value: c.value, unit: c.unit, validFrom: c.validFrom })));
  await db.insert(S.automationSettings).values(['scoring', 'followups', 'emails', 'matches', 'priceAlerts'].map(key => ({ key, enabled: true })));
  const pw = hashPassword(DEMO_PASSWORD);
  const mk = async (email: string, name: string, extra: Partial<typeof S.users.$inferInsert> = {}) => (await db.insert(S.users).values({ email, name, passwordHash: pw, ...extra }).returning())[0];
  for (const [role, name] of [['admin', 'Ada Admin'], ['compliance', 'Carla Compliance'], ['sales', 'Sanne de Wit'], ['acquisition', 'Mark Visser']]) await mk(`${role}@demo.nl`, name, { role, twofaEnabled: true, twofaSecret: newTotpSecret() });
  await mk('free@demo.nl', 'Femke Free', { investorType: 'Private person' });
  await mk('verified@demo.nl', 'Victor Verified', { investorType: 'Private BV', companyName: 'Victor Beheer BV', verified: true, twofaEnabled: true, twofaSecret: newTotpSecret(), accountManager: 'Sanne de Wit', leadScore: 55 });
  const pro = await mk('pro@demo.nl', 'Priya Pro', { investorType: 'Family office', companyName: 'Delta Holding BV', verified: true, pro: true, twofaEnabled: true, twofaSecret: newTotpSecret(), accountManager: 'Sanne de Wit', leadScore: 80 });
  await db.insert(S.subscriptions).values({ userId: pro.id, plan: 'year', method: 'iDEAL', molliePaymentId: 'tr_demo_seed', currentPeriodEnd: new Date(now + 300 * day) });
  const bidders = [];
  for (const [email, name, type, country, company] of [['hanseatic@demo.nl', 'Jonas Becker', 'Fund', 'DE', 'Hanseatic Wohnen GmbH'], ['alnoor@demo.nl', 'Omar Haddad', 'Family office', 'AE', 'Al Noor Capital'], ['jansen@demo.nl', 'Marieke Jansen', 'Private BV', 'NL', 'M. Jansen Beheer BV']]) bidders.push(await mk(email, name, { investorType: type, country, companyName: company, verified: true, leadScore: 60 }));
  const pendA = await mk('brightwater@demo.nl', 'Oliver Grant', { investorType: 'Fund', country: 'GB', companyName: 'Brightwater Estates Ltd' });
  const pendB = await mk('oranjewal@demo.nl', 'Sophie van Dijk', { investorType: 'Private BV', companyName: 'Oranjewal Capital BV' });
  const dummy = await samplePdf('Identity document (sample)', 'Uploaded for KYC review', ['Placeholder file for the demo compliance queue.']);
  await db.insert(S.kycCases).values([{ userId: pendA.id, risk: 'high', ticket: 8000000, kvk: null, uboName: 'Oliver Grant', idFileKey: await saveFile(db, dummy, 'id.pdf'), idFileName: 'passport.pdf', proofFileKey: await saveFile(db, dummy, 'pof.pdf'), proofFileName: 'bank-letter.pdf' }, { userId: pendB.id, risk: 'low', ticket: 2000000, kvk: '81234567', uboName: 'Sophie van Dijk', idFileKey: await saveFile(db, dummy, 'id.pdf'), idFileName: 'id-card.pdf', proofFileKey: await saveFile(db, dummy, 'pof.pdf'), proofFileName: 'financing-letter.pdf' }]);

  for (const x of LISTINGS as any[]) {
    const [p] = await db.insert(S.properties).values({ address: x.address, postcode: x.postcode, city: x.city, district: x.district, lat: x.lat, lng: x.lng, plotM2: x.plot || null, areaM2: x.area, buildYear: x.year, category: x.category, propertyType: x.propertyType, propertyTypeNl: x.propertyTypeNl, tenure: x.tenure, energyLabel: x.label, wozValue: x.woz, wozYear: 2026, image: x.image }).returning();
    const monthly = x.rent ? Math.floor(x.rent / x.units / 12) : 0;
    for (let i = 1; i <= x.units; i++) await db.insert(S.units).values({ propertyId: p.id, ref: String(i).padStart(2, '0'), areaM2: Math.floor(x.area / x.units), rentMonthly: monthly ? monthly + ((i * 37) % 120) - 60 : 0, rentType: !monthly ? 'none' : monthly < 880 ? 'social' : monthly < 1180 ? 'mid' : 'free', energyLabel: x.label, occupancy: x.occupancy && i === x.units && x.occupancy < 100 ? 'vacant' : x.rent ? 'let' : 'vacant' });
    const [l] = await db.insert(S.listings).values({ propertyId: p.id, slug: x.slug, name: x.name, nameNl: x.nameNl, description: x.description, descriptionNl: x.descriptionNl, highlights: x.highlights, status: x.status, dealType: x.dealType, askingPrice: x.price, priceOnRequest: !!x.priceOnRequest, grossRentAnnual: x.rent, operatingCostsAnnual: x.opex || null, occupancy: x.occupancy || null, demand: x.demand, featured: !!x.featured, publishedAt: new Date(now - x.days * day), proEarlyAccessUntil: x.dealType === 'off_market' ? new Date(now + 47 * 36e5) : null }).returning();
    for (const [folder, files, dl] of FOLDERS) for (const f of files) {
      const pdf = await samplePdf(f, `${x.name} · ${x.address}, ${x.postcode} ${x.city}`, [`This is a fictional ${f.toLowerCase()} for ${x.name}. In production the acquisition team uploads the real file here; tenant names and contact details are redacted before upload (AVG).`, `Property: ${x.propertyType}, ${x.area} m², built ${x.year}, energy label ${x.label}. Asking price €${x.price.toLocaleString('nl-NL')} k.k.`]);
      await db.insert(S.documents).values({ listingId: l.id, folder, filename: f + '.pdf', storageKey: await saveFile(db, pdf, f + '.pdf'), downloadAllowed: dl });
    }
    if (x.dealType === 'bid_round') {
      const [r] = await db.insert(S.bidRounds).values({ listingId: l.id, opensAt: new Date(now - 10 * day), closesAt: new Date('2026-11-14T12:00:00+01:00') < new Date(now + day) ? new Date(now + 14 * day) : new Date('2026-11-14T12:00:00+01:00'), minBid: 6900000 }).returning();
      const amounts = [7050000, 7310000, 6920000], conds = ['Subject to financing', 'No conditions', 'Subject to due diligence'];
      for (let i = 0; i < 3; i++) await db.insert(S.offers).values({ listingId: l.id, userId: bidders[i].id, bidRoundId: r.id, bidderLabel: bidders[i].companyName, amount: amounts[i], conditions: [conds[i]], status: 'sealed', proofFileKey: await saveFile(db, dummy, 'pof.pdf'), proofFileName: 'proof-of-funds.pdf', leadScore: 75, leadBand: 'Hot' });
    }
  }
  for (const [city, type, units, price, days, deal, ago] of SOLD) {
    const [p] = await db.insert(S.properties).values({ address: 'Sold property', postcode: '0000 AA', city, areaM2: units * 70, buildYear: 1960, category: 'portfolios', propertyType: type, tenure: 'Freehold (eigen grond)', energyLabel: 'C', image: 'p1' }).returning();
    for (let i = 1; i <= units; i++) await db.insert(S.units).values({ propertyId: p.id, ref: String(i), areaM2: 70 });
    await db.insert(S.listings).values({ propertyId: p.id, slug: `sold-${city.toLowerCase()}-${units}`, name: `${type}, ${city}`, description: 'Sold.', status: 'sold', dealType: deal, askingPrice: price, demand: days, publishedAt: new Date(now - ago * day) });
  }
  await db.insert(S.acquisitionLeads).values([
    { source: 'Website', address: 'Sample Broersvest 4, Schiedam', propertyType: 'Residential portfolio', units: 8, askingPrice: 1450000, estValue: 1380000, stage: 'new', contactName: 'Private owner (box 3 landlord)' },
    { source: 'Broker', address: 'Sample Velperweg 18, Arnhem', propertyType: 'Apartment building', units: 14, askingPrice: 2600000, estValue: 2450000, stage: 'contacted', ownerName: 'Mark Visser', contactName: 'Makelaar' },
    { source: 'Referral', address: 'Sample Rapenburg 9, Leiden', propertyType: 'Canal house', units: 1, askingPrice: 1900000, estValue: 1850000, stage: 'valuation', ownerName: 'Mark Visser' },
    { source: 'List · box 3 landlords', address: 'Sample Spoorlaan 2, Tilburg', propertyType: 'Residential portfolio', units: 6, askingPrice: 1100000, estValue: 1020000, stage: 'offer_made', ownerName: 'Mark Visser' },
    { source: 'Website', address: 'Sample Kleverparkweg 30, Haarlem', propertyType: 'Apartment building', units: 10, askingPrice: 3400000, estValue: 3250000, stage: 'under_contract', ownerName: 'Ada Admin' },
    { source: 'Broker', address: 'Sample Assendorperstraat 5, Zwolle', propertyType: 'Residential portfolio', units: 12, askingPrice: 2300000, estValue: 2250000, stage: 'acquired', ownerName: 'Mark Visser' }]);
  await db.insert(S.automationLog).values({ rule: 'system', text: 'Demo database created and seeded' });
  await seedMessages(db); await seedInstitutional(db);
  console.log('Seeded demo database. Demo password for all demo accounts: ' + DEMO_PASSWORD);
  return true;
}
if (require.main === module) {
  (async () => { if (process.argv.includes('--reset')) { rmSync(DATA_DIR, { recursive: true, force: true }); console.log('Removed old demo data.'); } const db = await getDb(); const done = await seedIfEmpty(db); if (!done) console.log('Database already has data. Use --reset to start over.'); await closeDb(); })();
}

/** Institutional layer: a qualified fund account, two private deal rooms with a structured sale process, Q&A and indicative bids.
    Idempotent, so it also upgrades databases seeded before this existed (the live demo). */
const STAGES: [string, string][] = [['teaser', 'Teaser & NDA'], ['im', 'Information memorandum'], ['indicative', 'Indicative bids'], ['shortlist', 'Shortlist & management presentations'], ['dataroom', 'Full data room & site visits'], ['final', 'Final binding bids'], ['signing', 'SPA signing & notary transfer']];
export async function seedInstitutional(db: DB) {
  await db.insert(S.config).values(CONFIG_DEFAULTS.map(c => ({ key: c.key, label: c.label, value: c.value, unit: c.unit, validFrom: c.validFrom }))).onConflictDoNothing();
  if ((await db.select().from(S.listings).where(eq(S.listings.slug, 'project-tulip')))[0]) return;
  const now = Date.now(), day = 864e5; const iso = (d: number) => new Date(now + d * day).toISOString();
  let [fund] = await db.select().from(S.users).where(eq(S.users.email, 'fund@demo.nl'));
  if (!fund) fund = (await db.insert(S.users).values({ email: 'fund@demo.nl', name: 'Ingrid Lund', passwordHash: hashPassword(DEMO_PASSWORD), investorType: 'Pension fund', country: 'DK', companyName: 'Nordhavn Pension Partners', verified: true, twofaEnabled: true, twofaSecret: newTotpSecret(), accountManager: 'Sanne de Wit', leadScore: 85 }).returning())[0];
  await db.insert(S.buyBoxes).values({ userId: fund.id, regions: ['Amsterdam', 'Utrecht', 'Rotterdam'], types: ['portfolios', 'buildings'], ticketMin: 25000000, ticketMax: 400000000, targetBar: 4.8, financing: 'cash', strategy: 'Buy-to-let' }).onConflictDoNothing();
  const DEALS = [
    { slug: 'project-tulip', name: 'Project Tulip', nameNl: 'Project Tulp', image: 'p2', city: 'Utrecht', district: 'Randstad · 6 cities', address: '42 residential complexes (addresses in the IM)', postcode: 'Multiple', propertyType: 'Institutional residential portfolio', propertyTypeNl: 'Institutionele woningportefeuille', category: 'portfolios', units: 860, year: 1998, label: 'B', tenure: 'Mostly freehold (82%), remainder ground lease (erfpacht)', occupancy: 98, bar: 5.35, wozF: 1.04, status: 'available', stage: 2, lat: 52.0907, lng: 5.1214, mix: 'existing',
      description: 'A stabilised residential portfolio of 860 rental homes in 42 complexes across Amsterdam, Utrecht, Rotterdam, Den Haag, Haarlem and Amersfoort. Sold as one portfolio through a structured two-round process, with vendor due diligence available to shortlisted parties.', descriptionNl: 'Een gestabiliseerde woningportefeuille van 860 huurwoningen in 42 complexen in de Randstad, verkocht via een gestructureerd biedproces in twee rondes.',
      highlights: ['860 rental homes in 42 complexes, 6 Randstad cities', '98% occupancy · 40% free-sector, 40% mid-rent, 20% social', 'Two-round process · vendor due diligence for the shortlist'], advisor: 'Portfolio & Prime Capital Markets' },
    { slug: 'project-delta', name: 'Project Delta', nameNl: 'Project Delta', image: 'p4', city: 'Rotterdam', district: 'Merwe-Vierhavens (M4H)', address: 'Build-to-rent scheme (plot details in the IM)', postcode: 'Multiple', propertyType: 'Build-to-rent · forward funding', propertyTypeNl: 'Nieuwbouw huur · forward funding', category: 'buildings', units: 312, year: 2028, label: 'A', tenure: 'Freehold (eigen grond)', occupancy: null, bar: 5.0, wozF: 0.95, status: 'available', stage: 1, lat: 51.9055, lng: 4.4421, mix: 'new',
      description: 'Forward funding of a 312-home build-to-rent scheme in Rotterdam’s M4H district, delivered turnkey in Q3 2028 with BENG/NZEB performance. Fixed price, developer completion guarantee and a 24-month rent guarantee on the lease-up.', descriptionNl: 'Forward funding van een nieuwbouwproject met 312 huurwoningen in Rotterdam M4H, turnkey oplevering Q3 2028.',
      highlights: ['312 new rental homes, energy label A (NZEB)', 'Turnkey delivery Q3 2028, fixed price', '24-month rent guarantee during lease-up'], advisor: 'Portfolio & Prime Capital Markets' },
  ];
  const bidders = await db.select().from(S.users).where(sql`${S.users.email} in ('hanseatic@demo.nl','alnoor@demo.nl')`);
  const pro = (await db.select().from(S.users).where(eq(S.users.email, 'pro@demo.nl')))[0];
  for (const x of DEALS) {
    const unitRows: any[] = []; let rent = 0, area = 0;
    for (let i = 1; i <= x.units; i++) {
      const a = x.mix === 'new' ? 45 + (i * 29) % 41 : 48 + (i * 37) % 55; const k = i % 10;
      const label = x.mix === 'new' ? 'A' : 'AAAAAABBBBBBCCCCDDEF'[i % 20];
      const type = x.mix === 'new' ? (k < 6 ? 'mid' : 'free') : k < 2 ? 'social' : k < 6 ? 'mid' : 'free';
      const m = type === 'social' ? 760 + (i * 13) % 140 : type === 'mid' ? 1040 + (i * 17) % 230 : 1380 + (i * 23) % 560;
      const vacant = x.mix === 'existing' && i % 50 === 0; if (!vacant) rent += m * 12; area += a;
      unitRows.push({ ref: String(i).padStart(3, '0'), areaM2: a, rentMonthly: m, rentType: type, energyLabel: label, occupancy: vacant ? 'vacant' : 'let' });
    }
    const price = Math.round(rent / (x.bar / 100) / 5e5) * 5e5;
    const [p] = await db.insert(S.properties).values({ address: x.address, postcode: x.postcode, city: x.city, district: x.district, lat: x.lat, lng: x.lng, areaM2: area, buildYear: x.year, category: x.category, propertyType: x.propertyType, propertyTypeNl: x.propertyTypeNl, tenure: x.tenure, energyLabel: x.label, wozValue: Math.round(price * x.wozF), wozYear: 2026, image: x.image }).returning();
    for (let i = 0; i < unitRows.length; i += 200) await db.insert(S.units).values(unitRows.slice(i, i + 200).map(u => ({ ...u, propertyId: p.id })));
    const [l] = await db.insert(S.listings).values({ propertyId: p.id, slug: x.slug, name: x.name, nameNl: x.nameNl, description: x.description, descriptionNl: x.descriptionNl, highlights: x.highlights, status: x.status, dealType: 'institutional', askingPrice: price, grossRentAnnual: rent, operatingCostsAnnual: Math.round(rent * (x.mix === 'new' ? 0.19 : 0.23)), occupancy: x.occupancy, demand: 14, featured: false, publishedAt: new Date(now - (x.mix === 'new' ? 4 : 12) * day) }).returning();
    for (const [folder, files, dl] of [...FOLDERS, ['Process', ['Information memorandum', 'Process letter', 'Draft share purchase agreement'], false] as [string, string[], boolean]]) for (const f of files) {
      const pdf = await samplePdf(f, `${x.name} · ${x.propertyType}`, [`Fictional ${f.toLowerCase()} for ${x.name}: ${x.units} homes, ${x.district}. In production the capital-markets team uploads the real file; tenant data is redacted (AVG).`, `Guide price €${price.toLocaleString('nl-NL')} k.k. · gross rent €${rent.toLocaleString('nl-NL')} a year.`]);
      await db.insert(S.documents).values({ listingId: l.id, folder, filename: f + '.pdf', storageKey: await saveFile(db, pdf, f + '.pdf'), downloadAllowed: dl });
    }
    const deadlines: Record<string, number> = x.stage === 2 ? { indicative: 9, shortlist: 16, dataroom: 30, final: 44, signing: 70 } : { indicative: 21, shortlist: 28, dataroom: 42, final: 60, signing: 90 };
    await db.insert(S.saleProcesses).values({ listingId: l.id, stage: x.stage, minTicket: 25000000, advisor: x.advisor, stages: STAGES.map(([key, label]) => ({ key, label, deadline: deadlines[key] ? iso(deadlines[key]) : null })) });
    if (x.slug === 'project-tulip') {
      for (const [i, b] of bidders.entries()) {
        await db.insert(S.ndaSignatures).values({ userId: b.id, listingId: l.id, signedName: b.name, templateVersion: 'NDA v1.2 (NL/EN)', ip: 'seed' }).onConflictDoNothing();
        await db.insert(S.offers).values({ listingId: l.id, userId: b.id, bidderLabel: b.companyName, amount: Math.round(price * (i ? 0.965 : 0.985) / 1e5) * 1e5, conditions: ['Indicative bid', 'Subject to due diligence'], financingType: i ? 'Cash' : 'Mixed', status: 'indicative', message: 'Indicative, non-binding. Subject to IC approval and confirmatory due diligence.', leadScore: 80, leadBand: 'Hot' });
      }
      await db.insert(S.qaItems).values([
        { listingId: l.id, category: 'Financial', question: 'Can you split the rent roll by city and by regulation segment (social / mid / free)?', answer: 'Yes. The rent roll in the Financial folder now has a city column and a WWS segment column per unit. Summary: 20% social, 40% mid-rent, 40% free-sector.', answeredBy: 'Capital Markets team', answeredAt: new Date(now - 6 * day), createdAt: new Date(now - 7 * day) },
        { listingId: l.id, category: 'Legal', question: 'Which complexes are on ground lease, and when are the canon revisions?', answer: 'Seven complexes (18% of units), all Amsterdam. Five are converted to perpetual with canon fixed; two have revisions in 2031 and 2034. Details in Legal › Ground lease conditions.', answeredBy: 'Capital Markets team', answeredAt: new Date(now - 4 * day), createdAt: new Date(now - 5 * day) },
        { listingId: l.id, category: 'Technical', question: 'Is there a long-term maintenance plan (MJOP) per complex?', answer: 'Yes, MJOPs for all 42 complexes are in Technical › Building inspection 2025, with a 10-year capex total of €31.2m.', answeredBy: 'Capital Markets team', answeredAt: new Date(now - 3 * day), createdAt: new Date(now - 3 * day - 5 * 36e5) },
        { listingId: l.id, category: 'Process', question: 'Is the vendor open to a share deal instead of an asset deal?', answer: 'The vendor prefers a share deal (SPV with fiscal unity ending at closing). Asset-deal bids are accepted but will be compared on a net basis including transfer tax.', answeredBy: 'Capital Markets team', answeredAt: new Date(now - 2 * day), createdAt: new Date(now - 2 * day - 3 * 36e5) },
        ...(pro ? [{ listingId: l.id, userId: pro.id, category: 'Financial', question: 'What indexation was applied to the free-sector leases in 2025 and 2026?' }] : []),
      ]);
    }
  }
  await db.insert(S.automationLog).values({ rule: 'system', text: 'Private deal rooms added: Project Tulip, Project Delta' });
}

/** Sample conversation for the messaging demo. Also runs on databases seeded before messaging existed (only when there are no messages yet). */
export async function seedMessages(db: DB) {
  if ((await db.select({ n: sql<number>`count(*)::int` }).from(S.messages))[0].n > 0) return;
  const [inv] = await db.select().from(S.users).where(eq(S.users.email, 'verified@demo.nl')); const [am] = await db.select().from(S.users).where(eq(S.users.email, 'sales@demo.nl'));
  const [l] = await db.select().from(S.listings).where(eq(S.listings.slug, 'rotterdam-zuid')); if (!inv || !am || !l) return;
  const t = Date.now() - 26 * 36e5;
  await db.insert(S.messages).values([
    { investorId: inv.id, listingId: l.id, senderId: inv.id, body: 'Hello Sanne, are any of the 24 units in Rotterdam-Zuid due for a rent review in the next 12 months?', createdAt: new Date(t), readAt: new Date(t + 36e5) },
    { investorId: inv.id, listingId: l.id, senderId: am.id, fromStaff: true, body: 'Hi Victor, five leases index on 1 July and two mid-rent units can move to market rent after renovation. The rent roll in the data room (Financial folder) shows the dates per unit.', createdAt: new Date(t + 2 * 36e5), readAt: new Date(t + 3 * 36e5) },
    { investorId: inv.id, listingId: l.id, senderId: inv.id, body: 'Thank you. Could we schedule a viewing next week, ideally Tuesday morning?', createdAt: new Date(t + 20 * 36e5) },
  ]);
}
