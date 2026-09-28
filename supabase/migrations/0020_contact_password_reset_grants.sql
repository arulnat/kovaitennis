-- =====================================================================
-- Fix: anon/authenticated never had a base INSERT grant at all
-- =====================================================================
-- Every other public-write policy in this schema (teams, players,
-- audit_log, app_users) requires public.is_admin() or auth.uid(), i.e.
-- an AUTHENTICATED caller — 0019's contact_messages/password_reset_
-- requests were the first ones meant to accept a genuinely anonymous
-- INSERT. Postgres reports a missing base GRANT with the exact same
-- SQLSTATE (42501) and near-identical wording as a failed RLS check, so
-- "new row violates row-level security policy" from 0019 was actually
-- this: `anon` (and it turns out `authenticated`, which apparently only
-- ever got table-level SELECT here, write access going through admin-
-- checked policies instead) never had INSERT granted on these two new
-- tables at all -- the policy's `with check (true)` was never reached.
-- =====================================================================

grant insert on public.contact_messages to anon, authenticated;
grant insert on public.password_reset_requests to anon, authenticated;
