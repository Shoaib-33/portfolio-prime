# Portfolio & Prime: investor platform (version 1)

Phase 1 (MVP) of the *Dutch Investor Property Platform: Product & Technical Plan* (23 Oct 2026), built as a real application with a backend and a database. All listings, people and companies are fictional.

## Run it

Requirements: Node.js 20+ (website) and Python 3.10+ (API). No database to install: locally the API starts an embedded PostgreSQL 16 (`pgserver`) in `apps/api/data/pg`.

```powershell
cd E:\Property_Investment\platform
npm install            # website packages (first time only)
npm run setup:api      # Python virtual environment apps/api/.venv + API packages (first time only)
npm run build          # builds the website
npm start              # starts the API (FastAPI, port 4000) and the website (port 3000)
```

Open http://localhost:3000. Or double-click `start-demo.cmd`. During development run the two parts yourself: `npm run dev:api` (uvicorn with auto-reload) and `npm run dev:web`. The API documentation (OpenAPI/Swagger) is at http://localhost:4000/api/docs.

Reset the demo database: stop the server, then `npm run seed -- --reset`.

## Deploy on Render (free)

`render.yaml` creates a free PostgreSQL database and one free web service in Frankfurt (`node start.js` runs the website and the Python API together; the build installs Python 3.12 with `uv` inside the project folder, see `scripts/render-build.sh`). In Render: **New + › Blueprint** › pick this repository › **Deploy Blueprint**. Free services sleep after ~15 minutes idle; free databases expire after a limited period. Search engines are blocked for the demo; set `PP_INDEX=1` (and `SITE_URL`) on the production site to allow indexing.

## Demo accounts

Password for all: `Demo2026!`. One-click buttons are on the login page. Accounts with two-factor login show the current code in demo mode.

Three accounts, one per kind of user:

| Account | Role | What it can do |
|---|---|---|
| developer@demo.nl | Developer | Everything, including the CRM & API settings and creating admin or developer accounts |
| admin@demo.nl | Admin | Runs the staff workspace and invites investors, choosing per person which properties and features they see |
| investor@demo.nl | Investor | Verified Investor Pro: 6 shared properties (including both private deal rooms) and every feature |

Every other investor joins through an invitation the admin creates in *People & access*; there is no self-registration. Databases from earlier versions are upgraded once (`migrations/0005_three_accounts.sql`): pro@demo.nl becomes investor@demo.nl and the other demo investors and earlier staff accounts are deactivated, with their history kept.

## Architecture

| Layer | Used here | Plan | Notes |
|---|---|---|---|
| Website | Next.js 15, React 19, TypeScript | Next.js | Server-rendered; the browser only talks to the website, `/api/*` is proxied to the API |
| API | **FastAPI** (Python 3.10+), Pydantic v2 validation, Uvicorn | NestJS | Routers per domain (`apps/api/app/routers`): public, account, deals, admin, messages, institutional, access, integrations; background-jobs thread. OpenAPI docs at `/api/docs` |
| Database | Local: embedded PostgreSQL 16 (`pgserver`, in `apps/api/data/pg`). With `DATABASE_URL` set (Render): regular PostgreSQL via psycopg 3. SQLAlchemy 2 Core | PostgreSQL 16 + PostGIS | Plain SQL migrations in `apps/api/migrations`, applied at start-up (compatible with the history written by the earlier Node.js API) |
| Jobs | Table-based queue polled every 30 s | Redis + BullMQ | Closes bid rounds at the deadline; releases off-market listings to verified investors after 48 h |
| Login | Email + password (scrypt), TOTP 2FA (RFC 6238), httpOnly session cookie, roles | Keycloak / EU IdP | Staff and data rooms always require 2FA |
| Files | `files` table in the database | S3-compatible EU storage | Survives restarts on hosts without a disk. Data-room PDFs are watermarked per viewer on the server (pdf-lib), behind 5-minute signed links |
| KYC, Mollie, e-sign, email, BAG | Simulated adapters with the real shapes | Sumsub/Veriff/iDIN, Mollie, Signhost, Brevo/Postmark, Kadaster BAG API | Emails go to the `outbox` table; plug in providers with API keys later |

