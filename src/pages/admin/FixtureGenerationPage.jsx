// src/pages/admin/FixtureGenerationPage.jsx
//
// Req 4.1–4.12: generate a division's round-robin, preview home/away
// balance, allow manual override, then release. Uses the pure scheduler
// engine (src/lib/scheduler.js) for the actual algorithm.

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { generateRoundRobin, assignHomeAway, homeAwayBalanceReport, buildPriorMeetingMap } from '../../lib/scheduler.js';

export default function FixtureGenerationPage({ seasonId, divisionId, startWeekend }) {
  const [teams, setTeams] = useState([]);
  const [scheduled, setScheduled] = useState(null); // [{round, ties:[{home,away,swapped}]}]
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('team_seasons')
      .select('team_id, teams(id, name)')
      .eq('season_id', seasonId)
      .eq('division_id', divisionId)
      .then(({ data }) => setTeams((data || []).map((r) => r.teams)));
  }, [seasonId, divisionId]);

  async function handleGenerate() {
    const teamIds = teams.map((t) => t.id);

    // Req 4.9: pull last season's fixtures (any division) to detect
    // rematches and auto-swap home/away.
    const { data: priorFixtures } = await supabase
      .from('fixtures')
      .select('home_team_id, away_team_id, season_id, seasons!inner(id)')
      .in('home_team_id', teamIds)
      .in('away_team_id', teamIds); // simplified — production query should scope to "prior season" explicitly

    const priorMap = buildPriorMeetingMap(priorFixtures || []);
    const rounds = generateRoundRobin(teamIds);
    const withHomeAway = assignHomeAway(rounds, priorMap);
    setScheduled(withHomeAway);
  }

  const balanceReport = useMemo(
    () => (scheduled ? homeAwayBalanceReport(scheduled) : []),
    [scheduled]
  );

  function overrideHomeAway(round, tieIndex) {
    setScheduled((prev) =>
      prev.map((r) =>
        r.round !== round
          ? r
          : {
              ...r,
              ties: r.ties.map((t, i) =>
                i !== tieIndex ? t : { home: t.away, away: t.home, swapped: !t.swapped }
              ),
            }
      )
    );
  }

  async function handleRelease() {
    setSaving(true);
    const weekOf = (roundNumber) => {
      const d = new Date(startWeekend);
      d.setDate(d.getDate() + (roundNumber - 1) * 7); // Req 4.2 — 7-day intervals
      return d.toISOString().slice(0, 10);
    };

    const rows = scheduled.flatMap(({ round, ties }) =>
      ties.map(({ home, away }) => ({
        season_id: seasonId,
        division_id: divisionId,
        round_number: round,
        week_date: weekOf(round),
        home_team_id: home,
        away_team_id: away,
        is_bye: false,
        status: 'released',
        released_at: new Date().toISOString(),
      }))
    );

    const { error } = await supabase.from('fixtures').insert(rows);
    setSaving(false);
    if (error) alert(`Failed to release fixtures: ${error.message}`);
    else alert('Fixtures released — visible to teams now (Req 4.8).');
  }

  const teamName = (id) => teams.find((t) => t.id === id)?.name ?? id;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Fixture Generation</h1>

      {!scheduled && (
        <button onClick={handleGenerate} className="px-4 py-2 rounded bg-teal-700 text-white text-sm font-medium">
          Generate round robin ({teams.length} teams)
        </button>
      )}

      {scheduled && (
        <>
          <div className="mb-4 p-3 border rounded bg-gray-50">
            <p className="text-sm font-medium mb-1">Home/away balance check (Req 4.12):</p>
            {balanceReport.map((r) => (
              <p key={r.teamId} className={`text-xs ${r.balanced ? 'text-gray-600' : 'text-red-600 font-medium'}`}>
                {teamName(r.teamId)}: {r.home}H / {r.away}A {!r.balanced && '⚠ unbalanced'}
              </p>
            ))}
          </div>

          {scheduled.map(({ round, ties }) => (
            <div key={round} className="mb-3">
              <p className="text-sm font-semibold text-gray-700">Round {round}</p>
              {ties.map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-sm py-1">
                  <span className="font-medium">{teamName(t.home)}</span>
                  <span className="text-gray-400">vs</span>
                  <span>{teamName(t.away)}</span>
                  {t.swapped && <span className="text-xs text-teal-700">(auto-swapped, Req 4.9)</span>}
                  <button
                    onClick={() => overrideHomeAway(round, i)}
                    className="text-xs text-gray-500 underline ml-auto"
                  >
                    swap home/away
                  </button>
                </div>
              ))}
            </div>
          ))}

          <button
            onClick={handleRelease}
            disabled={saving}
            className="mt-4 px-4 py-2 rounded bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Releasing…' : 'Release fixtures to teams'}
          </button>
        </>
      )}
    </div>
  );
}
