-- Roster page rework: full player editing (gender, DOB, coach, photo,
-- delete) needs a reliable way to know which player row IS the team's
-- captain (so their row can also edit teams.captain_phone, and so they
-- can never be deleted) and which one is the team's coach (so "only one
-- coach per team" can be enforced at the database level, not just in
-- application code).

alter table public.players add column if not exists is_captain boolean not null default false;
alter table public.players add column if not exists is_coach boolean not null default false;

-- Backfill: the earliest-created player for each team is the one bulk
-- upload / Add Team always inserts first (the real captain) — every
-- creation path since has inserted the captain first in the same
-- batch, so created_at (with id as a tiebreak for same-transaction
-- inserts) reliably identifies them.
with earliest as (
  select distinct on (team_id) id
  from public.players
  order by team_id, created_at asc, id asc
)
update public.players p
set is_captain = true
from earliest e
where p.id = e.id;

-- At most one captain and one coach per team, enforced at the DB level
-- as a backstop to the Edge Function's own checks.
create unique index if not exists players_one_captain_per_team on public.players(team_id) where is_captain;
create unique index if not exists players_one_coach_per_team on public.players(team_id) where is_coach;
