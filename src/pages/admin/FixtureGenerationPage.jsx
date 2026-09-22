// src/pages/admin/FixtureGenerationPage.jsx
//
// Req 4.1–4.12: a read-only viewer for fixtures already generated on the
// Grouping page (that's where "Generate Fixtures" lives now — a division
// is ready the moment its grouping is settled, and assignHomeAway
// guarantees the Req 4.6 home/away balance algorithmically, so there's no
// manual preview/override step to do here). Pick a division from the
// list box; if it has no generated fixtures yet, nothing is shown.

import { useState, useEffect } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/** Groups fixture rows by round_number for display. */
function groupByRound(fixtures) {
  const byRound = new Map();
  for (const f of fixtures) {
    if (!byRound.has(f.round_number)) byRound.set(f.round_number, { round: f.round_number, weekDate: f.week_date, ties: [], bye: null });
    const r = byRound.get(f.round_number);
    if (f.is_bye) r.bye = f.away_team_id ?? f.home_team_id; // resting team lives wherever it was stored
    else r.ties.push({ home: f.home_team_id, away: f.away_team_id });
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

export default function FixtureGenerationPage({ seasonId }) {
  const { divisions } = useSeason();
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [teams, setTeams] = useState([]);
  const [fixtures, setFixtures] = useState(null); // null = loading

  useEffect(() => {
    if (!selectedDivisionId && divisions.length > 0) setSelectedDivisionId(divisions[0].id);
  }, [divisions, selectedDivisionId]);

  useEffect(() => {
    if (!selectedDivisionId) return;
    setFixtures(null);

    supabase
      .from('team_seasons')
      .select('team_id, teams(id, name)')
      .eq('season_id', seasonId)
      .eq('division_id', selectedDivisionId)
      .then(({ data }) => setTeams((data || []).map((r) => r.teams)));

    supabase
      .from('fixtures')
      .select('round_number, week_date, home_team_id, away_team_id, is_bye')
      .eq('season_id', seasonId)
      .eq('division_id', selectedDivisionId)
      .order('round_number')
      .then(({ data }) => setFixtures(data || []));
  }, [seasonId, selectedDivisionId]);

  const teamName = (id) => teams.find((t) => t.id === id)?.name ?? '—';

  if (divisions.length === 0) {
    return <p className="p-6 text-gray-500">This season has no divisions yet — create one under Divisions first.</p>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Fixtures</h1>

      <label className="text-sm text-gray-700 block mb-6">
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
        <p className="text-gray-500 text-sm">
          No fixtures generated yet for this division — use Grouping to generate them.
        </p>
      )}

      {fixtures !== null && fixtures.length > 0 && (
        <RoundsTable rounds={groupByRound(fixtures)} teamName={teamName} />
      )}
    </div>
  );
}

function RoundsTable({ rounds, teamName }) {
  return (
    <>
      {rounds.map(({ round, weekDate, ties, bye }) => (
        <div key={round} className="mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-1">
            Round {round} — Week of {formatWeekDate(weekDate)}
          </p>
          <table className="w-full text-sm border mb-1">
            <thead className="bg-gray-50">
              <tr><th className="text-left p-2">Home</th><th className="text-left p-2">Away</th></tr>
            </thead>
            <tbody>
              {ties.map((t, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-medium">{teamName(t.home)}</td>
                  <td className="p-2">{teamName(t.away)}</td>
                </tr>
              ))}
              {bye && (
                <tr className="border-t bg-gray-50">
                  <td className="p-2 font-medium">{teamName(bye)}</td>
                  <td className="p-2 text-gray-500 italic">Rest</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
