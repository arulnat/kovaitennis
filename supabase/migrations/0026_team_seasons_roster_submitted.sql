-- My Team's "Submit" button: a team confirms its roster is complete
-- (every player has name/gender/date of birth/photo) for a season. The
-- public Teams directory only lists teams that have submitted — an
-- incomplete/placeholder-heavy roster never shows up there.
alter table public.team_seasons add column if not exists roster_submitted boolean not null default false;
alter table public.team_seasons add column if not exists roster_submitted_at timestamptz;
