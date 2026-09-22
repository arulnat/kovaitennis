// supabase/functions/bulk-create-teams/index.ts
//
// Req 2.1–2.2: takes already-validated team+roster data (see
// src/lib/bulkUpload.js -> validateBulkUpload, run client-side first) and
// creates, for each team: the team row, player rows, season membership,
// a real Supabase Auth account, and the matching app_users row with
// role='team' — all server-side, using the service_role key, which is
// why this MUST be an Edge Function and not a client-side call.
//
// Deploy: supabase functions deploy bulk-create-teams
// Call from the client with: supabase.functions.invoke('bulk-create-teams', { body: { seasonId, teams } })
// The caller's own JWT is checked below to require an admin role before
// anything runs — the service_role key alone is not an access check.

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

    // Verify the caller is actually an admin before doing anything
    // privileged — the service_role client below bypasses RLS entirely,
    // so this check is the only thing standing in for it.
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Not authenticated' }, 401);
    }
    const { data: profile } = await callerClient.from('app_users').select('role').eq('id', user.id).single();
    if (!profile || !['tournament_admin', 'super_admin'].includes(profile.role)) {
      return json({ error: 'Admin role required' }, 403);
    }

    const { seasonId, teams } = await req.json();
    if (!seasonId || !Array.isArray(teams) || teams.length === 0) {
      return json({ error: 'seasonId and a non-empty teams array are required' }, 400);
    }

    // Admin client: service_role bypasses RLS, used only for the
    // privileged operations below (auth.admin.createUser + the inserts
    // that follow it in the same transaction-like sequence).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const created = [];
    const failures = [];

    for (const team of teams) {
      try {
        const loginId = generateLoginId(team.teamName);
        const defaultPassword = generateDefaultPassword();
        const email = `${loginId}@teams.internal`;

        // 1. Create the team row
        const { data: teamRow, error: teamErr } = await admin
          .from('teams')
          .insert({
            name: team.teamName,
            login_id: loginId,
            captain_name: team.captainName,
            captain_phone: team.captainPhone,
          })
          .select()
          .single();
        if (teamErr) throw teamErr;

        // 2. Create the players + season roster membership
        const { data: playerRows, error: playersErr } = await admin
          .from('players')
          .insert(team.players.map((p) => ({ team_id: teamRow.id, name: p.name, gender: p.gender })))
          .select();
        if (playersErr) throw playersErr;

        const { error: tpErr } = await admin
          .from('team_players')
          .insert(playerRows.map((p) => ({ season_id: seasonId, team_id: teamRow.id, player_id: p.id })));
        if (tpErr) throw tpErr;

        const { error: tsErr } = await admin
          .from('team_seasons')
          .insert({ season_id: seasonId, team_id: teamRow.id, status: 'new' });
        if (tsErr) throw tsErr;

        // 3. Create the actual Supabase Auth account (Req 2.2) — this is
        // the step the client-side version of this page was missing.
        const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true, // no email verification flow for team logins
        });
        if (authErr) throw authErr;

        // 4. Create the matching app_users row — role='team',
        // must_change_password=true forces the first-login reset (Req 2.3)
        const { error: appUserErr } = await admin.from('app_users').insert({
          id: authUser.user.id,
          role: 'team',
          team_id: teamRow.id,
          must_change_password: true,
        });
        if (appUserErr) throw appUserErr;

        // 5. Persist the default password (Login Credentials admin page
        // reads this back later) — in its own RLS-locked table, never on
        // `teams` itself, which is publicly selectable (Req 10.5).
        const { error: credErr } = await admin
          .from('team_credentials')
          .insert({ team_id: teamRow.id, default_password: defaultPassword });
        if (credErr) throw credErr;

        created.push({ teamName: team.teamName, loginId, defaultPassword });
      } catch (err) {
        failures.push({ team: team.teamName, error: err.message ?? String(err) });
      }
    }

    return json({ created, failures });
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

function generateLoginId(teamName) {
  return teamName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function generateDefaultPassword() {
  const words = ['ace', 'lob', 'volley', 'serve', 'court', 'match', 'rally', 'smash'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}${num}`;
}