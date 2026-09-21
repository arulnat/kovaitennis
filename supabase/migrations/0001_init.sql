-- =====================================================================
-- Tennis League App — Initial Schema (MVP scope, Requirements v6)
-- =====================================================================
-- Scope notes:
--   * Fields that belong to the deferred self-registration flow (photo,
--     date_of_birth, address-proof type/number/image, GPS, court details,
--     fee/payment records) are included as NULLABLE columns so the schema
--     does not need to change when that work (Priority: MP) is built —
--     but nothing here is NOT NULL for them, per "don't keep those
--     mandatory fields" for the MVP cut.
--   * Sensitive columns (id_proof_*, contact numbers) are still isolated
--     behind RLS so that when they ARE populated later, exposure rules
--     already hold (Req 11).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Roles / auth support
-- ---------------------------------------------------------------------
-- Supabase Auth (auth.users) handles credentials. This table maps an
-- auth user to an application role and, for team accounts, to a team.
do $$ begin
  create type app_role as enum ('super_admin', 'tournament_admin', 'team');
exception when duplicate_object then null;
end $$;

create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null,
  team_id uuid null,               -- set only when role = 'team'
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Persistent entities (never re-entered season to season)
-- ---------------------------------------------------------------------
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  login_id text not null unique,          -- generated from team name (Req 2.2)
  club_id uuid references public.clubs(id),

  -- Deferred (MP) self-registration fields — nullable by design
  photo_url text,
  address text,
  gps_lat numeric,
  gps_lng numeric,
  court_type text check (court_type in ('clay', 'synthetic', 'both')),
  num_courts integer,

  captain_name text not null,
  captain_phone text not null,
  alternate_contact_phone text,           -- Req 1.4 — number only, no name

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  gender text check (gender in ('male', 'female', 'other')),

  -- Deferred (MP) fields — nullable
  date_of_birth date,
  photo_url text,
  id_proof_type text check (id_proof_type in ('aadhaar', 'driving_licence', 'pan_card')),
  id_proof_number text,
  id_proof_image_url text,
  age_flagged_under_40 boolean not null default false,  -- Req 1.9, computed when DOB present

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.players.date_of_birth is
  'Nullable in MVP (bulk-upload has no DOB per scope decision). Age is always '
  'computed live from this column when present — never cached (Req 1.6).';

-- ---------------------------------------------------------------------
-- Season-scoped entities
-- ---------------------------------------------------------------------
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,                     -- e.g. "2027 League"
  is_test boolean not null default false, -- Req 17
  start_weekend date not null,            -- Saturday date (Req 3.1, 4.2)
  registration_fee numeric not null default 1000,   -- Req 2.5 (MP feature, kept for schema stability)
  player_fee numeric not null default 500,
  final_results_approved boolean not null default false,
  champion_singles_winner_id uuid references public.players(id),
  champion_singles_runnerup_id uuid references public.players(id),
  champion_doubles_winner_ids uuid[],     -- pair, Req 6.11
  champion_doubles_runnerup_ids uuid[],
  created_at timestamptz not null default now()
);

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,                     -- e.g. "Division A"
  created_at timestamptz not null default now(),
  unique (season_id, name)
);

