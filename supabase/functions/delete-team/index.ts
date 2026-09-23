// supabase/functions/delete-team/index.ts
//
// Admin-only full deletion of a team, only when it isn't placed in a
// division in any season (checked server-side as the real backstop — the
// Teams page also only shows/enables the button for a team that's
// unassigned in the currently selected season). Must be an Edge Function
// because deleting the team's login requires the service_role key
// (auth.admin.deleteUser) — the same reason bulk-create-teams/
// backfill-team-logins are Edge Functions rather than client-side calls.
//
// Deleting the auth user cascades to its app_users row (app_users.id
// references auth.users(id) on delete cascade); deleting `teams` itself
// cascades to players/team_players/team_seasons/team_credentials (all
// declared on delete cascade in the schema). Doing it in this order —
// login first, then the team row — means a failure partway through never
// leaves an orphaned login pointing at a team_id that no longer exists.
//
// Deploy: supabase functions deploy delete-team
// Call from the client with: supabase.functions.invoke('delete-team', { body: { teamId } })

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
    const { data: profile } = await callerClient.from('app_users').select('role').eq('id', user.id).single();
    if (!profile || !['tournament_admin', 'super_admin'].includes(profile.role)) {
      return json({ error: 'Admin role required' }, 403);
    }

    const { teamId } = await req.json();
    if (!teamId) {
      return json({ error: 'teamId is required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: team, error: teamErr } = await admin.from('teams').select('id, name').eq('id', teamId).single();
    if (teamErr || !team) {
      return json({ error: 'Team not found' }, 404);
    }

    // The real gate: not placed in a division in ANY season, not just the
    // one currently selected on the Teams page.
    const { count: groupedCount, error: groupedErr } = await admin
      .from('team_seasons')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .not('division_id', 'is', null);
    if (groupedErr) throw groupedErr;
    if (groupedCount > 0) {
      return json({ error: `"${team.name}" is placed in a division — remove it from Grouping first.` }, 409);
    }

    const { data: appUsers, error: appUsersErr } = await admin.from('app_users').select('id').eq('team_id', teamId);
    if (appUsersErr) throw appUsersErr;
    for (const appUser of appUsers ?? []) {
      const { error: deleteAuthErr } = await admin.auth.admin.deleteUser(appUser.id);
      if (deleteAuthErr) throw deleteAuthErr;
    }

    const { error: deleteTeamErr } = await admin.from('teams').delete().eq('id', teamId);
    if (deleteTeamErr) throw deleteTeamErr;

    return json({ deleted: team.name });
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
