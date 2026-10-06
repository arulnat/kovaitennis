-- =====================================================================
-- Captain address-proof photo
-- =====================================================================
-- Same storage shape as players.photo_url (a public URL into the
-- "player-photos" bucket, migration 0025) -- manage-team-roster
-- applies the exact same <100KB upload rule to it. Scoped to the
-- captain's own row in the UI (it's the team's address being proven,
-- and the captain is the one identity that always exists on a team),
-- but left unconstrained at the DB level rather than CHECK-ing
-- is_captain, same as photo_url itself.
-- =====================================================================

alter table public.players add column if not exists address_proof_url text;
