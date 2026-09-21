# Tennis League App — MVP Scaffold

This is a working scaffold for the **HP (high-priority) scope** defined in the Priority Roadmap:
bulk team/roster upload (no photos/ID/DOB), divisions, fixture scheduling, score entry with the
7-day edit window, live-computed standings, the missing-scores report, Rules & Regulations /
Welcome Note content, and a Test Season sandbox. Registration self-service, fees, promotion/
relegation, the newsletter, and most reports are **deferred** per that roadmap (marked MP/LP) —
the schema has room for them, but no UI is built for them yet.

## What's actually real vs. scaffolded

**Real, tested, working logic** (`src/lib/`) — pure functions, zero external dependencies,
verified against the requirement scenarios in `src/lib/__tests__/run-tests.mjs`:
- `scheduler.js` — circle-method round robin, bye handling, home/away balance + prior-season
  swap logic (Req 4.1–4.12)
- `scoring.js` — tiebreak/super-tiebreak validation, walkover auto-fill for every sub-case in
  Req 5.6, doubles-eligibility filtering (Req 5.5), time-played capping (Req 5.9)
- `standings.js` — team & individual standings, tiebreak cascades, shared-rank handling for
  residual ties (Req 6.3, 6.4, 6.6, 6.8)
- `bulkUpload.js` — all-or-nothing Excel row validation (Req 2.1)

Run `npm test` (just needs Node, no install required) to see all 25 tests pass.

**Scaffolded UI** (`src/pages/`) — real React components wired to Supabase and to the logic
above, but written quickly and not run against a live database in this environment (no network
access here). Expect to fix minor wiring issues once you connect a real Supabase project —
especially:
- The `window.__ACTIVE_SEASON_ID__` / `window.__ACTIVE_DIVISION_ID__` placeholders in `App.jsx`
  — replace with a real season/division selector (e.g. a dropdown backed by a context provider)
  once you have more than one season in the database.
- `ScoreEntryPage.jsx`'s walkover UI is simplified — it always submits `{ stage: 'not_started' }`
  to `applyWalkover`. The logic in `scoring.js` correctly handles every stage (mid-set, 1-1,
  mid-breaker); the UI just needs a "when did the walkover happen?" control wired to it.
- `FixtureGenerationPage.jsx`'s "prior season" fixture query is simplified (comment in the file
  flags this) — scope it to the specific prior `season_id`, not just any fixture involving those
  team IDs.
- RLS policies are written and included in the migration, but **not tested against a live
  Postgres instance** here — run `supabase db push` (or apply the SQL directly) and test each
  role's access before trusting them in production.

**Not built yet** (MP/LP per the roadmap): self-service team registration (photos/GPS/court
details), fee/payment workflow, promotion/relegation, Strategy Builder, real-time subscriptions,
most of the reports suite, Hall of Fame, newsletter generation, prize gallery. The schema has
nullable columns ready for these (see migration comments) so adding them later shouldn't require
a schema rewrite.

## Setup

1. **Create a Supabase project** at supabase.com (free tier is fine to start).
2. **Run the migration**: `supabase/migrations/0001_init.sql` against your project — either via
   the Supabase CLI (`supabase db push`) or by pasting it into the SQL Editor in the dashboard.
3. **Copy `.env.example` to `.env`** and fill in your project's URL and anon key (Project
   Settings → API).
4. **Bootstrap the admin accounts** (Req 10.6): create a Tournament Admin and Super Admin user
   in Supabase Auth (dashboard → Authentication → Users → Add User), then insert matching rows
   into `app_users` with the right `role`.
5. `npm install`
6. `npm run dev` — starts the local dev server.
7. `npm test` — runs the pure-logic test suite (no Supabase connection needed).

## Deploying

- **Frontend**: `npm run build` produces `dist/` — push to a Git repo connected to Cloudflare
  Pages (build command `npm run build`, output directory `dist`).
- **Domain**: point your GoDaddy domain's DNS at Cloudflare Pages per Cloudflare's custom-domain
  instructions.
- **Database**: already hosted on Supabase once you've run the migration — no separate deploy
  step.

## A note on login IDs vs. Supabase Auth

Supabase Auth's `signInWithPassword` expects an email. Since team logins use a generated
`login_id` (Req 2.2), not an email, this scaffold uses the convention
`<login_id>@teams.internal` as a synthetic email under the hood (see `LoginPage.jsx`). This is a
reasonable, common pattern — but double-check it against your Supabase project's email
validation settings, since some configurations reject non-standard domains.

## What to build next

Follow the build order in the Priority Roadmap PDF: this scaffold covers roughly the "Foundations
through Score Entry" slices. Next up, in order, is wiring the Test Season UI to actually run a
full mock season through the pipeline above, then the content-doc-to-HTML conversion for Rules &
Regulations (currently a plain textarea — `mammoth.js`/`pdf.js` integration is flagged as a
follow-on in the requirements doc's stack table).