-- which team is in which division this season, or withdrawn; status flags
do $$ begin
  create type team_season_status as enum (
    'placed', 'withdrawn', 'promoted', 'relegated', 'new'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.team_seasons (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  division_id uuid references public.divisions(id),
  status team_season_status not null default 'new',   -- drives 3.5.5 highlighting
  approved boolean not null default false,             -- Req 2.10 (MP)
  fee_paid boolean not null default false,              -- Req 2.7-2.8 (MP)
  payment_proof_url text,                                -- (MP)
  created_at timestamptz not null default now(),
  unique (season_id, team_id)
);

comment on column public.team_seasons.status is
  'new | placed | promoted | relegated | withdrawn — drives the '
  'color-coded highlight on the division-placement screen (Req 3.5.5).';

-- roster membership per season (who's eligible to play, this season)
create table if not exists public.team_players (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  added_by_admin_after_lock boolean not null default false,  -- Req 2.9
  created_at timestamptz not null default now(),
  unique (season_id, player_id)
);

-- ---------------------------------------------------------------------
-- Fixtures & Rubbers
-- ---------------------------------------------------------------------
do $$ begin
  create type fixture_status as enum ('scheduled', 'released', 'in_progress', 'complete', 'locked');
exception when duplicate_object then null;
end $$;

create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete cascade,
  round_number integer not null,           -- which week, 1-based
  week_date date not null,                 -- the Saturday of that round (Req 4.2)
  home_team_id uuid references public.teams(id),   -- null when this row represents a bye
  away_team_id uuid references public.teams(id),
  is_bye boolean not null default false,
  status fixture_status not null default 'scheduled',
  released_at timestamptz,
  deadline_extended_to date,               -- Req 5.1 rain extension, applies week-wide
  created_at timestamptz not null default now()
);

create index if not exists idx_fixtures_season_division_round on public.fixtures(season_id, division_id, round_number);

do $$ begin
  create type rubber_type as enum ('singles', 'doubles1', 'doubles2');
exception when duplicate_object then null;
end $$;

create table if not exists public.rubbers (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  rubber_type rubber_type not null,

  -- player selections (doubles has 2 per side; singles has 1 per side)
  home_player1_id uuid references public.players(id),
  home_player2_id uuid references public.players(id),  -- null for singles
  away_player1_id uuid references public.players(id),
  away_player2_id uuid references public.players(id),  -- null for singles

  -- set scores, stored as small ints. Singles uses only set1 (Req 5.3 —
  -- the whole rubber is one set, recorded as "7-6" if decided by the
  -- 10-pt breaker). Doubles uses set1 + set2, and set3 ONLY when the
  -- match reaches 1-1 after two sets, holding the 10-pt super-tiebreak
  -- recorded as a set score e.g. "10-8" (Req 5.4) — it functions as the
  -- match's decisive 3rd set for standings purposes.
  set1_home integer, set1_away integer,
  set2_home integer, set2_away integer,   -- doubles only
  set3_home integer, set3_away integer,   -- doubles super-tiebreak decider only

  is_walkover boolean not null default false,
  walkover_winner_side text check (walkover_winner_side in ('home', 'away')),

  time_played_minutes integer check (time_played_minutes is null or (time_played_minutes >= 0 and time_played_minutes <= 180)),  -- Req 5.9, 3-hour cap

  winner_side text check (winner_side in ('home', 'away')),  -- derived, stored for query speed

  entered_by uuid references public.app_users(id),
  completed_at timestamptz,               -- set once this rubber has a full score
  locked_at timestamptz,                  -- set 7 days after the *tie* completes (Req 5.7)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (fixture_id, rubber_type)
);

comment on column public.rubbers.locked_at is
  'Copied onto every rubber of a fixture once all 3 are entered and the '
  '7-day edit window (Req 5.7) starts; null while still open. Admin can '
  'still edit at any time regardless (enforced in app logic / RLS, not here).';

-- ---------------------------------------------------------------------
-- Audit log (Req 5.8, 10.x) — every submit/edit/override
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.app_users(id),
  action text not null,                    -- e.g. 'rubber.edit', 'fixture.release'
  entity_type text not null,
  entity_id uuid not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Content (Req 13) — HP items only: Rules & Regs, Welcome Note
-- ---------------------------------------------------------------------
create table if not exists public.content_pages (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id),   -- null for evergreen content like Rules
  page_type text not null check (page_type in ('rules_and_regulations', 'welcome_note')),
  title text not null,
  body_html text not null,        -- rendered HTML (uploaded doc converted on upload)
  source_file_url text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Postgres treats every NULL as distinct for uniqueness, so a plain
  -- unique(page_type, season_id) would NOT stop duplicate rows for
  -- evergreen content (season_id always NULL, e.g. Rules & Regulations)
  -- — every save would insert a new row instead of updating one. This
  -- generated column substitutes a fixed sentinel for NULL so ON
  -- CONFLICT can target a real, non-partial unique index.
  season_key uuid generated always as (coalesce(season_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  unique (page_type, season_key)
);

-- ---------------------------------------------------------------------
-- Views: live-computed standings (Req 6 — computed at query time, never
-- cached, so a mid-edit-window correction is reflected immediately)
-- ---------------------------------------------------------------------
create or replace view public.v_team_standings as
with rubber_results as (
  select
    f.season_id, f.division_id, f.id as fixture_id,
    f.home_team_id, f.away_team_id,
    r.rubber_type, r.winner_side,
    r.set1_home, r.set1_away, r.set2_home, r.set2_away
  from public.rubbers r
  join public.fixtures f on f.id = r.fixture_id
  where r.winner_side is not null
),
tie_results as (
  -- a tie's outcome = which side won 2+ of the 3 rubbers
  select
    fixture_id, season_id, division_id, home_team_id, away_team_id,
    count(*) filter (where winner_side = 'home') as home_rubbers_won,
    count(*) filter (where winner_side = 'away') as away_rubbers_won,
    count(*) as rubbers_scored
  from rubber_results
  group by fixture_id, season_id, division_id, home_team_id, away_team_id
),
completed_ties as (
  select *,
    case when home_rubbers_won > away_rubbers_won then home_team_id
         when away_rubbers_won > home_rubbers_won then away_team_id
         else null end as winning_team_id
  from tie_results
  where rubbers_scored = 3   -- only count once the full tie is in
),
per_team_ties as (
  select season_id, division_id, home_team_id as team_id,
         (winning_team_id = home_team_id) as won
  from completed_ties
  union all
  select season_id, division_id, away_team_id as team_id,
         (winning_team_id = away_team_id) as won
  from completed_ties
),
set_game_tally as (
  select
    f.season_id, f.division_id,
    case when r.winner_side is not null then f.home_team_id end as home_for_id,
    case when r.winner_side is not null then f.away_team_id end as away_for_id,
    r.set1_home, r.set1_away, r.set2_home, r.set2_away
  from public.rubbers r
  join public.fixtures f on f.id = r.fixture_id
  where r.winner_side is not null
)
select
  pt.season_id, pt.division_id, pt.team_id,
  count(*) as played,
  count(*) filter (where pt.won) as wins,
  count(*) filter (where not pt.won) as losses,
  count(*) filter (where pt.won) as points   -- Req 6.2: 1 point per win
from per_team_ties pt
group by pt.season_id, pt.division_id, pt.team_id;

comment on view public.v_team_standings is
  'Base counts only (played/wins/losses/points). Sets/games diff and full '
  'tiebreak cascades (Req 6.3-6.4) are computed in application code '
  '(src/lib/standings.js) since they need per-set arithmetic more '
  'naturally expressed there; this view supplies the raw per-tie facts.';

-- =====================================================================
-- Row Level Security (Req 10, 11)
-- =====================================================================
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.divisions enable row level security;
alter table public.team_seasons enable row level security;
alter table public.team_players enable row level security;
alter table public.fixtures enable row level security;
alter table public.rubbers enable row level security;
alter table public.audit_log enable row level security;
alter table public.content_pages enable row level security;
alter table public.app_users enable row level security;

-- Helper: current user's role/team, read from app_users.
--
-- IMPORTANT: these MUST be SECURITY DEFINER. Without it, is_admin() calls
-- current_role() which queries app_users — and that inner query is itself
-- subject to app_users' own RLS policy (app_users_self_or_admin), which
-- calls is_admin() again, which calls current_role() again... infinite
-- recursion the first time anyone checks a row that isn't their own.
-- SECURITY DEFINER makes these functions run as their owner (bypassing
-- RLS on the internal lookup), breaking that cycle. search_path is
-- pinned explicitly, which is required for SECURITY DEFINER functions to
-- avoid a class of schema-hijacking attacks.
create or replace function public.current_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.app_users where id = auth.uid();
$$;

create or replace function public.current_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.app_users where id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() in ('tournament_admin', 'super_admin');
$$;

revoke all on function public.current_role() from public;
revoke all on function public.current_team_id() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_role() to authenticated, anon;
grant execute on function public.current_team_id() to authenticated, anon;
grant execute on function public.is_admin() to authenticated, anon;

-- Public read: teams/players/fixtures/rubbers/standings/content are
-- readable by anyone (Req 10.5) EXCEPT the sensitive columns, which are
-- masked at the application layer (never selected for anon role) rather
-- than hidden per-row, since the row itself (team name, photo, stats) is
-- meant to be public — only specific columns are not (Req 11.2).
drop policy if exists teams_select_all on public.teams;
create policy teams_select_all on public.teams for select using (true);
drop policy if exists players_select_all on public.players;
create policy players_select_all on public.players for select using (true);
drop policy if exists seasons_select_public on public.seasons;
create policy seasons_select_public on public.seasons for select using (is_test = false or public.is_admin());
drop policy if exists divisions_select_all on public.divisions;
create policy divisions_select_all on public.divisions for select using (true);
drop policy if exists fixtures_select_released on public.fixtures;
create policy fixtures_select_released on public.fixtures for select
  using (status <> 'scheduled' or public.is_admin() or home_team_id = public.current_team_id() or away_team_id = public.current_team_id());
drop policy if exists rubbers_select_all on public.rubbers;
create policy rubbers_select_all on public.rubbers for select using (true);
drop policy if exists content_select_published on public.content_pages;
create policy content_select_published on public.content_pages for select
  using (published = true or public.is_admin());

-- Team writes: a captain can insert/update rubbers only for their own
-- fixture, and only while not locked (app also enforces the 7-day
-- window and week deadline; RLS provides the hard backstop)
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
    public.is_admin()
    or (locked_at is null and exists (
      select 1 from public.fixtures f
      where f.id = rubbers.fixture_id
        and (f.home_team_id = public.current_team_id() or f.away_team_id = public.current_team_id())
    ))
  );

-- Admin-only writes on everything else
drop policy if exists teams_admin_write on public.teams;
create policy teams_admin_write on public.teams for insert with check (public.is_admin());
drop policy if exists teams_admin_update on public.teams;
create policy teams_admin_update on public.teams for update using (public.is_admin());
drop policy if exists players_admin_write on public.players;
create policy players_admin_write on public.players for insert with check (public.is_admin());
drop policy if exists players_admin_update on public.players;
create policy players_admin_update on public.players for update using (public.is_admin());
drop policy if exists seasons_admin_all on public.seasons;
create policy seasons_admin_all on public.seasons for all using (public.is_admin());
drop policy if exists divisions_admin_all on public.divisions;
create policy divisions_admin_all on public.divisions for all using (public.is_admin());
drop policy if exists team_seasons_admin_all on public.team_seasons;
create policy team_seasons_admin_all on public.team_seasons for all using (public.is_admin());
drop policy if exists team_players_admin_all on public.team_players;
create policy team_players_admin_all on public.team_players for all using (public.is_admin());
drop policy if exists fixtures_admin_all on public.fixtures;
create policy fixtures_admin_all on public.fixtures for all using (public.is_admin());
drop policy if exists content_admin_all on public.content_pages;
create policy content_admin_all on public.content_pages for all using (public.is_admin());
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select using (public.is_admin());
drop policy if exists audit_insert_any_authenticated on public.audit_log;
create policy audit_insert_any_authenticated on public.audit_log for insert with check (auth.uid() is not null);
drop policy if exists app_users_self_or_admin on public.app_users;
create policy app_users_self_or_admin on public.app_users for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists app_users_admin_write on public.app_users;
create policy app_users_admin_write on public.app_users for insert with check (public.is_admin());
drop policy if exists app_users_self_update on public.app_users;
create policy app_users_self_update on public.app_users for update
  using (id = auth.uid() or public.is_admin());

-- Test Season isolation (Req 17.5): a query helper the app uses to
-- exclude is_test seasons from any public/Hall-of-Fame aggregate.
create or replace view public.v_real_seasons as
  select * from public.seasons where is_test = false;
