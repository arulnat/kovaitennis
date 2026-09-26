-- =====================================================================
-- Auto-finalize a tie once scores + both captains' ratings are all in
-- =====================================================================
-- Captains have no direct UPDATE access to `fixtures` (only fixtures_
-- admin_all exists), and computing "is this tie fully done" correctly
-- needs the actual set of players who played (from `rubbers`) cross-
-- checked against `tie_player_ratings` -- not something to trust a
-- client-side JS recomputation to get right and RLS to just take on
-- faith. A trigger recomputes it server-side after every rubber or
-- rating write and stamps fixtures.finalized_at itself, `security
-- definer` so it can write that one column despite the caller having no
-- general UPDATE rights on fixtures.
-- =====================================================================

create or replace function public.maybe_finalize_fixture(p_fixture_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_home_team uuid;
  v_away_team uuid;
  v_rubbers_done boolean;
  v_home_players uuid[];
  v_away_players uuid[];
  v_home_side_rated boolean;
  v_away_side_rated boolean;
begin
  select home_team_id, away_team_id into v_home_team, v_away_team
  from public.fixtures where id = p_fixture_id and finalized_at is null;

  if v_home_team is null then
    return; -- fixture not found, or already finalized -- nothing to do
  end if;

  select count(*) = 3 into v_rubbers_done
  from public.rubbers where fixture_id = p_fixture_id and winner_side is not null;

  if not v_rubbers_done then
    return;
  end if;

  select array_agg(distinct pid) into v_home_players from (
    select home_player1_id as pid from public.rubbers where fixture_id = p_fixture_id and home_player1_id is not null
    union
    select home_player2_id from public.rubbers where fixture_id = p_fixture_id and home_player2_id is not null
  ) x;

  select array_agg(distinct pid) into v_away_players from (
    select away_player1_id as pid from public.rubbers where fixture_id = p_fixture_id and away_player1_id is not null
    union
    select away_player2_id from public.rubbers where fixture_id = p_fixture_id and away_player2_id is not null
  ) x;

  -- The away captain rates the home players who played; the home
  -- captain rates the away players who played. Both sets must be fully
  -- rated (an empty player set counts as fully rated -- nothing to do).
  select coalesce(array_length(v_home_players, 1), 0) <= (
    select count(*) from public.tie_player_ratings
    where fixture_id = p_fixture_id and rated_by_team_id = v_away_team and rated_player_id = any(v_home_players)
  ) into v_away_side_rated;

  select coalesce(array_length(v_away_players, 1), 0) <= (
    select count(*) from public.tie_player_ratings
    where fixture_id = p_fixture_id and rated_by_team_id = v_home_team and rated_player_id = any(v_away_players)
  ) into v_home_side_rated;

  if v_away_side_rated and v_home_side_rated then
    update public.fixtures set finalized_at = now() where id = p_fixture_id and finalized_at is null;
  end if;
end;
$$;

create or replace function public.trg_maybe_finalize() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.maybe_finalize_fixture(coalesce(new.fixture_id, old.fixture_id));
  return null;
end;
$$;

drop trigger if exists rubbers_maybe_finalize on public.rubbers;
create trigger rubbers_maybe_finalize
  after insert or update on public.rubbers
  for each row execute function public.trg_maybe_finalize();

drop trigger if exists ratings_maybe_finalize on public.tie_player_ratings;
create trigger ratings_maybe_finalize
  after insert or update on public.tie_player_ratings
  for each row execute function public.trg_maybe_finalize();
