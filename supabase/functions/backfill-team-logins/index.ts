// supabase/functions/backfill-team-logins/index.ts
//
// One-off catch-up for teams created before bulk-create-teams was wired
// up: BulkUploadPage used to insert the `teams` row client-side without
// ever creating a real Supabase Auth account or app_users row, so those
// teams have a login_id but no way to actually log in, and no stored
// password. This finds every team missing an app_users row and gives it
// a real login — same steps bulk-create-teams takes for a brand new team,
// minus creating the team/player rows (which already exist).
//
// Deploy: supabase functions deploy backfill-team-logins
// Call from the client with: supabase.functions.invoke('backfill-team-logins')
// Admin-only, enforced the same way as bulk-create-teams below.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// The browser calls this cross-origin (app origin -> *.supabase.co), so it
// needs its own CORS handling — Supabase's gateway doesn't add this for you.
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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: teams, error: teamsErr } = await admin.from('teams').select('id, name, login_id');
    if (teamsErr) throw teamsErr;

    const { data: loggedInTeamIds, error: appUsersErr } = await admin
      .from('app_users')
      .select('team_id')
      .not('team_id', 'is', null);
    if (appUsersErr) throw appUsersErr;

    const hasLogin = new Set((loggedInTeamIds ?? []).map((r) => r.team_id));
    const missing = (teams ?? []).filter((t) => !hasLogin.has(t.id));

    const updated = [];
    const failures = [];

    for (const team of missing) {
      try {
        const defaultPassword = generateDefaultPassword();
        const email = `${team.login_id}@teams.internal`;

        const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true,
        });
        if (authErr) throw authErr;

        const { error: appUserErr } = await admin.from('app_users').insert({
          id: authUser.user.id,
          role: 'team',
          team_id: team.id,
          must_change_password: true,
        });
        if (appUserErr) throw appUserErr;

        const { error: credErr } = await admin
          .from('team_credentials')
          .upsert({ team_id: team.id, default_password: defaultPassword });
        if (credErr) throw credErr;

        updated.push({ teamName: team.name, loginId: team.login_id, defaultPassword });
      } catch (err) {
        failures.push({ team: team.name, error: err.message ?? String(err) });
      }
    }

    return json({ updated, failures });
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

function generateDefaultPassword() {
  const words = ['ace', 'lob', 'volley', 'serve', 'court', 'match', 'rally', 'smash'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}${num}`;
}
