-- =====================================================================
-- Division order lock (Req 3.5.5 grouping)
-- =====================================================================
-- Lets an admin freeze division ranking once it's finalized, so the
-- move up/down controls on the Divisions page can't accidentally shuffle
-- ranks after fixtures depend on them. Defaults to unlocked; the app
-- treats a season with zero divisions as unlocked regardless of this
-- flag (nothing to protect yet), so no backfill/reset logic is needed
-- here beyond the column default.
-- =====================================================================

alter table public.seasons add column if not exists divisions_locked boolean not null default false;
