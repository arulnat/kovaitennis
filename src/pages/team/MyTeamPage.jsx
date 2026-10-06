// src/pages/team/MyTeamPage.jsx
//
// "My Team" — a team login's own roster management (formerly "My
// Roster"), also reused, unchanged, for admin's per-team roster editor
// (Teams admin page links to /admin/teams/:teamId/roster, which renders
// this with an explicit teamId + isAdminView). Bulk upload collects a
// real roster up front (captain + however many other players, Req
// 1.5's 4-player minimum enforced there); the admin's quick "+ Add
// Team" form instead fills the roster with 3 placeholder players —
// "Player 1"/"Player 2"/"Player 3" — meeting the same minimum until
// they're renamed. Either way, this is where the captain (or an admin)
// fills in real details (name, gender, date of birth, a photo) and
// manages the roster from here on, via the manage-team-roster Edge
// Function — players/team_players/team_seasons are admin-only tables
// under RLS, so a team login can't write to them directly
// (0001_init.sql). There's no player/coach role distinction anymore —
// every roster entry is just a player.
//
// The captain is always shown first, and — along with the first 4
// players overall (the ones present since the team was created) — can't
// be deleted by the CAPTAIN, only edited; anyone added after that can be
// deleted. An admin can remove any of those first 4 too (but never the
// captain themselves, either way — see the Edge Function).
//
// Every player — not just the captain — can have an address proof
// photo (players.address_proof_url, migration 0032) alongside their
// regular photo, same <100KB upload/view/remove rule either way; not
// required to submit the roster. Editing the captain's own row also
// offers the team's phone number (teams.captain_phone), since that's
// the one piece of "player" contact info that doesn't actually live on
// the players table.
//
// Submit (migration 0026's team_seasons.roster_submitted) requires every
// player to have name/gender/date of birth/photo filled in — re-checked
// server-side, since this flag is what gates the public Teams directory
// (TeamsDirectoryPage.jsx). Once submitted, the CAPTAIN can no longer
// add/edit/delete (Edit/Delete/+Add Player/Submit all disappear here,
// and the Edge Function rejects it too if somehow called anyway) — only
// an admin, via isAdminView, can make further changes from that point.
//
// Age eligibility (src/lib/age.js): every player must be MIN_AGE (40) or
// older as of the season's age_cutoff_date (seasons.age_cutoff_date, set
// on the Seasons admin page) — shown live as soon as a date of birth is
// picked, in both the view and edit states, and re-checked server-side
// (the real enforcement; this client check is just immediate feedback).
//
// Fee notice (captain's own view only, not isAdminView): the season's
// entry fee plus its per-player fee (seasons.registration_fee/
// player_fee — previously schema-only, Req 2.5), recalculated live as
// players are added so the captain can see the running total. Display
// only — no payment tracking here.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth.jsx';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { extractFunctionErrorMessage } from '../../lib/functionsError.js';
import { calculateAge, isAgeEligible, MIN_AGE } from '../../lib/age.js';
import PageHeader from '../../components/PageHeader.jsx';

const MAX_PHOTO_BYTES = 100 * 1024;
const PROTECTED_COUNT = 4;

