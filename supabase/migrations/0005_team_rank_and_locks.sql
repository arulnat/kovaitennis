-- =====================================================================
-- Team ranking within a division + per-division locks
-- =====================================================================
-- team_seasons.order_index: ranks teams within their division (e.g. for
-- seeding) — NOT alphabetical, same pattern as divisions.order_index
-- ranking divisions themselves. Backfilled to current creation order per
-- division so nothing looks shuffled right after this migration.
--
-- divisions.grouping_locked: once locked, a division's roster (which
-- teams belong to it) and team ranking are frozen, and Generate Fixtures
-- refuses to run — protects a finalized grouping from being disturbed
-- after fixtures start depending on it. Defaults unlocked.
--
-- divisions.fixtures_locked: gates the manual home/away swap control on
-- the Fixtures viewer page — only while unlocked can an admin correct a
-- generated fixture's home/away by hand. Defaults unlocked (same
-- default as grouping_locked and the division order lock — this is a
-- correction tool, not a destructive action like Purge Data, which
-- defaults locked).
-- =====================================================================

alter table public.team_seasons add column if not exists order_index integer;

with numbered as (
  select id, row_number() over (partition by division_id order by created_at) - 1 as rn
  from public.team_seasons
  where order_index is null
)
update public.team_seasons ts
set order_index = numbered.rn
from numbered
where ts.id = numbered.id;

alter table public.team_seasons alter column order_index set default 0;
alter table public.team_seasons alter column order_index set not null;

alter table public.divisions add column if not exists grouping_locked boolean not null default false;
alter table public.divisions add column if not exists fixtures_locked boolean not null default false;
