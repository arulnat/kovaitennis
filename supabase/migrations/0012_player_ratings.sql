-- =====================================================================
-- Player performance ratings (serve/volley/forehand/backhand/fitness)
-- =====================================================================
-- Separate table, not columns on `players`, specifically so a captain
-- can be given write access to just these five numbers without also
-- opening up the rest of that row (date_of_birth, id_proof_*, etc.),
-- which stays admin-only. 5-10 scale per the user's own spec.
--
-- Editable by an admin, or by the captain of the player's own team
-- (players.team_id is the persistent team a player belongs to, not
-- season-scoped) -- "any one" of those two, not a public write.
-- Publicly readable like the rest of a player's basic info (Req 10.5),
-- so it can show on that team's Team Profile page for anyone to see.
-- =====================================================================

create table if not exists public.player_ratings (
  player_id uuid primary key references public.players(id) on delete cascade,
  rating_serve smallint check (rating_serve between 5 and 10),
  rating_volley smallint check (rating_volley between 5 and 10),
  rating_forehand smallint check (rating_forehand between 5 and 10),
  rating_backhand smallint check (rating_backhand between 5 and 10),
  rating_fitness smallint check (rating_fitness between 5 and 10),
  updated_at timestamptz not null default now()
);

alter table public.player_ratings enable row level security;

drop policy if exists player_ratings_select_all on public.player_ratings;
create policy player_ratings_select_all on public.player_ratings for select using (true);

drop policy if exists player_ratings_write on public.player_ratings;
create policy player_ratings_write on public.player_ratings for all
  using (
    public.is_admin()
    or exists (select 1 from public.players p where p.id = player_ratings.player_id and p.team_id = public.current_team_id())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.players p where p.id = player_ratings.player_id and p.team_id = public.current_team_id())
  );
