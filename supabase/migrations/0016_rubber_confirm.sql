-- =====================================================================
-- Two-stage score entry: Save is a draft, Update commits it
-- =====================================================================
-- Save alone (upsert from Score Entry) records the set scores, players,
-- and derived winner_side, but leaves confirmed_at null -- a preview
-- only, not yet counted anywhere. Clicking Update stamps confirmed_at,
-- which is what the tie score tally, team standings, and Rising Stars
-- now require in addition to winner_side. Any later re-save of the same
-- rubber (a correction) resets confirmed_at back to null, so a stale
-- confirmation can never outlive the score it was given for -- it has
-- to be re-confirmed via Update.
-- =====================================================================

alter table public.rubbers add column if not exists confirmed_at timestamptz;

comment on column public.rubbers.confirmed_at is
  'Set only by the explicit "Update" action in Score Entry -- this is what counts the rubber toward the tie score tally, team standings, and individual (Rising Stars) stats. Null while a saved score is still a draft, and reset to null by any subsequent save of the same rubber.';

-- Finalization now waits on all 3 rubbers being CONFIRMED, not merely
-- saved -- a draft score shouldn't be able to lock the tie shut.
create or replace function public.maybe_finalize_fixture(p_fixture_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.fixtures
  set finalized_at = now()
  where id = p_fixture_id
    and finalized_at is null
    and (select count(*) from public.rubbers where fixture_id = p_fixture_id and confirmed_at is not null) = 3;
end;
$$;