Access control is enforced in the API (`serialize_listing` in `apps/api/app/common.py`): a visitor's browser never receives the address, exact price, financials or documents.

## What version 1 covers (plan Phase 1, plus bid rounds)

Public site, listings with filters (type, city, province, radius around a city or postcode via PDOK Locatieserver, deal type, price, yield, energy label) and search, **map view** (MapLibre + PDOK base map, clustered pins; visitors only see the approximate area), **SEO landing pages** per city and type (`/beleggingspanden/rotterdam`, `/beleggingspanden/rotterdam/woningportefeuilles`) with schema.org RealEstateListing/BreadcrumbList/ItemList markup, `sitemap.xml`, `robots.txt` and Open Graph images, key figures (BAR, NAR, price per m², WOZ, tenure), sold archive, NL/EN switch for the main pages, Smart finder · sign-up and login with 2FA, buy box, saved searches, favourites, notifications, data export and deletion · KYC upload with risk scoring and compliance review · NDA per listing, data room with folders, watermarked viewer, download policy and audit log · server-side calculator · offers with proof of funds, admin accept/counter/reject, deal timeline · **secure messaging** between investor and account manager per listing (staff reply from the workspace; email only announces a new message) · sealed bid rounds with minimum bid, scheduled close and award · Investor Pro checkout (simulated Mollie) and off-market early access · staff workspace: KPIs and funnel, investor CRM, offers and deals, bid rounds, acquisition pipeline, BAG lookup to create and publish listings with buy-box matching, price changes with alerts, config table for transfer tax, KYC queue, FIU flagging, audit log, automation rules, outbox and job queue.

## Invite-only access

- **Visitors** see only the public company site (what we do, how access works, anonymised track record, guides) and a *Request access* form. There is no self-registration; `/api/listings`, details, map, market report and all tools answer 401.
- **Admins** create investors in *Staff workspace › People & access* (developers can also create admins and developers): name, role, the properties they see (a selection, or *all properties* including future CRM listings) and the features switched on (map, smart finder, market report, analysis & memo, AI analyst, data room, private deal rooms, offers & bids, messages, membership, sell to us; presets Viewer / Buyer / Institution / Everything). The invitation link (`/invite/<token>`, single use, 3–30 days, only a hash is stored) lets the person set a password. Admins can change an investor's access at any time (effective on the next request), send a new link, revoke it, or pause someone (signed out at once). Access requests from the website appear in the same tab.
- **Enforcement is on the server**: `can_see_listing` and `has_feature` in `apps/api/app/domain.py`, loaded per session in `app/common.py`; a property that is not shared answers 404, a feature that is off answers 403. Alerts (buy-box matches, price drops) only go to people who can see the property. The web layouts (`apps/web/components/gate.tsx`) only decide what to show instead of an error.
- **CRM integration** (`app/routers/integrations.py`): the company CRM pushes listings to `POST /api/integrations/crm/listings` with an `x-api-key` (keys created and revoked by a developer in *CRM & API*, stored hashed; `PP_CRM_API_KEY` works as a bootstrap key). Upsert by `externalId` (one object or an array of up to 200), optional unit rent roll and `shareWith` emails; `DELETE /api/integrations/crm/listings/:externalId` withdraws. Photos may be `https://` URLs.

## Institutional layer

