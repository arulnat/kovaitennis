// src/pages/admin/TeamsPage.jsx
//
// Req 3.5.5: the division-placement screen — lists every team registered
// for the currently selected season (created via Bulk Upload) and lets an
// admin assign/change which division each is in. Bulk upload itself
// creates the team_seasons row with division_id left null, so without this
// page a team is invisible to Fixture Generation and Standings (both
// filter team_seasons by division_id).
//
// Delete (single, via the per-row button, or several at once via the
// checkboxes + "Delete selected") is only offered for a team unassigned
// in this season (matching what's visible right here) — the checkbox
// itself is disabled for an assigned team so it can't even be selected.
// The delete-team Edge Function re-checks server-side across every
// season before actually removing anything, and does the full teardown —
// login, players, roster, credentials — since deleting the underlying
// auth account needs the service_role key.

import { useEffect, useState, useCallback } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';

/** delete-team returns a non-2xx status with a JSON {error} body for
 * expected failures (e.g. still grouped) — supabase-js doesn't parse
 * that into error.message itself, so pull it from the raw response. */
async function extractFunctionErrorMessage(error) {
  try {
    const body = await error.context.json();
    if (body?.error) return body.error;
  } catch { /* fall back to error.message below */ }
  return error.message;
}

export default function TeamsPage({ seasonId }) {
  const { divisions } = useSeason();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set()); // team_seasons row ids
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: teamSeasons, error } = await supabase
      .from('team_seasons')
      .select('id, team_id, division_id, status, teams(id, name, captain_name, captain_phone)')
      .eq('season_id', seasonId)
      .order('created_at', { ascending: false });

    if (error) { alert(error.message); setLoading(false); return; }

    const teamIds = (teamSeasons || []).map((ts) => ts.team_id);
    const playerCounts = {};
    if (teamIds.length > 0) {
      const { data: teamPlayers } = await supabase
        .from('team_players')
        .select('team_id')
        .eq('season_id', seasonId)
        .in('team_id', teamIds);
      for (const tp of teamPlayers || []) {
        playerCounts[tp.team_id] = (playerCounts[tp.team_id] || 0) + 1;
      }
    }

    setRows((teamSeasons || []).map((ts) => ({ ...ts, playerCount: playerCounts[ts.team_id] || 0 })));
    setSelected(new Set());
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  async function assignDivision(teamSeasonId, divisionId) {
    const { error } = await supabase
      .from('team_seasons')
      .update({ division_id: divisionId || null })
      .eq('id', teamSeasonId);
    if (error) { alert(error.message); return; }
    load();
  }

  function toggleRow(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const deletableRows = rows.filter((r) => !r.division_id);
  const allDeletableSelected = deletableRows.length > 0 && deletableRows.every((r) => selected.has(r.id));

  function toggleSelectAll() {
    setSelected(allDeletableSelected ? new Set() : new Set(deletableRows.map((r) => r.id)));
  }

  async function deleteTeams(targets) {
    if (targets.length === 0) return;
    const names = targets.map((r) => r.teams?.name).join(', ');
    const label = targets.length === 1 ? `"${names}"` : `${targets.length} teams (${names})`;
    if (!confirm(`Permanently delete ${label}? This removes their players, roster, and login. This cannot be undone.`)) return;

    setDeleting(true);
    const failures = [];
    for (const row of targets) {
      const { error } = await supabase.functions.invoke('delete-team', { body: { teamId: row.team_id } });
      if (error) failures.push(`${row.teams?.name}: ${await extractFunctionErrorMessage(error)}`);
    }
    setDeleting(false);

    if (failures.length > 0) alert(`Some deletions failed:\n${failures.join('\n')}`);
    load();
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Teams</h1>
      <p className="text-sm text-gray-600 mb-4">
        Teams registered for the currently selected season (via Bulk Upload). Assign each to a division —
        a team with no division won't show up in Fixture Generation or Standings (Req 3.5.5). Only a team
        with no division can be deleted — check the ones you want, then Delete selected.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">No teams yet — use Bulk Upload to add some.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => deleteTeams(rows.filter((r) => selected.has(r.id)))}
              disabled={selected.size === 0 || deleting}
              className="px-3 py-1.5 rounded bg-red-600 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
          </div>

          <table className="w-full text-sm border">
            <thead className="bg-teal-50">
              <tr>
                <th className="p-2 w-8">
                  <input
                    type="checkbox"
                    checked={allDeletableSelected}
                    onChange={toggleSelectAll}
                    disabled={deletableRows.length === 0}
                    title="Select all deletable teams"
                  />
                </th>
                <th className="text-left p-2">Team</th>
                <th className="text-left p-2">Captain</th>
                <th className="text-left p-2">Phone</th>
                <th className="p-2">Players</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Division</th>
                <th className="p-2">Delete</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleRow(r.id)}
                      disabled={!!r.division_id}
                      title={r.division_id ? 'Unassign from its division first' : undefined}
                    />
                  </td>
                  <td className="p-2 font-medium">{r.teams?.name}</td>
                  <td className="p-2">{r.teams?.captain_name}</td>
                  <td className="p-2">{r.teams?.captain_phone}</td>
                  <td className="p-2 text-center">{r.playerCount}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">
                    <select
                      value={r.division_id ?? ''}
                      onChange={(e) => assignDivision(r.id, e.target.value)}
                      className="border rounded px-2 py-1 text-xs"
                    >
                      <option value="">— unassigned —</option>
                      {divisions.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => deleteTeams([r])}
                      disabled={!!r.division_id || deleting}
                      title={r.division_id ? 'Unassign from its division first' : undefined}
                      className="text-red-600 text-xs underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
