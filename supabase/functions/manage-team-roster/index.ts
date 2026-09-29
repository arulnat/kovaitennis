// supabase/functions/manage-team-roster/index.ts
//
// Self-service roster management for a team captain: add a player (full
// details required — name, gender, date of birth, coach yes/no, and an
// optional photo), edit any existing player the same way (including the
// captain's own row, which can also update the team's captain phone),
// or delete a player that isn't one of the team's first 4 (the captain
// plus the minimum roster) or the captain themselves.
//
// players/team_players are admin-only tables under RLS (see
// 0001_init.sql's players_admin_write / players_admin_update /
// team_players_admin_all), so this Edge Function — using the
// service_role key — is the one sanctioned way a team login can touch
// its own roster. The caller's team_id always comes from their own
// app_users row, never from the request body, so a team can only ever
// act on its own players.
//
// "Only one coach per team" is enforced twice: proactively here (setting
// a new coach clears the previous one first, so a captain never has to
// manually un-mark someone) and at the DB level via a partial unique
// index (players_one_coach_per_team, migration 0024) as a backstop.
//
// Photos go straight to the "player-photos" Storage bucket (migration
// 0025, public) using the service_role key, which bypasses Storage RLS
// entirely — the client sends the file as a data: URL, capped at 100KB.
//
// Deploy: supabase functions deploy manage-team-roster
// Call from the client with:
//   supabase.functions.invoke('manage-team-roster', { body: { action: 'add', seasonId, name, gender, dateOfBirth, isCoach, photoBase64? } })
//   supabase.functions.invoke('manage-team-roster', { body: { action: 'edit', playerId, name, gender, dateOfBirth, isCoach, photoBase64?, removePhoto?, captainPhone? } })
//   supabase.functions.invoke('manage-team-roster', { body: { action: 'delete', playerId } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PHOTO_BYTES = 100 * 1024;
const PROTECTED_COUNT = 4; // the captain + the minimum 3 others can never be deleted from here

function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/\s+/g, '').replace(/^\+/, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return /^\d{10}$/.test(digits) ? { ok: true, value: digits } : { ok: false };
}

/** Validates the shared required fields (name/gender/dateOfBirth/isCoach) for both add and edit. Returns a trimmed/normalized copy, or throws with a user-facing message. */
function validatePlayerFields(body) {
  const name = String(body.name ?? '').trim();
  if (!name) throw new Error('Name is required');

  const gender = body.gender;
  if (gender !== 'male' && gender !== 'female') throw new Error('Gender (Male or Female) is required');

  const dateOfBirth = String(body.dateOfBirth ?? '').trim();
  if (!dateOfBirth || Number.isNaN(Date.parse(dateOfBirth))) throw new Error('Date of birth is required');

  if (typeof body.isCoach !== 'boolean') throw new Error('Coach status is required');

  return { name, gender, dateOfBirth, isCoach: body.isCoach };
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid photo data');
  const contentType = match[1];
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return { contentType, bytes };
}

async function uploadPhoto(admin, teamId, playerId, photoBase64) {
  const { contentType, bytes } = decodeDataUrl(photoBase64);
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new Error(`Photo is ${Math.ceil(bytes.length / 1024)}KB — must be under 100KB`);
  }
  const ext = contentType.split('/')[1]?.split('+')[0] ?? 'jpg';
  const path = `${teamId}/${playerId}-${Date.now()}.${ext}`;
  const { error: uploadErr } = await admin.storage.from('player-photos').upload(path, bytes, { contentType, upsert: true });
  if (uploadErr) throw uploadErr;
  const { data } = admin.storage.from('player-photos').getPublicUrl(path);
  return data.publicUrl;
}

