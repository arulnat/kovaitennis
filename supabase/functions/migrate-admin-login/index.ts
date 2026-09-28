// supabase/functions/migrate-admin-login/index.ts
//
// Self-service: lets the CALLER switch their own Auth email to the
// admin/superadmin login-ID scheme (see LoginPage.jsx and the README's
// "A note on login IDs vs. Supabase Auth") without needing an "edit
// email" option in the Supabase dashboard's Users list, which doesn't
// expose one — only auth.admin.updateUserById can do this, so it has to
// go through an Edge Function.
//
// tournament_admin -> admin@admin.internal
// super_admin      -> superadmin@admin.internal
// The target is derived from the caller's OWN role, never from input,
// so there's no way to call this for anyone else or land on the wrong
// login ID. Safe to call more than once — a no-op once already migrated.
//
// Deploy: supabase functions deploy migrate-admin-login
// Call from the client with: supabase.functions.invoke('migrate-admin-login')

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_LOGIN_ID = {
  tournament_admin: 'admin',
  super_admin: 'superadmin',
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
    const loginId = profile ? TARGET_LOGIN_ID[profile.role] : undefined;
    if (!loginId) {
      return json({ error: 'Only the tournament admin or super admin account can do this' }, 403);
    }

    const targetEmail = `${loginId}@admin.internal`;
    if (user.email === targetEmail) {
      return json({ alreadyDone: true, loginId, email: targetEmail });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
      email: targetEmail,
      email_confirm: true,
    });
    if (updateErr) throw updateErr;

    return json({ updated: true, loginId, email: targetEmail, previousEmail: user.email });
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
