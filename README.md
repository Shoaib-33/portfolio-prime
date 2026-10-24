# Portfolio & Prime: investor platform (version 1)

Phase 1 (MVP) of the *Dutch Investor Property Platform: Product & Technical Plan* (23 Oct 2026), built as a real application with a backend and a database. All listings, people and companies are fictional.

## Run it

Requirements: Node.js 20+ (tested on 24). Nothing else to install.

```powershell
cd E:\Property_Investment\platform
npm install            # first time only
npm run build          # compiles the API and the website
start-demo.cmd         # starts the API (port 4000) and the website (port 3000)
```

Open http://localhost:3000. Or start the two parts yourself: `npm run dev:api` and, in a second window, `npm run start -w apps/web`.

Reset the demo database: `npm run seed -- --reset` (from `apps/api`) while the API is stopped.

## Demo accounts

Password for all: `Demo2026!`. One-click buttons are on the login page. Accounts with two-factor login show the current code in demo mode.

| Account | What it shows |
|---|---|
| free@demo.nl | Free member: full financials and addresses, no data room or offers |
| verified@demo.nl | Verified investor: NDA, data room, offers, bid round (2FA on) |
| pro@demo.nl | Investor Pro: off-market first look |
| admin@demo.nl | Staff, all rights |
| compliance@demo.nl | Staff: KYC queue, audit log, flagging |
| sales@demo.nl | Staff: offers, deals, bid rounds |
| acquisition@demo.nl | Staff: seller leads, BAG lookup, listings |

## Architecture

| Layer | Used here | Plan | Notes |
|---|---|---|---|
| Website | Next.js 15, React 19, TypeScript | Next.js | Server-rendered; the browser only talks to the website, `/api/*` is proxied to the API |
| API | NestJS 11, TypeScript, zod validation | NestJS | Controllers per domain: public, account, deals, admin; background jobs service |
| Database | PostgreSQL via **PGlite** (in `apps/api/data`) + Drizzle ORM | PostgreSQL 16 + PostGIS, Prisma/Drizzle | Same SQL and schema. Production: set up PostgreSQL and swap the driver to `drizzle-orm/node-postgres` |
| Jobs | Table-based queue polled every 30 s | Redis + BullMQ | Closes bid rounds at the deadline; releases off-market listings to verified investors after 48 h |
| Login | Email + password (scrypt), TOTP 2FA (RFC 6238), httpOnly session cookie, roles | Keycloak / EU IdP | Staff and data rooms always require 2FA |
| Files | Local folder `apps/api/storage` | S3-compatible EU storage | Data-room PDFs are watermarked per viewer on the server (pdf-lib), behind 5-minute signed links |
| KYC, Mollie, e-sign, email, BAG | Simulated adapters with the real shapes | Sumsub/Veriff/iDIN, Mollie, Signhost, Brevo/Postmark, Kadaster BAG API | Emails go to the `outbox` table; plug in providers with API keys later |

Access control is enforced in the API (`serializeListing` in `apps/api/src/common.ts`): a visitor's browser never receives the address, exact price, financials or documents.

## What version 1 covers (plan Phase 1, plus bid rounds)

Public site, listings with filters and search, key figures (BAR, NAR, price per m², WOZ, tenure), sold archive, NL/EN switch for the main pages, Smart finder · sign-up and login with 2FA, buy box, saved searches, favourites, notifications, data export and deletion · KYC upload with risk scoring and compliance review · NDA per listing, data room with folders, watermarked viewer, download policy and audit log · server-side calculator · offers with proof of funds, admin accept/counter/reject, deal timeline · sealed bid rounds with minimum bid, scheduled close and award · Investor Pro checkout (simulated Mollie) and off-market early access · staff workspace: KPIs and funnel, investor CRM, offers and deals, bid rounds, acquisition pipeline, BAG lookup to create and publish listings with buy-box matching, price changes with alerts, config table for transfer tax, KYC queue, FIU flagging, audit log, automation rules, outbox and job queue.

## Tests

`npm test` (from `platform/`) runs 18 tests: business rules (tiers, off-market timing, BAR/NAR, KYC risk, matching, RFC 6238 TOTP vectors) and end-to-end API tests on a fresh in-memory database (no leaks to visitors, watermarked links bound to the user, offer → deal, bid rounds, roles, KYC).

## Before real investors use it

Move to a managed PostgreSQL in the EU and S3 storage; connect real KYC, e-sign, Mollie, email and BAG/EP-Online/WOZ providers; add Redis/BullMQ and Meilisearch when volume grows; legal review (Wwft position, NDA, terms, GDPR DPIA); security review and penetration test (OWASP ASVS L2); real listing media and copy. Not yet built from the plan: Phase 2 e-signed NDA/LOI, data-room Q&A, IRR/10-year model, WhatsApp/push alerts, CBS data, SEO city pages; Phase 3 broker accounts, partners, German, native apps.
