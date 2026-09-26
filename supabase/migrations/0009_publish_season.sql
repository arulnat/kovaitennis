-- =====================================================================
-- Publish Season — replaces per-division "Freeze" with one season-wide switch
-- =====================================================================
-- There was only ever one real freeze decision in practice: the season-
-- wide readiness gate (no team left unassigned, every division has
-- fixtures) already had to pass before ANY division could be frozen, so
-- a per-division fixtures_frozen flag added a UI step (freeze each
-- division one at a time) without ever actually being usable
-- independently per division. seasons.published replaces it: one
-- switch, gated by the same readiness checks, that opens scoring for
-- every division in the season at once and locks every division's
-- grouping so the roster the schedule was built from can't change out
-- from under it. Un-publishing does NOT unlock grouping — same as
-- un-freezing before, that stays a deliberate separate decision on the
-- Grouping page.
--
-- Backfill: a season counts as already published if ANY of its
-- divisions was already frozen under the old model — the most faithful
-- approximation available, since the old per-division flag has no
-- single "season is frozen" bit to carry over directly.
-- =====================================================================

alter table public.seasons add column if not exists published boolean not null default false;

update public.seasons s
set published = true
where exists (
  select 1 from public.divisions d where d.season_id = s.id and d.fixtures_frozen
);

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
      or (locked_at is null and exists (
        select 1 from public.fixtures f
        where f.id = rubbers.fixture_id
          and (f.home_team_id = public.current_team_id() or f.away_team_id = public.current_team_id())
      ))
    )
  );

alter table public.divisions drop column if exists fixtures_frozen;
