// supabase/functions/manage-team-roster/index.ts
//
// Self-service for a team captain: rename an existing player (e.g. the
// "Player 1"/"Player 2"/"Player 3" placeholders bulk upload creates), or
// add a new one to their own roster for a season. players/team_players
// are admin-only tables under RLS (see 0001_init.sql's players_admin_write
// / players_admin_update / team_players_admin_all), so this is the one
// sanctioned way a team login can touch its own roster — the caller's
// team_id always comes from their own app_users row, never from the
// request body, so a team can only ever act on its own players.
//
// Deploy: supabase functions deploy manage-team-roster
// Call from the client with:
//   supabase.functions.invoke('manage-team-roster', { body: { action: 'rename', playerId, name } })
//   supabase.functions.invoke('manage-team-roster', { body: { action: 'add', seasonId, name } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Not authenticated' }, 401);
    }
    const { data: profile } = await callerClient.from('app_users').select('role, team_id').eq('id', user.id).single();
    if (!profile || profile.role !== 'team' || !profile.team_id) {
      return json({ error: 'Team login required' }, 403);
    }
    const teamId = profile.team_id;

    const body = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (body.action === 'rename') {
      const { playerId } = body;
      const name = String(body.name ?? '').trim();
      if (!playerId || !name) return json({ error: 'playerId and name are required' }, 400);

      const { data: player } = await admin.from('players').select('id, team_id').eq('id', playerId).maybeSingle();
      if (!player || player.team_id !== teamId) {
        return json({ error: 'Player not found on your team' }, 404);
      }

      const { error } = await admin.from('players').update({ name }).eq('id', playerId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === 'add') {
      const { seasonId } = body;
      const name = String(body.name ?? '').trim();
      if (!seasonId || !name) return json({ error: 'seasonId and name are required' }, 400);

      const { data: teamSeason } = await admin
        .from('team_seasons')
        .select('id')
        .eq('season_id', seasonId)
        .eq('team_id', teamId)
        .maybeSingle();
      if (!teamSeason) return json({ error: 'Your team is not registered for this season' }, 404);

      const { data: newPlayer, error: playerErr } = await admin
        .from('players')
        .insert({ team_id: teamId, name })
        .select()
        .single();
      if (playerErr) throw playerErr;

      const { error: tpErr } = await admin
        .from('team_players')
        .insert({ season_id: seasonId, team_id: teamId, player_id: newPlayer.id });
      if (tpErr) throw tpErr;

      return json({ ok: true, player: newPlayer });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: err.message ?? String(err) }, 500);
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
