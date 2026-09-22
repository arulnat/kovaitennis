// src/pages/admin/UpdateScoresPage.jsx
//
// Req 5.2 — admin can enter or edit any fixture's score, exactly like
// either captain can (see ScoreEntryPage.jsx, which already treats an
// admin viewer as exempt from the 7-day edit-window lock — Req 5.7).
// This page is just the missing piece: a way for an admin to find a
// fixture and jump into its score entry, the same way a captain would
// from their own team dashboard.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';

export default function UpdateScoresPage({ seasonId }) {
  const { divisions } = useSeason();
  const navigate = useNavigate();
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [fixtures, setFixtures] = useState(null); // null = loading

  useEffect(() => {
    if (!selectedDivisionId && divisions.length > 0) setSelectedDivisionId(divisions[0].id);
  }, [divisions, selectedDivisionId]);

  useEffect(() => {
    if (!selectedDivisionId) return;
    setFixtures(null);
    supabase
      .from('fixtures')
      .select(`
        id, round_number, week_date,
        teams_home:teams!fixtures_home_team_id_fkey(name),
        teams_away:teams!fixtures_away_team_id_fkey(name),
        rubbers(winner_side)
      `)
      .eq('season_id', seasonId)
      .eq('division_id', selectedDivisionId)
      .eq('is_bye', false)
      .order('round_number')
      .then(({ data }) => setFixtures(data || []));
  }, [seasonId, selectedDivisionId]);

  if (divisions.length === 0) {
    return <p className="p-6 text-gray-500">This season has no divisions yet — create one under Divisions first.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Update Scores</h1>
      <p className="text-sm text-gray-600 mb-4">
        Pick a fixture to enter or edit its score — same as either captain can, including after their normal
        7-day edit window has locked it (Req 5.2, 5.7).
      </p>

      <label className="text-sm text-gray-700 block mb-4">
        Division
        <select
          value={selectedDivisionId}
          onChange={(e) => setSelectedDivisionId(e.target.value)}
          className="border rounded px-2 py-1 text-sm ml-2"
        >
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </label>

      {fixtures === null && <p className="text-gray-500 text-sm">Loading…</p>}

      {fixtures !== null && fixtures.length === 0 && (
        <p className="text-gray-500 text-sm">No fixtures generated yet for this division — use Grouping to generate them.</p>
      )}

      {fixtures !== null && fixtures.length > 0 && (
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2">Round</th>
              <th className="text-left p-2">Week</th>
              <th className="text-left p-2">Fixture</th>
              <th className="text-left p-2">Status</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((f) => {
              const scored = f.rubbers?.filter((r) => r.winner_side).length ?? 0;
              const status = scored === 3 ? 'Complete' : scored === 0 ? 'Nothing entered' : 'Partially updated';
              const statusColor = scored === 3 ? 'text-green-700' : scored === 0 ? 'text-red-700' : 'text-amber-700';
              return (
                <tr key={f.id} className="border-t">
                  <td className="p-2 text-center">{f.round_number}</td>
                  <td className="p-2">{f.week_date}</td>
                  <td className="p-2">{f.teams_home?.name} vs {f.teams_away?.name}</td>
                  <td className={`p-2 font-medium ${statusColor}`}>{status} ({scored}/3)</td>
                  <td className="p-2 text-right">
                    <button onClick={() => navigate(`/score/${f.id}`)} className="text-xs text-teal-700 underline">
                      {scored === 0 ? 'Enter score' : 'Edit score'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
