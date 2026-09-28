// src/pages/team/RosterPage.jsx
//
// Self-service roster page for a team login. Bulk upload now creates
// every team with just the captain (real name) plus 3 placeholder
// players — "Player 1"/"Player 2"/"Player 3" — so the 4-player minimum
// (Req 1.5) is met without the admin needing every real name up front.
// This is where the captain renames those placeholders and adds anyone
// else, via the manage-team-roster Edge Function (players/team_players
// are admin-only tables under RLS, so the team login can't write to them
// directly — see 0001_init.sql).
//
// Renaming only, no removal: since every team starts at exactly the
// 4-player minimum, allowing add/rename but not delete means the
// minimum can never be broken from this page.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth.jsx';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { extractFunctionErrorMessage } from '../../lib/functionsError.js';
import PageHeader from '../../components/PageHeader.jsx';

export default function RosterPage() {
  const { teamId } = useAuth();
  const { seasonId } = useSeason();
  const [players, setPlayers] = useState(null); // null = loading
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!teamId || !seasonId) { setPlayers([]); return; }
    setPlayers(null);
    const { data } = await supabase
      .from('team_players')
      .select('player_id, players(id, name)')
      .eq('season_id', seasonId)
      .eq('team_id', teamId);
    setPlayers(
      (data || [])
        .map((r) => r.players)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }, [teamId, seasonId]);

  useEffect(() => { load(); }, [load]);

  async function rename(playerId, name) {
    setError('');
    const { error: err } = await supabase.functions.invoke('manage-team-roster', {
      body: { action: 'rename', playerId, name },
    });
    if (err) { setError(await extractFunctionErrorMessage(err)); return false; }
    await load();
    return true;
  }

  async function addPlayer(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    setAdding(true);
    const { error: err } = await supabase.functions.invoke('manage-team-roster', {
      body: { action: 'add', seasonId, name: newName },
    });
    setAdding(false);
    if (err) { setError(await extractFunctionErrorMessage(err)); return; }
    setNewName('');
    load();
  }

  if (!seasonId) return <p className="p-6 text-gray-500">No season selected.</p>;

  return (
    <div className="max-w-xl mx-auto p-6">
      <PageHeader
        title="My Roster"
        subtitle={'Rename any "Player N" placeholder to a real name, and add more players — minimum 4 on the roster at all times.'}
      />

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {players === null ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : players.length === 0 ? (
        <p className="text-gray-500 text-sm">No players on file for this season yet.</p>
      ) : (
        <ul className="border rounded divide-y bg-white shadow mb-4">
          {players.map((p) => (
            <PlayerRow key={p.id} player={p} onRename={rename} />
          ))}
        </ul>
      )}

      <form onSubmit={addPlayer} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New player name"
          className="border rounded px-3 py-2 text-sm flex-1"
        />
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="px-4 py-2 rounded bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-50"
        >
          {adding ? 'Adding…' : 'Add player'}
        </button>
      </form>
    </div>
  );
}

/** One roster row — click "Rename" to edit in place; Save is disabled until the name actually changes. */
function PlayerRow({ player, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(player.name);
  const [saving, setSaving] = useState(false);
  const dirty = draft.trim() !== '' && draft.trim() !== player.name;

  async function save() {
    setSaving(true);
    const ok = await onRename(player.id, draft.trim());
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <li className="p-3 flex items-center justify-between text-sm">
        <span>{player.name}</span>
        <button
          onClick={() => { setDraft(player.name); setEditing(true); }}
          className="text-teal-700 underline text-xs shrink-0"
        >
          Rename
        </button>
      </li>
    );
  }

  return (
    <li className="p-3 flex items-center gap-2 text-sm">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="border rounded px-2 py-1 text-sm flex-1"
        autoFocus
      />
      <button onClick={save} disabled={!dirty || saving} className="text-teal-700 underline text-xs shrink-0 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button onClick={() => setEditing(false)} className="text-gray-500 underline text-xs shrink-0">Cancel</button>
    </li>
  );
}
