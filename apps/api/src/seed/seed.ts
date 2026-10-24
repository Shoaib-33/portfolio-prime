/* Seeds a fresh demo database. All people, companies and properties are fictional.
   Demo logins (password for all: Demo2026!): free@demo.nl, verified@demo.nl, pro@demo.nl, admin@demo.nl, compliance@demo.nl, sales@demo.nl, acquisition@demo.nl */
import { sql } from 'drizzle-orm';
import { rmSync } from 'fs';
import { DB, schema as S, getDb, closeDb, DATA_DIR, STORAGE_DIR } from '../db/client';
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
  await db.insert(S.kycCases).values([{ userId: pendA.id, risk: 'high', ticket: 8000000, kvk: null, uboName: 'Oliver Grant', idFileKey: saveFile(dummy, 'id.pdf'), idFileName: 'passport.pdf', proofFileKey: saveFile(dummy, 'pof.pdf'), proofFileName: 'bank-letter.pdf' }, { userId: pendB.id, risk: 'low', ticket: 2000000, kvk: '81234567', uboName: 'Sophie van Dijk', idFileKey: saveFile(dummy, 'id.pdf'), idFileName: 'id-card.pdf', proofFileKey: saveFile(dummy, 'pof.pdf'), proofFileName: 'financing-letter.pdf' }]);

  for (const x of LISTINGS as any[]) {
    const [p] = await db.insert(S.properties).values({ address: x.address, postcode: x.postcode, city: x.city, district: x.district, lat: x.lat, lng: x.lng, plotM2: x.plot || null, areaM2: x.area, buildYear: x.year, category: x.category, propertyType: x.propertyType, propertyTypeNl: x.propertyTypeNl, tenure: x.tenure, energyLabel: x.label, wozValue: x.woz, wozYear: 2026, image: x.image }).returning();
    const monthly = x.rent ? Math.floor(x.rent / x.units / 12) : 0;
    for (let i = 1; i <= x.units; i++) await db.insert(S.units).values({ propertyId: p.id, ref: String(i).padStart(2, '0'), areaM2: Math.floor(x.area / x.units), rentMonthly: monthly ? monthly + ((i * 37) % 120) - 60 : 0, rentType: !monthly ? 'none' : monthly < 880 ? 'social' : monthly < 1180 ? 'mid' : 'free', energyLabel: x.label, occupancy: x.occupancy && i === x.units && x.occupancy < 100 ? 'vacant' : x.rent ? 'let' : 'vacant' });
    const [l] = await db.insert(S.listings).values({ propertyId: p.id, slug: x.slug, name: x.name, nameNl: x.nameNl, description: x.description, descriptionNl: x.descriptionNl, highlights: x.highlights, status: x.status, dealType: x.dealType, askingPrice: x.price, priceOnRequest: !!x.priceOnRequest, grossRentAnnual: x.rent, operatingCostsAnnual: x.opex || null, occupancy: x.occupancy || null, demand: x.demand, featured: !!x.featured, publishedAt: new Date(now - x.days * day), proEarlyAccessUntil: x.dealType === 'off_market' ? new Date(now + 47 * 36e5) : null }).returning();
    for (const [folder, files, dl] of FOLDERS) for (const f of files) {
      const pdf = await samplePdf(f, `${x.name} · ${x.address}, ${x.postcode} ${x.city}`, [`This is a fictional ${f.toLowerCase()} for ${x.name}. In production the acquisition team uploads the real file here; tenant names and contact details are redacted before upload (AVG).`, `Property: ${x.propertyType}, ${x.area} m², built ${x.year}, energy label ${x.label}. Asking price €${x.price.toLocaleString('nl-NL')} k.k.`]);
      await db.insert(S.documents).values({ listingId: l.id, folder, filename: f + '.pdf', storageKey: saveFile(pdf, f + '.pdf'), downloadAllowed: dl });
    }
    if (x.dealType === 'bid_round') {
      const [r] = await db.insert(S.bidRounds).values({ listingId: l.id, opensAt: new Date(now - 10 * day), closesAt: new Date('2026-11-14T12:00:00+01:00') < new Date(now + day) ? new Date(now + 14 * day) : new Date('2026-11-14T12:00:00+01:00'), minBid: 6900000 }).returning();
      const amounts = [7050000, 7310000, 6920000], conds = ['Subject to financing', 'No conditions', 'Subject to due diligence'];
      for (let i = 0; i < 3; i++) await db.insert(S.offers).values({ listingId: l.id, userId: bidders[i].id, bidRoundId: r.id, bidderLabel: bidders[i].companyName, amount: amounts[i], conditions: [conds[i]], status: 'sealed', proofFileKey: saveFile(dummy, 'pof.pdf'), proofFileName: 'proof-of-funds.pdf', leadScore: 75, leadBand: 'Hot' });
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
  console.log('Seeded demo database. Demo password for all demo accounts: ' + DEMO_PASSWORD);
  return true;
}
if (require.main === module) {
  (async () => { if (process.argv.includes('--reset')) { rmSync(DATA_DIR, { recursive: true, force: true }); rmSync(STORAGE_DIR, { recursive: true, force: true }); console.log('Removed old demo data.'); } const db = await getDb(); const done = await seedIfEmpty(db); if (!done) console.log('Database already has data. Use --reset to start over.'); await closeDb(); })();
}
