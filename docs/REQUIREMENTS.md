# Tennis League App — Requirements & Implementation Status

Reconstructed from the original Priority Roadmap / requirement numbers (the
`Req X.Y` references scattered through `src/` and `supabase/migrations/`)
plus everything added or changed while building it. Where a requirement was
implemented differently from how it first reads, that's called out under
**Changes from the original spec** rather than silently in the table below.

Status legend: ✅ built · 🔁 built, modified from the original ask · ⏸ deferred (MP/LP, schema-ready).

## 1. Team & Player Registration

| # | Requirement | Status | Where |
|---|---|---|---|
| 1.4 | Alternate contact phone — number only, no name | ✅ | `teams.alternate_contact_phone` |
| 1.5 | Minimum 4 players per team, captain counts toward the total | ✅ | `bulkUpload.js` (`validateBulkUpload`), captain auto-prepended to the roster |
| 1.6 | Player age always computed live from date of birth, never cached | ✅ | no stored age column; computed at render time wherever shown |
| 1.9 | Under-40 players flagged | ✅ (schema only) | `players.age_flagged_under_40`, computed when DOB present |
| — | Photos, GPS, court details, self-service registration | ⏸ MP/LP | nullable columns exist on `teams`/`players`; no UI |

## 2. Bulk Upload & Credentials

| # | Requirement | Status | Where |
|---|---|---|---|
| 2.1 | Bulk upload is all-or-nothing — one bad row rejects the whole file | ✅ | `bulkUpload.js` |
| 2.2 | Login ID generated from team name; admin-visible credential list | ✅ | `generateLoginId`, `LoginCredentialsPage.jsx` |
| 2.2 | Real Supabase Auth account created per team, not just a DB row | 🔁 | `bulk-create-teams` edge function; originally bulk upload only inserted rows client-side with no real login — fixed mid-session, plus `backfill-team-logins` for teams created before the fix |
| 2.3 | Forced password reset on first login | ✅ | `app_users.must_change_password`, enforced in `LoginPage.jsx` |
| 2.9 | Admin can add a player to a team's roster after the roster lock | ✅ (schema) | `team_players.added_by_admin_after_lock` |
| 2.5, 2.7, 2.8, 2.10 | Registration fee, payment proof, approval workflow | ⏸ MP | nullable/default columns exist on `team_seasons`/`seasons`; no UI |

## 3. Seasons & Divisions

| # | Requirement | Status | Where |
|---|---|---|---|
| 3.1 | Season start date is a Saturday (tournament start weekend) | ✅ | `seasons.start_weekend`, set on Grouping page |
| 3.5.5 | Divisions ranked highest-first (not alphabetical); teams ranked within a division; status highlighting (new/placed/promoted/relegated/withdrawn) | ✅ | `divisions.order_index`, `team_seasons.order_index`, `DivisionsPage.jsx`, `GroupingPage.jsx` |
| — | Promotion/relegation workflow | ⏸ MP | `team_season_status` enum has the values; no automated end-of-season UI |

## 4. Fixture Scheduling

| # | Requirement | Status | Where |
|---|---|---|---|
| 4.1 | A season needs at least one division before fixtures make sense | ✅ | `NeedsDivision` guard in `App.jsx` |
| 4.2 | Round 1 starts on the configured start weekend; subsequent rounds are weekly | ✅ | `computeMatchWeekends` (`scheduler.js`) |
| 4.5 | Odd team count → one bye per round, one bye per team across the season | ✅ | `generateRoundRobin` |
| 4.6 | Home/away balanced to within ±1 across the season | 🔁 | `assignHomeAway` — the original greedy implementation violated this 35–90% of the time for odd team counts (caught by stress-testing before trusting it); rewritten as a deterministic Eulerian-circuit construction that guarantees it whenever there's no Req 4.9 conflict |
| 4.8 | A single circulated page with every division's fixtures, home/away labeled | ✅ | `FixturesCalendarPage.jsx` — print/PDF via the browser, not CSV (CSV can't carry the styled layout) |
| 4.9 | If two teams met last season, home/away auto-swaps from who hosted last time | ✅ | `buildPriorMeetingMap`, pre-oriented edges in `assignHomeAway` |
| 4.12 | Home/away balance verifiable, visible to admins | 🔁 (added) | `homeAwayBalanceReport` + admin-only summary table on the Fixtures page — not in the original numbered spec, added on request |
| — | Holiday weekends skip a round, shifting subsequent rounds out | 🔁 (added) | `season_holidays` table, `computeMatchWeekends`'s skip logic, `rescheduleAroundHolidays` — not in the original numbered spec |
| — | A division locks once fixtures are generated; can be unlocked to add a late team and regenerated | 🔁 (added) | `divisions.grouping_locked`, auto-set on generate, manual unlock re-enables "Regenerate Fixtures" |
| — | Separate "Publish Season" step, season-wide readiness gate before scores can be entered | 🔁 (added) | `seasons.published`, checked in `togglePublish` (every division must have fixtures, no team left unassigned) — originally a per-division "Freeze" flag (`divisions.fixtures_frozen`), replaced since the readiness gate was always season-wide anyway, so a per-division switch never actually did anything independently per division |

