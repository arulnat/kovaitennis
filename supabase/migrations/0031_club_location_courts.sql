-- =====================================================================
-- Club location, address, and court details
-- =====================================================================
-- Where a club actually plays, and how much court capacity it has —
-- shown on the club's own public page and on every one of its teams'
-- profile pages. number_of_courts/court_type are plain descriptive
-- fields (not enforced anywhere in scheduling yet); court_type is one
-- of synthetic/clay/both, matching the admin's three-option picker.
-- =====================================================================

alter table public.clubs add column if not exists location text;
alter table public.clubs add column if not exists address text;
alter table public.clubs add column if not exists number_of_courts integer;
alter table public.clubs add column if not exists court_type text check (court_type in ('synthetic', 'clay', 'both'));
