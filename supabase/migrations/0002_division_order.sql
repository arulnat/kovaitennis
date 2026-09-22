-- =====================================================================
-- Division ordering (Req 3.5.5 grouping)
-- =====================================================================
-- Divisions previously had no explicit rank -- the UI sorted them
-- alphabetically by name. This adds order_index: the first division in
-- ascending order_index is the "highest" division, both for display and
-- as the starting point when auto-generating groups (fills the highest
-- division's remaining capacity first, then works down).
-- =====================================================================

alter table public.divisions add column if not exists order_index integer;

-- Backfill existing rows to their current creation order per season so
-- nothing changes visually right after this migration runs.
with numbered as (
  select id, row_number() over (partition by season_id order by created_at) - 1 as rn
  from public.divisions
  where order_index is null
)
update public.divisions d
set order_index = numbered.rn
from numbered
where d.id = numbered.id;

alter table public.divisions alter column order_index set default 0;
alter table public.divisions alter column order_index set not null;
