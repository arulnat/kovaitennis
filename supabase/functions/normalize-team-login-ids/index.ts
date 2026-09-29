// supabase/functions/normalize-team-login-ids/index.ts
//
// Recomputes every team's login_id using the current rule — letters
// only, concatenated with nothing between them, lowercased (see
// generateLoginId in bulkUpload.js / bulk-create-teams) — and updates
// both the teams.login_id column and the team's Auth email to match, so
// a team created under an older scheme (or with a since-changed name)
// doesn't keep a stale login_id/email. Idempotent: a team whose
// login_id is already correct is left untouched, so running this again
// later (e.g. after new teams are added under a slightly different
// generation rule) only ever touches the stragglers.
//
// Two teams whose names collapse to the same new login_id (e.g. "CMTA
// A" and "CMTA-A" both -> "cmtaa") are left alone entirely and reported
// back, since applying one would just fail the other's unique
// constraint anyway — those need a manual rename first.
//
// Deploy: supabase functions deploy normalize-team-login-ids
// Call from the client with: supabase.functions.invoke('normalize-team-login-ids')

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateLoginId(teamName) {
  return teamName.replace(/[^a-zA-Z]/g, '').toLowerCase();
}

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

    // Compute every target up front so a collision is caught before
    // touching anything, not half-applied mid-run.
    const targets = (teams ?? []).map((t) => ({ ...t, newLoginId: generateLoginId(t.name) }));
    const countByNewId = new Map();
    for (const t of targets) countByNewId.set(t.newLoginId, (countByNewId.get(t.newLoginId) ?? 0) + 1);

    const updated = [];
    const skippedCollisions = [];
    const failures = [];

    for (const t of targets) {
      if (t.newLoginId === t.login_id) continue; // already correct
      if (countByNewId.get(t.newLoginId) > 1) {
        skippedCollisions.push(t.name);
        continue;
      }
      if (!t.newLoginId) {
        failures.push({ team: t.name, error: 'Team name has no letters at all — a login ID would be empty' });
        continue;
      }
      try {
        const { data: appUserRow } = await admin
          .from('app_users')
          .select('id')
          .eq('team_id', t.id)
          .eq('role', 'team')
          .maybeSingle();

        const { error: teamErr } = await admin.from('teams').update({ login_id: t.newLoginId }).eq('id', t.id);
        if (teamErr) throw teamErr;

        if (appUserRow) {
          const { error: authErr } = await admin.auth.admin.updateUserById(appUserRow.id, {
            email: `${t.newLoginId}@teams.internal`,
            email_confirm: true,
          });
          if (authErr) throw authErr;
        }

        updated.push({ team: t.name, oldLoginId: t.login_id, newLoginId: t.newLoginId });
      } catch (err) {
        failures.push({ team: t.name, error: err.message ?? String(err) });
      }
    }

    return json({ updated, skippedCollisions, failures });
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