function genderLabel(gender) {
  if (gender === 'male') return 'Male';
  if (gender === 'female') return 'Female';
  return 'Gender not set';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function isPlayerComplete(p) {
  return !!(p?.name?.trim() && p?.gender && p?.date_of_birth && p?.photo_url);
}

export default function MyTeamPage({ teamId: teamIdProp, isAdminView = false }) {
  const { teamId: ownTeamId } = useAuth();
  const { seasonId } = useSeason();
  const teamId = teamIdProp ?? ownTeamId;
  const [players, setPlayers] = useState(null); // null = loading
  const [teamSeason, setTeamSeason] = useState(null); // { roster_submitted, roster_submitted_at } | null
  const [ageCutoffDate, setAgeCutoffDate] = useState(null);
  const [seasonFees, setSeasonFees] = useState(null); // { registrationFee, playerFee }
  const [additionsDisabled, setAdditionsDisabled] = useState(false); // admin-set, season-wide — Seasons page
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!teamId || !seasonId) { setPlayers([]); return; }
    setPlayers(null);
    const [{ data }, { data: tsRow }, { data: seasonRow }] = await Promise.all([
      supabase
        .from('team_players')
        .select('player_id, players(id, name, gender, date_of_birth, is_captain, photo_url, address_proof_url, created_at)')
        .eq('season_id', seasonId)
        .eq('team_id', teamId),
      supabase
        .from('team_seasons')
        .select('roster_submitted, roster_submitted_at')
        .eq('season_id', seasonId)
        .eq('team_id', teamId)
        .maybeSingle(),
      supabase.from('seasons').select('age_cutoff_date, registration_fee, player_fee, roster_additions_disabled').eq('id', seasonId).maybeSingle(),
    ]);
    setPlayers((data || []).map((r) => r.players).filter(Boolean));
    setTeamSeason(tsRow || null);
    setAgeCutoffDate(seasonRow?.age_cutoff_date ?? null);
    setSeasonFees(seasonRow ? { registrationFee: seasonRow.registration_fee, playerFee: seasonRow.player_fee } : null);
    setAdditionsDisabled(!!seasonRow?.roster_additions_disabled);
  }, [teamId, seasonId]);

  useEffect(() => { load(); }, [load]);

  async function callRoster(body) {
    setError('');
    const { error: err } = await supabase.functions.invoke('manage-team-roster', {
      body: isAdminView ? { ...body, teamId } : body,
    });
    if (err) { setError(await extractFunctionErrorMessage(err)); return false; }
    await load();
    return true;
  }

  async function deletePlayer(player) {
    if (!confirm(`Remove ${player.name} from the roster? This cannot be undone.`)) return;
    await callRoster({ action: 'delete', playerId: player.id, seasonId });
  }

  async function submitRoster() {
    setSubmitting(true);
    const ok = await callRoster({ action: 'submit', seasonId });
    setSubmitting(false);
    if (ok) alert('Roster submitted — it now appears in the public Teams list.');
  }

  if (!seasonId) return <p className="p-6 text-gray-500">No season selected.</p>;

  // Delete-eligibility (for a non-admin caller) is decided by CREATION
  // order (matching the Edge Function's own check exactly) — the first 4
  // players ever added are protected, regardless of display order below.
  const byCreated = players
    ? [...players].sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id.localeCompare(b.id))
    : [];
  const protectedIds = new Set(byCreated.slice(0, PROTECTED_COUNT).map((p) => p.id));

  // Display order: captain first, then everyone else by creation order.
  const displayList = players
    ? [...players].sort((a, b) => {
        if (a.is_captain !== b.is_captain) return a.is_captain ? -1 : 1;
        return new Date(a.created_at) - new Date(b.created_at);
      })
    : [];

  const allComplete = players !== null && players.length > 0 && players.every(isPlayerComplete);
  // Once the captain has submitted, they can no longer add/edit/delete —
  // only an admin (isAdminView) can, from here on (enforced server-side too).
  const locked = !isAdminView && !!teamSeason?.roster_submitted;
  // Admin-set, season-wide (Seasons page): freezes roster size for every
  // captain — no add, and (since a delete just makes room to add one
  // right back) no delete either. Editing an existing player is
  // unaffected. Admin itself is never subject to this.
  const additionsLocked = !isAdminView && additionsDisabled;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <PageHeader
        title={isAdminView ? 'Team Roster' : 'My Team'}
        subtitle={
          isAdminView
            ? 'Edit, add, or remove any player on this team\'s roster.' + (ageCutoffDate ? ` Every player must be ${MIN_AGE}+ as of ${ageCutoffDate}.` : '')
            : undefined
        }
      />

      {!isAdminView && seasonFees && players !== null && (
        <p className="text-sm text-teal-900 bg-teal-50 border border-teal-200 rounded p-2 mb-3">
          Entry fee: ₹{seasonFees.registrationFee.toLocaleString('en-IN')} + ₹{seasonFees.playerFee.toLocaleString('en-IN')} per player
          {players.length > 0 && (
            <> — {players.length} player{players.length === 1 ? '' : 's'} so far. Total = <strong>Rs. {(seasonFees.registrationFee + players.length * seasonFees.playerFee).toLocaleString('en-IN')}</strong></>
          )}
        </p>
      )}

      {teamSeason?.roster_submitted && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2 mb-3">
          ✓ Submitted{teamSeason.roster_submitted_at ? ` on ${new Date(teamSeason.roster_submitted_at).toLocaleDateString()}` : ''} — listed in the public Teams directory.
          {locked && ' The roster is now locked; contact an admin for any further changes.'}
        </p>
      )}

      {additionsLocked && !locked && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
          Adding or removing players is currently disabled for this season — contact an admin if your roster needs to change size. Editing an existing player's details is still fine.
        </p>
      )}

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {players === null ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : displayList.length === 0 ? (
        <p className="text-gray-500 text-sm">No players on file for this season yet.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {displayList.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              ageCutoffDate={ageCutoffDate}
              readOnly={locked}
              deletable={!p.is_captain && !additionsLocked && (isAdminView || !protectedIds.has(p.id))}
              onSave={(fields) => callRoster({ action: 'edit', playerId: p.id, seasonId, ...fields })}
              onDelete={() => deletePlayer(p)}
            />
          ))}
        </div>
      )}

      {locked ? null : adding ? (
        <PlayerCard
          isNew
          ageCutoffDate={ageCutoffDate}
          onSave={async (fields) => {
            const ok = await callRoster({ action: 'add', seasonId, ...fields });
            if (ok) setAdding(false);
            return ok;
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="flex items-center gap-3">
          {!additionsLocked && (
            <button
              onClick={() => setAdding(true)}
              className="px-4 py-2 rounded bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800"
            >
              + Add Player
            </button>
          )}
          <button
            onClick={submitRoster}
            disabled={submitting || !allComplete}
            title={!allComplete ? 'Every player needs a name, gender, date of birth, and photo first' : undefined}
            className="px-4 py-2 rounded bg-accent-500 text-teal-950 text-sm font-bold uppercase tracking-wide hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One roster entry. Either a normal view/edit card for an existing
 * player, or (isNew) the "Add Player" form — same fields either way, so
 * filling in a placeholder works exactly the same as adding a brand new
 * player.
 */
function PlayerCard({ player, isNew, deletable, readOnly, ageCutoffDate, onSave, onDelete, onCancel }) {
  const [editing, setEditing] = useState(!!isNew);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showAddressProof, setShowAddressProof] = useState(false);
  const [name, setName] = useState(player?.name ?? '');
  const [gender, setGender] = useState(player?.gender ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(player?.date_of_birth ?? '');
  const [captainPhone, setCaptainPhone] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [addressProofFile, setAddressProofFile] = useState(null);
  const [removeAddressProof, setRemoveAddressProof] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);

  function resetToPlayer() {
    setName(player?.name ?? '');
    setGender(player?.gender ?? '');
    setDateOfBirth(player?.date_of_birth ?? '');
    setCaptainPhone('');
    setPhotoFile(null);
    setRemovePhoto(false);
    setAddressProofFile(null);
    setRemoveAddressProof(false);
    setFieldError('');
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) { setPhotoFile(null); return; }
    if (file.size >= MAX_PHOTO_BYTES) {
      setFieldError(`Photo is ${Math.ceil(file.size / 1024)}KB — must be under 100KB.`);
      e.target.value = '';
      return;
    }
    setFieldError('');
    setPhotoFile(file);
    setRemovePhoto(false);
  }

  function handleAddressProofChange(e) {
    const file = e.target.files?.[0];
    if (!file) { setAddressProofFile(null); return; }
    if (file.size >= MAX_PHOTO_BYTES) {
      setFieldError(`Address proof is ${Math.ceil(file.size / 1024)}KB — must be under 100KB.`);
      e.target.value = '';
      return;
    }
    setFieldError('');
    setAddressProofFile(file);
    setRemoveAddressProof(false);
  }

  async function save() {
    setFieldError('');
    if (!name.trim()) { setFieldError('Name is required.'); return; }
    if (gender !== 'male' && gender !== 'female') { setFieldError('Select a gender.'); return; }
    if (!dateOfBirth) { setFieldError('Date of birth is required.'); return; }
    if (ageCutoffDate && !isAgeEligible(dateOfBirth, ageCutoffDate)) {
      setFieldError(`Must be ${MIN_AGE} or older as of ${ageCutoffDate} — this date of birth is ${calculateAge(dateOfBirth, ageCutoffDate)}.`);
      return;
    }

    setSaving(true);
    let photoBase64, addressProofBase64;
    try {
      if (photoFile) photoBase64 = await readFileAsDataUrl(photoFile);
      if (addressProofFile) addressProofBase64 = await readFileAsDataUrl(addressProofFile);
    } catch {
      setSaving(false);
      setFieldError('Could not read the selected photo — try a different file.');
      return;
    }

    const fields = { name: name.trim(), gender, dateOfBirth };
    if (photoBase64) fields.photoBase64 = photoBase64;
    else if (removePhoto) fields.removePhoto = true;
    if (player?.is_captain && captainPhone.trim()) fields.captainPhone = captainPhone.trim();
    if (addressProofBase64) fields.addressProofBase64 = addressProofBase64;
    else if (removeAddressProof) fields.removeAddressProof = true;

    const ok = await onSave(fields);
    setSaving(false);
    if (ok) {
      setEditing(false);
      setPhotoFile(null);
      setRemovePhoto(false);
      setAddressProofFile(null);
      setRemoveAddressProof(false);
    }
  }

  if (!editing) {
    const complete = isPlayerComplete(player);
    return (
      <div className="border rounded bg-white shadow p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="font-semibold">{player.name}</span>
            {player.is_captain && <span className="ml-2 text-xs font-bold uppercase text-teal-700">Captain</span>}
            {!complete && <span className="ml-2 text-xs font-bold uppercase text-amber-600">Incomplete</span>}
            <div className="text-xs text-gray-500 mt-0.5">
              {genderLabel(player.gender)}
              {' · '}
              {player.date_of_birth
                ? `${player.date_of_birth}${ageCutoffDate ? ` (age ${calculateAge(player.date_of_birth, ageCutoffDate)})` : ''}`
                : 'DOB not set'}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {player.photo_url && (
              <button onClick={() => setShowPhoto((v) => !v)} className="text-teal-700 underline text-xs">
                {showPhoto ? 'Hide' : 'View'}
              </button>
            )}
            {player.address_proof_url && (
              <button onClick={() => setShowAddressProof((v) => !v)} className="text-teal-700 underline text-xs">
                {showAddressProof ? 'Hide proof' : 'View proof'}
              </button>
            )}
            {!readOnly && (
              <button onClick={() => { resetToPlayer(); setEditing(true); }} className="text-teal-700 underline text-xs">
                Edit
              </button>
            )}
            {!readOnly && deletable && (
              <button onClick={onDelete} className="text-red-600 underline text-xs">
                Delete
              </button>
            )}
          </div>
        </div>
        {showPhoto && player.photo_url && (
          <img src={player.photo_url} alt={player.name} className="mt-2 w-16 h-16 object-cover rounded border" />
        )}
        {showAddressProof && player.address_proof_url && (
          <img src={player.address_proof_url} alt="Address proof" className="mt-2 w-16 h-16 object-cover rounded border" />
        )}
      </div>
    );
  }

  return (
    <div className="border-2 border-teal-200 rounded bg-teal-50 shadow p-3">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="col-span-2">
          <label className="block text-xs text-gray-600 mb-0.5">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-2 py-1 text-sm w-full" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Gender</label>
          <div className="flex gap-3 text-sm pt-1">
            <label className="flex items-center gap-1">
              <input type="radio" checked={gender === 'male'} onChange={() => setGender('male')} /> Male
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={gender === 'female'} onChange={() => setGender('female')} /> Female
            </label>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Date of birth</label>
          <input type="date" value={dateOfBirth ?? ''} onChange={(e) => setDateOfBirth(e.target.value)} className="border rounded px-2 py-1 text-sm w-full" />
          {dateOfBirth && ageCutoffDate && (
            <p className={`text-[11px] mt-0.5 ${isAgeEligible(dateOfBirth, ageCutoffDate) ? 'text-gray-500' : 'text-red-600 font-semibold'}`}>
              Age {calculateAge(dateOfBirth, ageCutoffDate)} as of {ageCutoffDate}
              {!isAgeEligible(dateOfBirth, ageCutoffDate) && ` — must be ${MIN_AGE}+`}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Photo (under 100KB{isNew ? ', optional for now — required to submit' : ''})</label>
          <input type="file" accept="image/*" onChange={handlePhotoChange} className="text-xs w-full" />
          {player?.photo_url && !photoFile && (
            <label className="flex items-center gap-1 text-xs text-gray-600 mt-1">
              <input type="checkbox" checked={removePhoto} onChange={(e) => setRemovePhoto(e.target.checked)} /> Remove current photo
            </label>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Address proof (under 100KB)</label>
          <input type="file" accept="image/*" onChange={handleAddressProofChange} className="text-xs w-full" />
          {player?.address_proof_url && !addressProofFile && (
            <label className="flex items-center gap-1 text-xs text-gray-600 mt-1">
              <input type="checkbox" checked={removeAddressProof} onChange={(e) => setRemoveAddressProof(e.target.checked)} /> Remove current address proof
            </label>
          )}
        </div>
        {player?.is_captain && (
          <div className="col-span-2">
            <label className="block text-xs text-gray-600 mb-0.5">Team phone number (leave blank to keep as-is)</label>
            <input value={captainPhone} onChange={(e) => setCaptainPhone(e.target.value)} placeholder="10-digit mobile number" className="border rounded px-2 py-1 text-sm w-full" />
          </div>
        )}
      </div>

      {fieldError && <p className="text-red-600 text-xs mb-2">{fieldError}</p>}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => {
            if (isNew) { onCancel(); return; }
            resetToPlayer();
            setEditing(false);
          }}
          className="px-3 py-1.5 rounded border text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
