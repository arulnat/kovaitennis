-- =====================================================================
-- Make Strategy Builder ratings optional, decoupled from finalization
-- =====================================================================
-- Correction from the previous migration's design: a tie now finalizes
-- on SCORES ALONE (all 3 rubbers scored) -- ratings are optional and no
-- longer part of the finalize condition, and no longer time-boxed by it
-- either. The opposing captain can give a rating whenever they like,
-- before or after the tie finalizes; admin still never can (unchanged).
-- =====================================================================

create or replace function public.maybe_finalize_fixture(p_fixture_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.fixtures
  set finalized_at = now()
  where id = p_fixture_id
    and finalized_at is null
    and (select count(*) from public.rubbers where fixture_id = p_fixture_id and winner_side is not null) = 3;
end;
$$;

-- Ratings: same opposing-captain-only condition as before, minus the
-- finalized_at check -- optional and not time-gated by scoring at all.
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
    )
  );
