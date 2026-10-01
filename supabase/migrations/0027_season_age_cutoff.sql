-- Age eligibility (My Team): every player must be 40+ as of a fixed
-- per-season reference date, not "today" — otherwise eligibility would
-- silently change mid-season as time passes. age_cutoff_date is that
-- reference date, set per season (so "next season" just means creating
-- the new season with its own cutoff, e.g. a year later) and enforced
-- in manage-team-roster's validatePlayerFields.
alter table public.seasons add column if not exists age_cutoff_date date;
update public.seasons set age_cutoff_date = '2026-10-01' where age_cutoff_date is null;
alter table public.seasons alter column age_cutoff_date set not null;
