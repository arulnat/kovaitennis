-- =====================================================================
-- Public read for team_seasons / team_players (Req 10.5 gap)
-- =====================================================================
-- 0001_init.sql's own comment states the intent plainly: "teams/players/
-- fixtures/rubbers/standings/content are readable by anyone (Req 10.5)".
-- Standings needs team_seasons to know which teams belong to which
-- division, and Team Profile needs both team_seasons (division/status)
-- and team_players (season roster) -- but both tables were only ever
-- given a team_seasons_admin_all / team_players_admin_all policy
-- ("for all using (is_admin())"), with no public select policy at all.
-- That silently broke Standings for anyone not logged in as admin (it
-- would show every team with 0 played, since the team-id-to-division
-- lookup came back empty) -- easy to miss testing logged in as admin,
-- since is_admin() already satisfies the existing policy either way.
--
-- Adding a plain "for select using (true)" policy is additive: Postgres
-- combines multiple permissive policies for the same command with OR,
-- so this only ever widens SELECT, leaving insert/update/delete on both
-- tables exactly as admin-only as the existing policy already made them.
-- =====================================================================

create policy team_seasons_select_all on public.team_seasons for select using (true);
create policy team_players_select_all on public.team_players for select using (true);
