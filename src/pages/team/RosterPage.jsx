// src/pages/team/RosterPage.jsx
//
// Self-service roster page for a team login. Bulk upload / Add Team
// create every team with its real captain plus 3 placeholder players —
// "Player 1"/"Player 2"/"Player 3" — meeting the 4-player minimum (Req
// 1.5). This is where the captain fills those placeholders in with real
// people (name, gender, date of birth, coach or not, an optional photo)
// and manages the roster from there, via the manage-team-roster Edge
// Function — players/team_players are admin-only tables under RLS, so
// the team login can't write to them directly (see 0001_init.sql).
//
// The captain is always shown first, and — along with the first 4
// players overall (the ones present since the team was created) — can
// never be deleted from here, only edited; anyone added after that can
// be deleted. Only one player on the team can be marked coach at a time
// (players_one_coach_per_team, migration 0024) — marking a new one
// automatically un-marks the previous one, handled server-side.
//
// Editing the captain's own row also offers the team's phone number
// (teams.captain_phone), since that's the one piece of "player" contact
// info that doesn't actually live on the players table.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth.jsx';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { extractFunctionErrorMessage } from '../../lib/functionsError.js';
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

export default function RosterPage() {
  const { teamId } = useAuth();
  const { seasonId } = useSeason();
  const [players, setPlayers] = useState(null); // null = loading
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!teamId || !seasonId) { setPlayers([]); return; }
    setPlayers(null);
    const { data } = await supabase
      .from('team_players')
      .select('player_id, players(id, name, gender, date_of_birth, is_coach, is_captain, photo_url, created_at)')
      .eq('season_id', seasonId)
      .eq('team_id', teamId);
    setPlayers((data || []).map((r) => r.players).filter(Boolean));
  }, [teamId, seasonId]);

  useEffect(() => { load(); }, [load]);

  async function callRoster(body) {
    setError('');
    const { error: err } = await supabase.functions.invoke('manage-team-roster', { body });
    if (err) { setError(await extractFunctionErrorMessage(err)); return false; }
    await load();
    return true;
  }

  async function deletePlayer(player) {
    if (!confirm(`Remove ${player.name} from the roster? This cannot be undone.`)) return;
    await callRoster({ action: 'delete', playerId: player.id });
  }

  if (!seasonId) return <p className="p-6 text-gray-500">No season selected.</p>;

  // Delete-eligibility is decided by CREATION order (matching the Edge
  // Function's own check exactly) — the first 4 players ever added are
  // protected, regardless of display order below.
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

  return (
    <div className="max-w-2xl mx-auto p-6">
      <PageHeader
        title="My Roster"
        subtitle="Fill in real details for every placeholder player, and manage your team's roster here."
      />

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
              deletable={!p.is_captain && !protectedIds.has(p.id)}
              onSave={(fields) => callRoster({ action: 'edit', playerId: p.id, ...fields })}
              onDelete={() => deletePlayer(p)}
            />
          ))}
        </div>
      )}

      {adding ? (
        <PlayerCard
          isNew
          onSave={async (fields) => {
            const ok = await callRoster({ action: 'add', seasonId, ...fields });
            if (ok) setAdding(false);
            return ok;
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="px-4 py-2 rounded bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800"
        >
          + Add Player
        </button>
      )}
    </div>
  );
}

/**
 * One roster entry. Either a normal view/edit card for an existing
 * player, or (isNew) the "Add Player" form — same fields either way, so
 * a captain fills in a placeholder exactly the same way they add a
 * brand new one.
 */
function PlayerCard({ player, isNew, deletable, onSave, onDelete, onCancel }) {
  const [editing, setEditing] = useState(!!isNew);
  const [showPhoto, setShowPhoto] = useState(false);
  const [name, setName] = useState(player?.name ?? '');
  const [gender, setGender] = useState(player?.gender ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(player?.date_of_birth ?? '');
  const [isCoach, setIsCoach] = useState(player?.is_coach ?? false);
  const [captainPhone, setCaptainPhone] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);

  function resetToPlayer() {
    setName(player?.name ?? '');
    setGender(player?.gender ?? '');
    setDateOfBirth(player?.date_of_birth ?? '');
    setIsCoach(player?.is_coach ?? false);
    setCaptainPhone('');
    setPhotoFile(null);
    setRemovePhoto(false);
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

  async function save() {
    setFieldError('');
    if (!name.trim()) { setFieldError('Name is required.'); return; }
    if (gender !== 'male' && gender !== 'female') { setFieldError('Select a gender.'); return; }
    if (!dateOfBirth) { setFieldError('Date of birth is required.'); return; }

    setSaving(true);
    let photoBase64;
    try {
      if (photoFile) photoBase64 = await readFileAsDataUrl(photoFile);
    } catch {
      setSaving(false);
      setFieldError('Could not read the selected photo — try a different file.');
      return;
    }

    const fields = { name: name.trim(), gender, dateOfBirth, isCoach };
    if (photoBase64) fields.photoBase64 = photoBase64;
    else if (removePhoto) fields.removePhoto = true;
    if (player?.is_captain && captainPhone.trim()) fields.captainPhone = captainPhone.trim();

    const ok = await onSave(fields);
    setSaving(false);
    if (ok) {
      setEditing(false);
      setPhotoFile(null);
      setRemovePhoto(false);
    }
  }

  if (!editing) {
    return (
      <div className="border rounded bg-white shadow p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="font-semibold">{player.name}</span>
            {player.is_captain && <span className="ml-2 text-xs font-bold uppercase text-teal-700">Captain</span>}
            {player.is_coach && <span className="ml-2 text-xs font-bold uppercase text-accent-600">Coach</span>}
            <div className="text-xs text-gray-500 mt-0.5">
              {genderLabel(player.gender)}
              {' · '}
              {player.date_of_birth || 'DOB not set'}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {player.photo_url && (
              <button onClick={() => setShowPhoto((v) => !v)} className="text-teal-700 underline text-xs">
                {showPhoto ? 'Hide' : 'View'}
              </button>
            )}
            <button onClick={() => { resetToPlayer(); setEditing(true); }} className="text-teal-700 underline text-xs">
              Edit
            </button>
            {deletable && (
              <button onClick={onDelete} className="text-red-600 underline text-xs">
                Delete
              </button>
            )}
          </div>
        </div>
        {showPhoto && player.photo_url && (
          <img src={player.photo_url} alt={player.name} className="mt-2 w-16 h-16 object-cover rounded border" />
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
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Role</label>
          <div className="flex gap-3 text-sm pt-1">
            <label className="flex items-center gap-1">
              <input type="radio" checked={!isCoach} onChange={() => setIsCoach(false)} /> Player
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={isCoach} onChange={() => setIsCoach(true)} /> Coach
            </label>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Photo (under 100KB, optional)</label>
          <input type="file" accept="image/*" onChange={handlePhotoChange} className="text-xs w-full" />
          {player?.photo_url && !photoFile && (
            <label className="flex items-center gap-1 text-xs text-gray-600 mt-1">
              <input type="checkbox" checked={removePhoto} onChange={(e) => setRemovePhoto(e.target.checked)} /> Remove current photo
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
