-- =====================================================================
-- Fixtures freeze (Req 5.2 gating)
-- =====================================================================
-- divisions.fixtures_frozen: once an admin freezes a division's
-- fixtures (a deliberate, confirmed action on the Fixtures page),
-- scores can be entered for it — before that, Update Scores/Score Entry
-- refuse to let anyone (captain or admin) enter a score, since the
-- schedule isn't final yet. Freezing also sets grouping_locked, so the
-- roster that schedule was built from can't change out from under it
-- (no adding/removing teams); un-freezing does NOT unlock grouping —
-- that stays a deliberate separate decision on the Grouping page.
-- Defaults unlocked/unfrozen, same as every lock in this app except
-- Purge Data.
-- =====================================================================

alter table public.divisions add column if not exists fixtures_frozen boolean not null default false;

-- Hard backstop: the app UI already refuses to show enabled score inputs
-- until a division is frozen, for admin too (see ScoreEntryPage.jsx) --
-- but that alone doesn't stop a direct write. This makes it a real rule:
-- NO row (insert or update) can land in `rubbers` unless the fixture's
-- division is frozen, admin included. The captain-specific conditions
-- (own fixture, not locked) still apply on top of that for non-admins.
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
      join public.divisions d on d.id = f.division_id
      where f.id = rubbers.fixture_id and d.fixtures_frozen
    )
    and (
      public.is_admin()
      or (locked_at is null and exists (
        select 1 from public.fixtures f
        where f.id = rubbers.fixture_id
          and (f.home_team_id = public.current_team_id() or f.away_team_id = public.current_team_id())
      ))
    )
  );
