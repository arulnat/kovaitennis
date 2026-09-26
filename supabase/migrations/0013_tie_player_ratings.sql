-- =====================================================================
-- Strategy Builder rework — per-tie opposing-captain ratings
-- =====================================================================
-- Replaces player_ratings (built before the actual v6 spec was
-- available): that let admin or a player's OWN captain edit a flat,
-- always-overwritable, publicly-visible rating at any time. The real
-- requirement is the opposite on every axis: the OPPOSING captain rates
-- a player, only for a specific tie just played, storage needs to
-- support averaging multiple ties' ratings per season (not a single
-- overwritable row), it's never public, and admin never touches it at
-- all -- only scores.
--
-- fixtures.finalized_at: stamped once a tie's 3 rubbers are scored AND
-- both captains have submitted every required opposing-player rating.
-- Mirrors rubbers.locked_at's existing pattern (a timestamp set once by
-- app logic, checked as a simple "is it still open" gate) but this one
-- gates ratings entirely (nobody, including admin, edits a rating after
-- this is set) and gates scores for non-admins only (admin keeps
-- editing scores after finalization, same as it already could during
-- the old 7-day window -- "admin can only edit the scores, not the
-- performance of the players").
-- =====================================================================

alter table public.fixtures add column if not exists finalized_at timestamptz;

create table if not exists public.tie_player_ratings (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  rated_player_id uuid not null references public.players(id) on delete cascade,
  rated_by_team_id uuid not null references public.teams(id),
  overall_rating smallint not null check (overall_rating between 5 and 10),
  serve text check (serve in ('strong', 'weak')),
  forehand text check (forehand in ('strong', 'weak')),
  backhand text check (backhand in ('strong', 'weak')),
  volley text check (volley in ('strong', 'weak')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One rating per player per tie -- the opposing captain is the only
  -- one who could ever rate them for this fixture, so there's only ever
  -- one valid row (Req 15.2's "one rating opportunity per pairing" is
  -- just this, since round-robin means one tie per pairing per season).
  unique (fixture_id, rated_player_id)
);

alter table public.tie_player_ratings enable row level security;

-- Not public (Req 15.5) -- any logged-in captain or admin can see it
-- (scouting is meant to help ANY captain preparing for an upcoming tie,
-- not just the specific next opponent), anonymous cannot.
drop policy if exists tie_player_ratings_select on public.tie_player_ratings;
create policy tie_player_ratings_select on public.tie_player_ratings for select
  using (auth.uid() is not null);

-- Only the opposing captain, for a player on the other side of THIS
-- fixture, and only before the tie finalizes. No is_admin() clause
-- anywhere here on purpose -- admin cannot write to this table at all.
drop policy if exists tie_player_ratings_write on public.tie_player_ratings;
create policy tie_player_ratings_write on public.tie_player_ratings for all
  using (
    rated_by_team_id = public.current_team_id()
    and exists (
      select 1 from public.fixtures f
      join public.players p on p.id = tie_player_ratings.rated_player_id
      where f.id = tie_player_ratings.fixture_id
        and f.finalized_at is null
        and (
          (f.home_team_id = tie_player_ratings.rated_by_team_id and p.team_id = f.away_team_id)
          or (f.away_team_id = tie_player_ratings.rated_by_team_id and p.team_id = f.home_team_id)
        )
    )
  )
  with check (
    rated_by_team_id = public.current_team_id()
    and exists (
      select 1 from public.fixtures f
      join public.players p on p.id = tie_player_ratings.rated_player_id
      where f.id = tie_player_ratings.fixture_id
        and f.finalized_at is null
        and (
          (f.home_team_id = tie_player_ratings.rated_by_team_id and p.team_id = f.away_team_id)
          or (f.away_team_id = tie_player_ratings.rated_by_team_id and p.team_id = f.home_team_id)
        )
    )
  );

-- Scores: same captain/admin conditions as before, plus non-admins lose
-- write access once the tie is finalized (admin keeps it, matching the
-- pre-existing "admin overrides anytime" behavior -- now scoped to mean
-- scores specifically, never ratings).
drop policy if exists rubbers_team_write on public.rubbers;
create policy rubbers_team_write on public.rubbers for all
  using (
    public.is_admin()
    or exists (
      select 1 from public.fixtures f
      where f.id = rubbers.fixture_id
        and (f.home_team_id = public.current_team_id() or f.away_team_id = public.current_team_id())
    )
  )
  with check (
    exists (
      select 1 from public.fixtures f
      join public.seasons s on s.id = f.season_id
      where f.id = rubbers.fixture_id and s.published
    )
    and (
      public.is_admin()
      or (
        locked_at is null
        and exists (select 1 from public.fixtures f where f.id = rubbers.fixture_id and f.finalized_at is null)
        and exists (
          select 1 from public.fixtures f
          where f.id = rubbers.fixture_id
            and (f.home_team_id = public.current_team_id() or f.away_team_id = public.current_team_id())
        )
      )
    )
  );

-- Retire the old, spec-mismatched player_ratings feature entirely.
drop policy if exists player_ratings_select_all on public.player_ratings;
drop policy if exists player_ratings_write on public.player_ratings;
drop table if exists public.player_ratings;
