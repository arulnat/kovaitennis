-- =====================================================================
-- Season-level "disable add player" switch
-- =====================================================================
-- Lets an admin freeze every team's roster size for a season: once on,
-- a captain (not admin) can no longer add a new player, and -- since a
-- delete immediately makes room to add one straight back -- can no
-- longer delete one either (the existing first-4-protected / captain-
-- can't-be-deleted rules still apply underneath this; this is an
-- additional, season-wide gate, not a replacement for them). Edit
-- (name/gender/DOB/coach/photo on an existing player) is unaffected --
-- only the roster's membership is frozen. Admin is always exempt, same
-- as every other roster_submitted-style lock in manage-team-roster.
-- Default false -- Req: "Default option is add player" (enabled).
-- =====================================================================

alter table public.seasons add column if not exists roster_additions_disabled boolean not null default false;
