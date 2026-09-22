-- =====================================================================
-- Season holiday weekends
-- =====================================================================
-- A season-wide list of weekend dates when no matches are played (public
-- holidays, planned breaks, or added later for a rain-out). Fixture
-- generation skips these dates when laying out round week_dates, moving
-- to the next weekend instead. Season-wide (not per-division) because a
-- holiday affects every division's calendar the same way.
-- =====================================================================

create table if not exists public.season_holidays (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  holiday_date date not null,
  created_at timestamptz not null default now(),
  unique (season_id, holiday_date)
);

alter table public.season_holidays enable row level security;

drop policy if exists season_holidays_select_all on public.season_holidays;
create policy season_holidays_select_all on public.season_holidays for select using (true);

drop policy if exists season_holidays_admin_all on public.season_holidays;
create policy season_holidays_admin_all on public.season_holidays for all using (public.is_admin());
