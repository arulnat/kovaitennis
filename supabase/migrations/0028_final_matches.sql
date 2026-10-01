-- Final week: single-set knockout matches among the season's qualifying
-- players (top 4 singles / top 8 doubles by Rising Stars points, across
-- all divisions) — singles, doubles, 2 semifinals + 1 final each, slots
-- the admin fills in from the Final Results admin page. "Posted" is the
-- same two-stage idea as a rubber's confirmed_at: a match can be saved
-- as a draft and corrected before it's made public (Results page's
-- Final Results tab only ever shows posted = true rows).
--
-- Doubles pairs are whatever the admin picks from the qualified pool
-- for that match (not necessarily a player's own in-season partner) —
-- side_a_player2_id/side_b_player2_id are simply null for singles.
create table if not exists public.final_matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  kind text not null check (kind in ('singles', 'doubles')),
  stage text not null check (stage in ('semifinal1', 'semifinal2', 'final')),

  side_a_player1_id uuid references public.players(id),
  side_a_player2_id uuid references public.players(id), -- doubles only
  side_b_player1_id uuid references public.players(id),
  side_b_player2_id uuid references public.players(id), -- doubles only

  -- Single set, same rules as everywhere else (isValidSinglesSet /
  -- isValidStandardTiebreakSet) — no set2/set3, this is one set only.
  side_a_games integer,
  side_b_games integer,
  tiebreak_a integer,
  tiebreak_b integer,

  winner_side text check (winner_side in ('a', 'b')),
  posted boolean not null default false,
  posted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (season_id, kind, stage)
);

alter table public.final_matches enable row level security;

drop policy if exists final_matches_select on public.final_matches;
create policy final_matches_select on public.final_matches for select
  using (posted = true or public.is_admin());

drop policy if exists final_matches_admin_write on public.final_matches;
create policy final_matches_admin_write on public.final_matches for all
  using (public.is_admin()) with check (public.is_admin());
