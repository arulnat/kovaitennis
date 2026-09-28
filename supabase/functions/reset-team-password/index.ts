// supabase/functions/reset-team-password/index.ts
//
// Admin-only: generates a new default password for a team's existing
// login and sets it directly via the Auth admin API (auth.admin.
// updateUserById), forcing a change on next login — same shape as a
// freshly created team's first password. This is how a Forgot Password
// request (see password_reset_requests) actually gets resolved, since
// team accounts use a synthetic email with nowhere real to send a reset
// link.
//
// Deploy: supabase functions deploy reset-team-password
// Call from the client with: supabase.functions.invoke('reset-team-password', { body: { teamId } })

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

    const { data: appUserRow, error: appUserErr } = await admin
      .from('app_users')
      .select('id')
      .eq('team_id', teamId)
      .eq('role', 'team')
      .maybeSingle();
    if (appUserErr) throw appUserErr;
    if (!appUserRow) {
      return json({ error: 'No login found for this team' }, 404);
    }

    const newPassword = generateDefaultPassword();
    const { error: updateAuthErr } = await admin.auth.admin.updateUserById(appUserRow.id, { password: newPassword });
    if (updateAuthErr) throw updateAuthErr;

    const { error: credErr } = await admin
      .from('team_credentials')
      .upsert({ team_id: teamId, default_password: newPassword });
    if (credErr) throw credErr;

    const { error: mustChangeErr } = await admin.from('app_users').update({ must_change_password: true }).eq('id', appUserRow.id);
    if (mustChangeErr) throw mustChangeErr;

    return json({ newPassword });
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
