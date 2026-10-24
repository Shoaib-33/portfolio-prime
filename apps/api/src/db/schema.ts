/* Data model from the plan (section "Data model"). Property/Unit (physical asset) are separate from Listing (commercial offer).
   Money is stored in whole euros. Personal-data tables carry deletedAt for AVG erasure. */
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, doublePrecision, primaryKey, serial, index, uniqueIndex } from 'drizzle-orm/pg-core';
const id = () => uuid('id').primaryKey().defaultRandom();
const created = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const users = pgTable('users', {
  id: id(), email: text('email').notNull(), passwordHash: text('password_hash').notNull(), name: text('name').notNull(),
  role: text('role').notNull().default('investor'), locale: text('locale').notNull().default('en'),
  investorType: text('investor_type').notNull().default('Private person'), country: text('country').notNull().default('NL'), companyName: text('company_name'),
  twofaSecret: text('twofa_secret'), twofaEnabled: boolean('twofa_enabled').notNull().default(false),
  verified: boolean('verified').notNull().default(false), pro: boolean('pro').notNull().default(false), leadScore: integer('lead_score').notNull().default(30),
  accountManager: text('account_manager'), status: text('status').notNull().default('active'),
  createdAt: created(), lastLoginAt: timestamp('last_login_at', { withTimezone: true }), deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, t => [uniqueIndex('users_email_idx').on(t.email)]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  twofaPassed: boolean('twofa_passed').notNull().default(false), createdAt: created(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const kycCases = pgTable('kyc_cases', {
  id: id(), userId: uuid('user_id').notNull().references(() => users.id), status: text('status').notNull().default('pending'),
  risk: text('risk').notNull(), pep: boolean('pep').notNull().default(false), ticket: integer('ticket'), kvk: text('kvk'), uboName: text('ubo_name'),
  idFileKey: text('id_file_key'), idFileName: text('id_file_name'), proofFileKey: text('proof_file_key'), proofFileName: text('proof_file_name'),
  sanctionsHit: boolean('sanctions_hit').notNull().default(false), reviewerId: uuid('reviewer_id'), notes: text('notes'),
  submittedAt: created(), decidedAt: timestamp('decided_at', { withTimezone: true }), nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
});

export const properties = pgTable('properties', {
  id: id(), bagPandId: text('bag_pand_id'), address: text('address').notNull(), postcode: text('postcode').notNull(), city: text('city').notNull(), district: text('district'),
  lat: doublePrecision('lat'), lng: doublePrecision('lng'), plotM2: integer('plot_m2'), areaM2: integer('area_m2').notNull(), buildYear: integer('build_year').notNull(),
  category: text('category').notNull(), propertyType: text('property_type').notNull(), propertyTypeNl: text('property_type_nl'), tenure: text('tenure').notNull(),
  energyLabel: text('energy_label').notNull(), wozValue: integer('woz_value'), wozYear: integer('woz_year'), image: text('image').notNull().default('p1'), createdAt: created(),
});
export const units = pgTable('units', {
  id: id(), propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }), ref: text('ref').notNull(),
  areaM2: integer('area_m2').notNull(), rentMonthly: integer('rent_monthly').notNull().default(0), rentType: text('rent_type').notNull().default('free'),
  energyLabel: text('energy_label'), occupancy: text('occupancy').notNull().default('let'),
});
export const listings = pgTable('listings', {
  id: id(), propertyId: uuid('property_id').notNull().references(() => properties.id), slug: text('slug').notNull(),
  name: text('name').notNull(), nameNl: text('name_nl'), description: text('description').notNull(), descriptionNl: text('description_nl'), highlights: jsonb('highlights').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('draft'), dealType: text('deal_type').notNull().default('direct'),
  askingPrice: integer('asking_price').notNull(), previousPrice: integer('previous_price'), priceType: text('price_type').notNull().default('k.k.'), priceOnRequest: boolean('price_on_request').notNull().default(false),
  grossRentAnnual: integer('gross_rent_annual').notNull().default(0), operatingCostsAnnual: integer('operating_costs_annual'), occupancy: integer('occupancy'),
  demand: integer('demand').notNull().default(5), featured: boolean('featured').notNull().default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }), proEarlyAccessUntil: timestamp('pro_early_access_until', { withTimezone: true }), createdAt: created(),
}, t => [uniqueIndex('listings_slug_idx').on(t.slug), index('listings_status_idx').on(t.status)]);

export const documents = pgTable('documents', {
  id: id(), listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }), folder: text('folder').notNull(), filename: text('filename').notNull(),
  storageKey: text('storage_key').notNull(), mime: text('mime').notNull().default('application/pdf'), version: integer('version').notNull().default(1),
  downloadAllowed: boolean('download_allowed').notNull().default(false), createdAt: created(),
});
export const ndaSignatures = pgTable('nda_signatures', {
  id: id(), userId: uuid('user_id').notNull().references(() => users.id), listingId: uuid('listing_id').notNull().references(() => listings.id),
  signedName: text('signed_name').notNull(), templateVersion: text('template_version').notNull(), method: text('method').notNull().default('clickwrap'),
  ip: text('ip'), userAgent: text('user_agent'), signedAt: created(),
}, t => [uniqueIndex('nda_user_listing_idx').on(t.userId, t.listingId)]);