## 5. Score Entry

| # | Requirement | Status | Where |
|---|---|---|---|
| 5.1 | Rain/weather extension moves a week's deadline without touching fixtures | ✅ (schema) | `fixtures.deadline_extended_to` |
| 5.2 | Either captain can enter/edit a score; admin can do it on their behalf | ✅ | `ScoreEntryPage.jsx`, `UpdateScoresPage.jsx` (admin) |
| 5.2 | Scores can't be entered until the season is published | 🔁 (added) | gate added alongside the Publish Season feature above; not in the original numbered spec |
| 5.3 | Singles is a single set to 6, 7-point tiebreak at 6-6 | ✅ | `isValidSinglesSet` |
| 5.4 | Doubles is best-of-3 "sets," 3rd set is a 10-point super-tiebreak | ✅ | `isValidDoublesRegularSet`, `isValidSuperTiebreak` |
| 5.5 | A player may play singles + at most one doubles rubber, never both doubles | ✅ | `isEligibleForRubber` |
| 5.6 | Walkover auto-fills the resulting score for every stage it can be declared at | ✅ | `applyWalkover`, full stage picker in `ScoreEntryPage.jsx` (the walkover UI was initially a stub that only handled "not started"; completed later) |
| 5.7 | Once all 3 rubbers are in, either captain can still edit for 7 days, then admin-only | 🔁 **replaced** | The 7-day window was removed in favor of a stricter, user-directed model: `fixtures.finalized_at` is stamped by a database trigger (`0014_auto_finalize_tie.sql`) the moment all 3 rubbers are scored **and** both captains have submitted every required Strategy Builder rating (15.1) — at that instant, not after a delay, captains lose all edit rights. Admin can still edit scores after finalization (never ratings — see 15 below). |
| 5.8 | Missing/pending scores report | ✅ | `MissingScoresReportPage.jsx` — no automated dispute mechanism; this report is the intended replacement |
| 5.9 | Time played capped at 180 minutes (3-hour cap) | ✅ | `isValidTimePlayed`, `TIME_CAP_MINUTES` |

## 6. Standings & Rankings

| # | Requirement | Status | Where |
|---|---|---|---|
| 6.1 | Played/wins/losses/sets/games tracked per team | ✅ | `computeTeamStandings` |
| 6.2 | 1 point per win | ✅ | same |
| 6.3 | 2-team tiebreak uses head-to-head result | ✅ | `buildHeadToHeadMap` |
| 6.4 | 3+-team tiebreak falls through sets diff → games diff; residual ties share rank | ✅ | `assignSharedRanks` |
| 6.5 | Top 2 / bottom 2 highlighted | ✅ | `highlightBands` |
| 6.6 | Individual standings; doubles credits both players, not the pair | ✅ | `computeIndividualStandings` (caller aggregates doubles per-player) |
| 6.7 | Individual standings highlight bands | ✅ | `highlightBands` (reused) |
| 6.8 | Combined cross-group singles leaderboard | ✅ (function ready) | `computeIndividualStandings` accepts any slice of records; page-level combined view not built |
| 6.11 | Champion doubles pair recorded per season | ✅ (schema only) | `seasons.champion_doubles_winner_ids` |
| — | Standings computed live from `rubbers`, never cached | ✅ | `StandingsPage.jsx` queries fresh every load, so a correction inside the 5.7 edit window shows immediately |

## 10. Auth & Access Control

| # | Requirement | Status | Where |
|---|---|---|---|
| 10.2 | Login by ID/password (not email); forced reset on first login | ✅ | synthetic `<login_id>@teams.internal` email under the hood — see README |
| 10.5 | Teams/players/standings/fixtures publicly readable, no login required | ✅ | public RLS `select using (true)`; `StandingsPage`, `FixturesCalendarPage`, `TeamProfilePage` are all public routes |
| 10.6 | Admin accounts (Tournament Admin, Super Admin) bootstrapped directly in Supabase | ✅ | manual step, documented in README |
| 10.7 | 10-minute inactivity session timeout | ✅ | `auth.jsx`'s `resetInactivityTimer` |
| — | Tournament Admin and Super Admin are fully equivalent everywhere | 🔁 (clarified) | confirmed no asymmetry anywhere in the codebase — every admin check tests both roles together |

## 11. Data Sensitivity

