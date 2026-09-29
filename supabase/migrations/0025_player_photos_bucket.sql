-- Storage bucket for player roster photos (My Roster page). Uploads go
-- through the manage-team-roster Edge Function using the service_role
-- key, which bypasses Storage RLS entirely, so no storage.objects
-- policies are needed for writes. Marking the bucket public means reads
-- work via the plain public URL (getPublicUrl) with no auth needed,
-- consistent with player names/data already being publicly readable
-- elsewhere (Req 10.5) — same visibility level, just a photo instead of
-- text.
insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', true)
on conflict (id) do nothing;
