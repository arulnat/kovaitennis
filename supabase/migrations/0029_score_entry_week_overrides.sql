-- =====================================================================
-- Per-week admin override: let captains score a future week early
-- =====================================================================
-- New default (captains only -- admin is already exempt from every
-- scoring restriction, and always has been): a captain can no longer
-- enter or edit a fixture's rubber score, or give an opposing-player
-- rating, for a fixture whose week hasn't arrived yet (week_date is
-- after today). This table lets an admin deliberately re-open one
-- specific week -- across every division in the season, since a week
-- is a calendar date shared by all of them -- ahead of its date (e.g.
-- a match got played early). Presence of a row = that week's
-- restriction is lifted, same pattern as season_holidays (0007).
-- =====================================================================

create table if not exists public.score_entry_week_overrides (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  week_date date not null,
  created_at timestamptz not null default now(),
  unique (season_id, week_date)
);

alter table public.score_entry_week_overrides enable row level security;

drop policy if exists score_entry_week_overrides_select_all on public.score_entry_week_overrides;
create policy score_entry_week_overrides_select_all on public.score_entry_week_overrides for select using (true);

drop policy if exists score_entry_week_overrides_admin_all on public.score_entry_week_overrides;
create policy score_entry_week_overrides_admin_all on public.score_entry_week_overrides for all using (public.is_admin());

-- Rubbers: identical to 0013/0015's rubbers_team_write, with one added
-- clause in the non-admin branch -- the fixture's week must not be in
-- the future, unless overridden. admin's branch (public.is_admin())
-- is untouched, so admin keeps editing any week, any time, as before.
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
        and exists (
          select 1 from public.fixtures f
          where f.id = rubbers.fixture_id
            and f.finalized_at is null
            and (f.home_team_id = public.current_team_id() or f.away_team_id = public.current_team_id())
            and (
              f.week_date <= current_date
              or exists (
                select 1 from public.score_entry_week_overrides o
                where o.season_id = f.season_id and o.week_date = f.week_date
              )
            )
        )
      )
    )
  );

-- Ratings: identical to 0015's tie_player_ratings_write, with the same
-- future-week clause added. No is_admin() branch here at all, on
-- purpose -- admin has never been able to write ratings, and still
-- can't (that restriction is unrelated to this one).
drop policy if exists tie_player_ratings_write on public.tie_player_ratings;
create policy tie_player_ratings_write on public.tie_player_ratings for all
  using (
    rated_by_team_id = public.current_team_id()
    and exists (
      select 1 from public.fixtures f
      join public.players p on p.id = tie_player_ratings.rated_player_id
      where f.id = tie_player_ratings.fixture_id
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
        and (
          (f.home_team_id = tie_player_ratings.rated_by_team_id and p.team_id = f.away_team_id)
          or (f.away_team_id = tie_player_ratings.rated_by_team_id and p.team_id = f.home_team_id)
        )
        and (
          f.week_date <= current_date
          or exists (
            select 1 from public.score_entry_week_overrides o
            where o.season_id = f.season_id and o.week_date = f.week_date
          )
        )
    )
  );