| # | Requirement | Status | Where |
|---|---|---|---|
| 11.2 | Public read applies to teams/players in general, but not every column | ✅ | `team_credentials` (login passwords) is a separate table with no public policy at all, unlike `teams` itself |

## 12. Reports

| # | Requirement | Status | Where |
|---|---|---|---|
| 12.8 | Missing-scores report is manually run, not automatic | ✅ | `MissingScoresReportPage.jsx` |
| — | Most of the reports suite (attendance, Hall of Fame, etc.) | ⏸ LP | not built |

## 13. Content

| # | Requirement | Status | Where |
|---|---|---|---|
| 13 | Rules & Regulations, Welcome Note — evergreen or season-scoped content pages | ✅ | `content_pages` table, `ContentManagementPage.jsx` |

## 17. Test Season Isolation — retired, replaced

| # | Requirement | Status | Where |
|---|---|---|---|
| 17, 17.5 | A separate `is_test` sandbox season, isolated from real aggregates | 🔁 **replaced** | Superseded mid-session by a different workflow: every season created on `SeasonsPage.jsx` is real (`is_test: false`); an admin tests via an actual real season, then uses **Purge Data** (`seasons.purge_locked`, locked by default) to permanently delete that season and everything under it. `v_real_seasons` (excludes `is_test` seasons) still exists in the schema but nothing currently creates a test season through the UI. |

## Added beyond the original spec

Built in response to specific requests during development, with no corresponding original requirement number:

- **Divisions page** — full create/rename/delete UI, rename allowed even with teams already in the division, delete blocked while it still holds any team.
- **Grouping page** — the single screen that takes a season from "teams uploaded" to "fixtures generated": drag-free move-to-division controls (single row and multi-select bulk move, for both the unassigned pool and every division column), manual rank reordering (▲▼), seeded random auto-grouping (`grouping.js`), holiday weekend management with automatic fixture-date rescheduling, and locked-division options shown disabled with a "(locked)" label in every move picker instead of only failing after the fact.
- **Teams page** — read-only mirror of Grouping's own ordering (unassigned first, then division-by-division, highest to lowest, ranked within), bulk and single delete restricted to unassigned teams, full teardown (login, players, roster, credentials) via the `delete-team` edge function.
- **Team Profile page** (`/team/:teamId`, public) — captain/contact info, current-season division and standing, season roster, and this season's fixtures with results. Every team name shown anywhere in the app (Standings, Fixtures Calendar, Teams, Grouping, Fixtures viewer, Update Scores, Missing Scores, Team Logins) links to it.
- **Update Scores page** (admin) — lets an admin jump straight into any fixture's score entry, mirroring what a captain can do.
- **Strategy Builder** (Req 15, `tie_player_ratings` table) — the original v6 spec surfaced mid-session and superseded an earlier, incorrect first attempt (a flat `player_ratings` table, admin/own-captain editable, publicly visible — none of which matched the spec). Rebuilt against 15.1–15.7 as actually written: after a tie is scored, the **opposing** captain rates each player who played (5–10 overall, plus Strong/Weak tags on Serve/Forehand/Backhand/Volley), entered from a 4th "Performance" tab on Score Entry; one rating per player per tie (round-robin naturally limits this to once per season per pairing, 15.2); not public, visible only to a logged-in captain or admin (15.5); admin has no write access to it at all — scores only. Team Profile shows a read-only season-average (15.3, resets each season) plus a Strong/Weak tally, computed live from this season's ties. Self-rating (15.6) and a career-wide (cross-season) figure are not yet built — the latter was flagged as a deliberate deviation from 15.3's explicit per-season reset, pending a decision on how it should be computed.

## Known data-integrity fix

`team_seasons.order_index` (team rank within a division) was being assigned from a **count** of teams already in the destination division rather than the **highest order_index actually present**. Once any team was ever moved out of a division, those two numbers diverged, so the next team appended could collide with a surviving team's rank — a tie that then sorted unpredictably. Fixed in `GroupingPage.jsx` (`assignDivision`, `moveSelectedTeams`, `autoGenerate`) to always append at `max(order_index) + 1`, with a one-time migration (`0008_fix_team_rank_duplicates.sql`) to renumber any division already affected.

## Deferred (MP/LP) — schema-ready, no UI

Self-service team registration (photos/GPS/court details), fee/payment workflow, promotion/relegation automation, most of the reports suite, Hall of Fame, newsletter generation, prize gallery, combined cross-group singles leaderboard page (the standings function itself already supports it).

## Stack

React 18 + Vite + Tailwind CSS (custom teal/accent theme) · Supabase (Postgres, Auth, Edge Functions, RLS) · deployed as static assets via Cloudflare Workers (`wrangler.jsonc`). See `README.md` for setup/deploy steps.
