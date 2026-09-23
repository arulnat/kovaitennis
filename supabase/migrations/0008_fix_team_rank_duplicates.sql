-- =====================================================================
-- Repair duplicate team_seasons.order_index within a division
-- =====================================================================
-- GroupingPage previously computed a newly-appended team's order_index
-- from a COUNT of teams already in the destination division, not from
-- the max order_index actually present. Once any team was ever moved out
-- of a division, count and stored order_index diverged, so the next team
-- appended could collide with a surviving team's order_index — tying two
-- teams at the same rank, which then sorted arbitrarily (Teams page /
-- Grouping page "highest team first" appearing broken). The app code is
-- fixed to append at max(order_index)+1; this renumbers existing rows
-- per division to be contiguous and distinct again, keeping each team's
-- current relative order (ties broken by created_at, i.e. whichever was
-- placed first keeps the higher/earlier rank).
-- =====================================================================

with numbered as (
  select id, row_number() over (partition by division_id order by order_index, created_at) - 1 as rn
  from public.team_seasons
)
update public.team_seasons ts
set order_index = numbered.rn
from numbered
where ts.id = numbered.id
  and ts.order_index is distinct from numbered.rn;