- **Private deal rooms** (`dealType: institutional`, e.g. Project Tulip, 860 homes; Project Delta, build-to-rent forward funding): codename teaser for everyone, details only for verified funds, family offices, pension funds and insurers (`is_qualified` in `app/domain.py`).
- **Structured sale process** (`sale_processes`, `qa_items`): teaser & NDA → IM → indicative bids → shortlist (top 3, automatic) → full data room → final binding bids → SPA. Minimum ticket from the config table; anonymised Q&A log; staff run it from *Deal processes* in the workspace (admin and developer see bid amounts).
- **Analysis tab** (`app/analytics.py`, `app/services/analysis.py`): automated valuation and comparables, 10-year DCF with IRR and stress tests, WWS rent-regulation exposure per unit (Wet betaalbare huur; thresholds in the config table), ESG (labels, energy intensity, CO₂, EU Taxonomy, capex to label B), due-diligence flags. Unit-level parts need verification and the property NDA.
- **AI analyst** (`app/ai.py`, `POST /api/ai/ask`, `/analyst` and the listing's *Ask the AI analyst* tab): answers only from the viewer's analysis pack, with sources; scenarios run through the server calculators; never recommends buying. Set `ANTHROPIC_API_KEY` (optional `PP_AI_MODEL`, default `claude-opus-5-5`) to use Claude; without a key a built-in analyst engine answers. 30 questions per user per hour; questions are logged in `ai_logs`.
- **IC memo**: `GET /api/listings/:slug/memo`, a watermarked PDF draft for verified investors.
- **Mandate matching**: fit score per listing against the buy box on *My account*.
- **Reach**: English and German investor guides (`/invest-in-dutch-real-estate`, `/de/immobilien-investment-niederlande`) with FAQ markup and hreflang, `/market-report` (Dataset markup), `/llms.txt` for AI search engines, all in the sitemap.

Market benchmarks and comparable transactions are fictional demo data (`MARKET`, `COMPS` in `app/analytics.py`); production connects a transaction-data feed. WWS points are an indicative estimate.

## Buyers & outreach
Staff workspace → **Buyers** and **Outreach**.
- **Import**: drop the Kadaster/BAG ownership exports (`properties_*.xlsx`, `owners_*.xlsx`, `owner_properties_*.xlsx`) and contact lists (company, name, email; template under Buyers). The file type is recognised from its columns; new batches update existing rows (buildings by BAG pand id, companies by name or Kadaster entity). Imports run in the background. The exports are licensed data: keep them out of git (`files/` is ignored).
- **Profiles**: per company, where it owns (city, province), what (residential, retail, office…), deal sizes, purchases in the last 5 years and 12 months.
- **Potential buyers**: Listings → *Find buyers*, or Buyers → choose a property. Companies are ranked 0–100 on location, property type, deal size, scale and buying activity, with the reasons shown.
- **Email**: select companies, edit the NL or EN template, preview and queue. Every email has a personal link: opening it creates that person's invitation with access to that property only. Opens, clicks, registrations, views and offers show under Outreach. Every email has an unsubscribe link (`/u/<token>`); unsubscribed and do-not-contact companies are never emailed again.
- **Sending** is simulated (emails go to the outbox) until a mail server is configured: set `SMTP_HOST`, `SMTP_PORT` (587 or 465), `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM`; optional `PP_MAIL_BATCH` (emails per 30 s, default 25) and `PP_PUBLIC_URL` (base of the links in emails). Set SPF/DKIM for the sending domain.

## Tests

`npm test` (from `platform/`) runs 28 pytest tests on a fresh embedded database: business rules (tiers, off-market timing, BAR/NAR, KYC risk, matching, RFC 6238 TOTP vectors, IRR and scenarios, WWS points, ESG, valuation, flags, mandate fit) and end-to-end API tests on a fresh in-memory database (no leaks to visitors, watermarked links bound to the user, offer → deal, bid rounds, roles, KYC, map points and radius search, messaging privacy and roles, private deal rooms and sale process, analysis, memo and AI analyst access levels, invite-only access: invitations, per-person properties and features, pausing, and the CRM API).

## Before real investors use it

Move to a managed PostgreSQL in the EU and S3 storage; connect real KYC, e-sign, Mollie, email and BAG/EP-Online/WOZ providers; add Redis/BullMQ and Meilisearch when volume grows; legal review (Wwft position, NDA, terms, GDPR DPIA); security review and penetration test (OWASP ASVS L2); real listing media and copy. Not yet built from the plan: Phase 2 e-signed NDA/LOI, data-room Q&A, IRR/10-year model, WhatsApp/push alerts, CBS data; magic-link and Google/Microsoft sign-in, weekly newsletter, real email sending; Phase 3 broker accounts, partners, German, native apps.
