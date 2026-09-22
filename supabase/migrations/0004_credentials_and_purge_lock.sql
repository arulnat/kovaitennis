-- =====================================================================
-- Team login credentials + season purge lock
-- =====================================================================
-- team_credentials: kept in its OWN table rather than a column on
-- `teams`, because `teams_select_all` is a wide-open `using (true)`
-- policy (Req 10.5 public read) -- a plaintext password column there
-- would be publicly selectable via the anon key no matter what the app
-- code chooses to select (the same trap the existing "sensitive columns
-- masked at the application layer" comment on `teams`/`players` already
-- warns about). This table has NO public select policy at all -- only
-- is_admin() (and the service-role Edge Functions, which bypass RLS
-- entirely) can reach it.
create table if not exists public.team_credentials (
  team_id uuid primary key references public.teams(id) on delete cascade,
  default_password text not null,
  created_at timestamptz not null default now()
);
alter table public.team_credentials enable row level security;
drop policy if exists team_credentials_admin_all on public.team_credentials;
create policy team_credentials_admin_all on public.team_credentials for all using (public.is_admin());

-- purge_locked: the Seasons admin page now creates real seasons (not just
-- disposable Test Season sandboxes), so Purge Data is a much higher-stakes
-- action than before -- it can delete real fixtures/scores/placements.
-- Defaults LOCKED (opposite of divisions.order lock's default) so an
-- admin must deliberately unlock before a mis-click can purge anything.
alter table public.seasons add column if not exists purge_locked boolean not null default true;
