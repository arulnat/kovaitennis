// src/pages/admin/TeamsPage.jsx
//
// Req 3.5.5: the division-placement screen — lists every team registered
// for the currently selected season (created via Bulk Upload) and lets an
// admin assign/change which division each is in. Bulk upload itself
// creates the team_seasons row with division_id left null, so without this
// page a team is invisible to Fixture Generation and Standings (both
// filter team_seasons by division_id).

import { useEffect, useState, useCallback } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';

export default function TeamsPage({ seasonId }) {
  const { divisions } = useSeason();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Teams</h1>
      <p className="text-sm text-gray-600 mb-4">
        Teams registered for the currently selected season (via Bulk Upload). Assign each to a division —
        a team with no division won't show up in Fixture Generation or Standings (Req 3.5.5).
      </p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">No teams yet — use Bulk Upload to add some.</p>
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-teal-50">
            <tr>
              <th className="text-left p-2">Team</th>
              <th className="text-left p-2">Captain</th>
              <th className="text-left p-2">Phone</th>
              <th className="p-2">Players</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Division</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
