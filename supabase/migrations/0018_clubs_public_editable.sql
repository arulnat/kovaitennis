-- =====================================================================
-- Clubs: RLS (was missing entirely), one-club-per-name, admin write
-- =====================================================================
-- `clubs` existed since 0001 but was never added to the RLS-enabled
-- list and never got a policy of its own -- with RLS off entirely,
-- Postgres' default is to allow anything through, so anon/authenticated
-- callers could already read AND write it via the REST API. This locks
-- it down properly: public read (same as teams/divisions), admin-only
-- write, matching the pattern used everywhere else.
--
-- Bulk upload and the Teams admin page both find-or-create a club by
-- name (case-insensitive) rather than ever letting two rows exist for
-- the same real club under slightly different casing -- the unique
-- index enforces that server-side too.
-- =====================================================================

alter table public.clubs enable row level security;

drop policy if exists clubs_select_all on public.clubs;
create policy clubs_select_all on public.clubs for select using (true);

drop policy if exists clubs_admin_write on public.clubs;
create policy clubs_admin_write on public.clubs for all
  using (public.is_admin())
  with check (public.is_admin());

create unique index if not exists clubs_name_unique_ci on public.clubs (lower(name));