/** If isCoach is true, clears any other player on the team currently marked coach (excludeId keeps a player from un-setting itself mid-update). */
async function ensureSingleCoach(admin, teamId, isCoach, excludeId) {
  if (!isCoach) return;
  let query = admin.from('players').update({ is_coach: false }).eq('team_id', teamId).eq('is_coach', true);
  if (excludeId) query = query.neq('id', excludeId);
  const { error } = await query;
  if (error) throw error;
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
    const { data: profile } = await callerClient.from('app_users').select('role, team_id').eq('id', user.id).single();
    if (!profile || profile.role !== 'team' || !profile.team_id) {
      return json({ error: 'Team login required' }, 403);
    }
    const teamId = profile.team_id;

    const body = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (body.action === 'add') {
      const fields = validatePlayerFields(body);
      const { seasonId } = body;
      if (!seasonId) return json({ error: 'seasonId is required' }, 400);

      const { data: teamSeason } = await admin
        .from('team_seasons')
        .select('id')
        .eq('season_id', seasonId)
        .eq('team_id', teamId)
        .maybeSingle();
      if (!teamSeason) return json({ error: 'Your team is not registered for this season' }, 404);

      await ensureSingleCoach(admin, teamId, fields.isCoach, null);

      const { data: newPlayer, error: playerErr } = await admin
        .from('players')
        .insert({
          team_id: teamId,
          name: fields.name,
          gender: fields.gender,
          date_of_birth: fields.dateOfBirth,
          is_coach: fields.isCoach,
        })
        .select()
        .single();
      if (playerErr) throw playerErr;

      const { error: tpErr } = await admin
        .from('team_players')
        .insert({ season_id: seasonId, team_id: teamId, player_id: newPlayer.id });
      if (tpErr) throw tpErr;

      if (body.photoBase64) {
        const photoUrl = await uploadPhoto(admin, teamId, newPlayer.id, body.photoBase64);
        const { error: photoErr } = await admin.from('players').update({ photo_url: photoUrl }).eq('id', newPlayer.id);
        if (photoErr) throw photoErr;
      }

      return json({ ok: true });
    }

    if (body.action === 'edit') {
      const { playerId } = body;
      if (!playerId) return json({ error: 'playerId is required' }, 400);

      const { data: player } = await admin.from('players').select('id, team_id, is_captain').eq('id', playerId).maybeSingle();
      if (!player || player.team_id !== teamId) {
        return json({ error: 'Player not found on your team' }, 404);
      }

      const fields = validatePlayerFields(body);
      await ensureSingleCoach(admin, teamId, fields.isCoach, playerId);

      const { error: updateErr } = await admin
        .from('players')
        .update({
          name: fields.name,
          gender: fields.gender,
          date_of_birth: fields.dateOfBirth,
          is_coach: fields.isCoach,
        })
        .eq('id', playerId);
      if (updateErr) throw updateErr;

      if (player.is_captain && body.captainPhone) {
        const phoneResult = normalizePhone(body.captainPhone);
        if (!phoneResult.ok) {
          return json({ error: 'Captain phone must be a 10-digit number (spaces are fine; a leading +91 or 91 is fine)' }, 400);
        }
        const { error: teamErr } = await admin.from('teams').update({ captain_phone: phoneResult.value }).eq('id', teamId);
        if (teamErr) throw teamErr;
      }

      if (body.photoBase64) {
        const photoUrl = await uploadPhoto(admin, teamId, playerId, body.photoBase64);
        const { error: photoErr } = await admin.from('players').update({ photo_url: photoUrl }).eq('id', playerId);
        if (photoErr) throw photoErr;
      } else if (body.removePhoto) {
        const { error: photoErr } = await admin.from('players').update({ photo_url: null }).eq('id', playerId);
        if (photoErr) throw photoErr;
      }

      return json({ ok: true });
    }

    if (body.action === 'delete') {
      const { playerId } = body;
      if (!playerId) return json({ error: 'playerId is required' }, 400);

      const { data: player } = await admin.from('players').select('id, team_id, is_captain').eq('id', playerId).maybeSingle();
      if (!player || player.team_id !== teamId) {
        return json({ error: 'Player not found on your team' }, 404);
      }
      if (player.is_captain) {
        return json({ error: "The captain can't be deleted" }, 400);
      }

      const { data: teamPlayers, error: listErr } = await admin
        .from('players')
        .select('id')
        .eq('team_id', teamId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (listErr) throw listErr;

      const index = (teamPlayers ?? []).findIndex((p) => p.id === playerId);
      if (index >= 0 && index < PROTECTED_COUNT) {
        return json({ error: `One of the first ${PROTECTED_COUNT} players on the roster can't be deleted` }, 400);
      }

      const { error: deleteErr } = await admin.from('players').delete().eq('id', playerId);
      if (deleteErr) {
        if (deleteErr.code === '23503') {
          return json({ error: 'This player has match results recorded and can\'t be deleted' }, 400);
        }
        throw deleteErr;
      }

      return json({ ok: true });
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
