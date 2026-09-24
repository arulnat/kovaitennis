// src/pages/admin/TeamsPage.jsx
//
// Req 3.5.5: lists every team registered for the currently selected
// season (created via Bulk Upload) — read-only with respect to grouping;
// assigning/ranking teams within a division now lives entirely on the
// Grouping page. This page mirrors whatever Grouping currently shows:
// unassigned teams first, then each division highest-to-lowest
// (divisions.order_index — see DivisionsPage), and within a division,
// highest rank to lowest (team_seasons.order_index) — so a change made
// in Grouping (move a team, reorder it, reorder divisions) is reflected
// here automatically, since both pages read the same underlying order.
//
// Delete (single, via the per-row button, or several at once via the
// checkboxes + "Delete selected") is only offered for a team unassigned
// in this season (matching what's visible right here) — the checkbox
// itself is disabled for an assigned team so it can't even be selected.
// The delete-team Edge Function re-checks server-side across every
// season before actually removing anything, and does the full teardown —
// login, players, roster, credentials — since deleting the underlying
// auth account needs the service_role key.

import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import TeamLink from '../../components/TeamLink.jsx';

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
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set()); // team_seasons row ids
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: teamSeasons, error } = await supabase
      .from('team_seasons')
      .select('id, team_id, division_id, order_index, status, teams(id, name, captain_name, captain_phone)')
      .eq('season_id', seasonId);

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

  // Unassigned first, then each division highest-to-lowest (divisions is
  // already ordered that way — see DivisionsPage), and within a division,
  // by team_seasons.order_index (the same rank Grouping shows/edits).
  const sections = useMemo(() => {
    const byOrder = (a, b) => a.order_index - b.order_index;
    const list = [];
    const unassigned = rows.filter((r) => !r.division_id).sort(byOrder);
    if (unassigned.length > 0) list.push({ key: 'unassigned', label: 'Unassigned', teams: unassigned });
    for (const d of divisions) {
      const teams = rows.filter((r) => r.division_id === d.id).sort(byOrder);
      if (teams.length > 0) list.push({ key: d.id, label: d.name, teams });
    }
    return list;
  }, [rows, divisions]);

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

  const columnCount = 6 + (isAdmin ? 1 : 0); // checkbox, team, captain, phone, players, delete [+ status]

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Teams</h1>
      <p className="text-sm text-gray-600 mb-4">
        Teams registered for the currently selected season (via Bulk Upload). Grouping into divisions and
        ranking happens on the Grouping page — this list mirrors it: unassigned first, then each division
        highest to lowest, ranked within it. Only an unassigned team can be deleted.
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
                {isAdmin && <th className="text-left p-2">Status</th>}
                <th className="p-2">Delete</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <Fragment key={section.key}>
                  <tr className="border-t">
                    <td colSpan={columnCount} className="p-2 font-semibold text-teal-900 bg-slate-100">
                      {section.label}
                    </td>
                  </tr>
                  {section.teams.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                          disabled={!!r.division_id}
                          title={r.division_id ? 'Unassign from its division first (Grouping)' : undefined}
                        />
                      </td>
                      <td className="p-2 font-medium"><TeamLink teamId={r.team_id}>{r.teams?.name}</TeamLink></td>
                      <td className="p-2">{r.teams?.captain_name}</td>
                      <td className="p-2">{r.teams?.captain_phone}</td>
                      <td className="p-2 text-center">{r.playerCount}</td>
                      {isAdmin && (
                        <td className="p-2">
                          {r.division_id ? (
                            <span className="text-green-700">Assigned</span>
                          ) : (
                            <span className="text-amber-700">Unassigned</span>
                          )}
                        </td>
                      )}
                      <td className="p-2 text-right">
                        <button
                          onClick={() => deleteTeams([r])}
                          disabled={!!r.division_id || deleting}
                          title={r.division_id ? 'Unassign from its division first (Grouping)' : undefined}
                          className="text-red-600 text-xs underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
