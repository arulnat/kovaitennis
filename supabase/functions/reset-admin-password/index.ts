// supabase/functions/reset-admin-password/index.ts
//
// super_admin-only: resets the tournament admin's ("admin" login)
// password to a fresh temporary one and forces a change on next login —
// same shape as reset-team-password, for the one account that isn't a
// team. There's no reverse direction (the tournament admin can't reset
// the super admin's password this way) — only super_admin may call this.
//
// Deploy: supabase functions deploy reset-admin-password
// Call from the client with: supabase.functions.invoke('reset-admin-password')

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
    if (!profile || profile.role !== 'super_admin') {
      return json({ error: 'Super admin role required' }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: adminRow, error: adminErr } = await admin
      .from('app_users')
      .select('id')
      .eq('role', 'tournament_admin')
      .maybeSingle();
    if (adminErr) throw adminErr;
    if (!adminRow) {
      return json({ error: 'No tournament admin account found' }, 404);
    }

    const newPassword = generateDefaultPassword();
    const { error: updateAuthErr } = await admin.auth.admin.updateUserById(adminRow.id, { password: newPassword });
    if (updateAuthErr) throw updateAuthErr;

    const { error: mustChangeErr } = await admin.from('app_users').update({ must_change_password: true }).eq('id', adminRow.id);
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