export const auditEvents = pgTable('audit_events', {
  id: serial('id').primaryKey(), actorId: uuid('actor_id'), actorLabel: text('actor_label').notNull(), action: text('action').notNull(),
  objectType: text('object_type').notNull(), objectId: text('object_id'), meta: jsonb('meta').$type<Record<string, unknown>>().default({}), ip: text('ip'), at: created(),
});

export const bidRounds = pgTable('bid_rounds', {
  id: id(), listingId: uuid('listing_id').notNull().references(() => listings.id), opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
  closesAt: timestamp('closes_at', { withTimezone: true }).notNull(), minBid: integer('min_bid').notNull(), status: text('status').notNull().default('open'), winnerOfferId: uuid('winner_offer_id'),
});
export const offers = pgTable('offers', {
  id: id(), listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'restrict' }), userId: uuid('user_id').references(() => users.id),
  bidderLabel: text('bidder_label'), bidRoundId: uuid('bid_round_id').references(() => bidRounds.id), amount: integer('amount').notNull(),
  conditions: jsonb('conditions').$type<string[]>().notNull().default([]), financingType: text('financing_type'), transferDate: text('transfer_date'),
  units: jsonb('units').$type<number[]>().notNull().default([]), proofFileKey: text('proof_file_key'), proofFileName: text('proof_file_name'), message: text('message'),
  status: text('status').notNull().default('submitted'), counterAmount: integer('counter_amount'), leadScore: integer('lead_score'), leadBand: text('lead_band'),
  flagged: boolean('flagged').notNull().default(false), followupAt: timestamp('followup_at', { withTimezone: true }), createdAt: created(),
});
export const enquiries = pgTable('enquiries', {
  id: id(), listingId: uuid('listing_id').references(() => listings.id), userId: uuid('user_id').references(() => users.id), kind: text('kind').notNull(),
  name: text('name').notNull(), email: text('email').notNull(), preferredDate: text('preferred_date'), format: text('format'), message: text('message'),
  status: text('status').notNull().default('new'), leadScore: integer('lead_score'), leadBand: text('lead_band'), followupAt: timestamp('followup_at', { withTimezone: true }), createdAt: created(),
});
export const deals = pgTable('deals', {
  id: id(), listingId: uuid('listing_id').notNull().references(() => listings.id), offerId: uuid('offer_id').notNull().references(() => offers.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').references(() => users.id), price: integer('price').notNull(), stage: integer('stage').notNull().default(0), feeAmount: integer('fee_amount').notNull().default(0), createdAt: created(),
});

export const savedSearches = pgTable('saved_searches', { id: id(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), filters: jsonb('filters').$type<Record<string, unknown>>().notNull(), frequency: text('frequency').notNull(), createdAt: created() });
export const buyBoxes = pgTable('buy_boxes', { userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }), regions: jsonb('regions').$type<string[]>().notNull().default([]), types: jsonb('types').$type<string[]>().notNull().default([]), ticketMin: integer('ticket_min'), ticketMax: integer('ticket_max'), targetBar: doublePrecision('target_bar'), financing: text('financing'), strategy: text('strategy') });
export const favorites = pgTable('favorites', { userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }), createdAt: created() }, t => [primaryKey({ columns: [t.userId, t.listingId] })]);
export const notifications = pgTable('notifications', { id: id(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), type: text('type').notNull(), title: text('title').notNull(), body: text('body').notNull(), listingSlug: text('listing_slug'), channel: text('channel').notNull().default('in_app'), readAt: timestamp('read_at', { withTimezone: true }), createdAt: created() });
export const outbox = pgTable('outbox', { id: id(), toEmail: text('to_email').notNull(), subject: text('subject').notNull(), body: text('body').notNull(), kind: text('kind').notNull(), status: text('status').notNull().default('draft'), createdAt: created() });

export const acquisitionLeads = pgTable('acquisition_leads', {
  id: id(), source: text('source').notNull(), address: text('address').notNull(), postcode: text('postcode'), propertyType: text('property_type').notNull(), units: integer('units').notNull().default(1),
  askingPrice: integer('asking_price'), estValue: integer('est_value'), stage: text('stage').notNull().default('new'), ownerName: text('owner_name').default('Unassigned'),
  contactName: text('contact_name'), contactEmail: text('contact_email'), notes: text('notes'), lostReason: text('lost_reason'), createdAt: created(),
});
export const config = pgTable('config', { key: text('key').primaryKey(), label: text('label').notNull(), value: doublePrecision('value').notNull(), unit: text('unit').notNull(), validFrom: text('valid_from').notNull() });
export const automationSettings = pgTable('automation_settings', { key: text('key').primaryKey(), enabled: boolean('enabled').notNull().default(true) });
export const automationLog = pgTable('automation_log', { id: serial('id').primaryKey(), rule: text('rule').notNull(), text: text('text').notNull(), at: created() });
export const jobs = pgTable('jobs', { id: serial('id').primaryKey(), kind: text('kind').notNull(), runAt: timestamp('run_at', { withTimezone: true }).notNull(), payload: jsonb('payload').$type<Record<string, unknown>>().default({}), status: text('status').notNull().default('queued'), attempts: integer('attempts').notNull().default(0), lastError: text('last_error') });
export const subscriptions = pgTable('subscriptions', { id: id(), userId: uuid('user_id').notNull().references(() => users.id), plan: text('plan').notNull(), method: text('method').notNull(), status: text('status').notNull().default('active'), molliePaymentId: text('mollie_payment_id'), currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(), createdAt: created() });
