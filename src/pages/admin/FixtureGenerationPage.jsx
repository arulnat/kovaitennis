// src/pages/admin/FixtureGenerationPage.jsx
//
// Req 4.1–4.12: generate each division's round-robin, preview home/away
// balance, allow manual override, then release. Uses the pure scheduler
// engine (src/lib/scheduler.js) for the actual algorithm.
//
// Shows every division in the season, one after another (highest first —
// divisions.order_index, see DivisionsPage), each in its own section. A
// division that already has released fixtures shows them read-only
// (grouped by week date, Home/Away columns) instead of the generate flow,
// so re-visiting this page can't accidentally create duplicates. An odd
// team count leaves one team with a bye each round — shown as a row where
// the resting team's name appears with "Rest" written against it, and
// persisted as its own fixture row (home_team_id null, away_team_id the
// resting team, is_bye true — see 0001_init.sql's fixtures table comment).

import { useState, useEffect, useMemo } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { generateRoundRobin, assignHomeAway, homeAwayBalanceReport, buildPriorMeetingMap } from '../../lib/scheduler.js';

function weekOf(startWeekend, roundNumber) {
  const d = new Date(startWeekend);
  d.setDate(d.getDate() + (roundNumber - 1) * 7); // Req 4.2 — 7-day intervals
  return d.toISOString().slice(0, 10);
}

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

export default function FixtureGenerationPage({ seasonId }) {
  const { divisions, activeSeason } = useSeason();
  const startWeekend = activeSeason?.start_weekend;

  if (!startWeekend) {
    return <p className="p-6 text-gray-500">Set the tournament start date under Grouping before generating fixtures.</p>;
  }
  if (divisions.length === 0) {
    return <p className="p-6 text-gray-500">This season has no divisions yet — create one under Divisions first.</p>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Fixture Generation</h1>
      <p className="text-sm text-gray-600 mb-6">
        Divisions are shown highest first. Round 1 starts the week of {formatWeekDate(startWeekend)}.
      </p>
      {divisions.map((d) => (
        <DivisionFixtures key={d.id} seasonId={seasonId} division={d} startWeekend={startWeekend} />
      ))}
    </div>
  );
}

function DivisionFixtures({ seasonId, division, startWeekend }) {
  const [teams, setTeams] = useState([]);
  const [existingFixtures, setExistingFixtures] = useState(null); // null = still loading
  const [scheduled, setScheduled] = useState(null); // preview only, before release
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('team_seasons')
      .select('team_id, teams(id, name)')
      .eq('season_id', seasonId)
      .eq('division_id', division.id)
      .then(({ data }) => setTeams((data || []).map((r) => r.teams).sort((a, b) => a.name.localeCompare(b.name))));

    supabase
      .from('fixtures')
      .select('round_number, week_date, home_team_id, away_team_id, is_bye')
      .eq('season_id', seasonId)
      .eq('division_id', division.id)
      .order('round_number')
      .then(({ data }) => setExistingFixtures(data || []));
  }, [seasonId, division.id]);

  const teamName = (id) => teams.find((t) => t.id === id)?.name ?? '—';

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
    const releasedAt = new Date().toISOString();

    const rows = scheduled.flatMap(({ round, ties, bye }) => {
      const tieRows = ties.map(({ home, away }) => ({
        season_id: seasonId,
        division_id: division.id,
        round_number: round,
        week_date: weekOf(startWeekend, round),
        home_team_id: home,
        away_team_id: away,
        is_bye: false,
        status: 'released',
        released_at: releasedAt,
      }));
      if (bye) {
        tieRows.push({
          season_id: seasonId,
          division_id: division.id,
          round_number: round,
          week_date: weekOf(startWeekend, round),
          home_team_id: null,
          away_team_id: bye,
          is_bye: true,
          status: 'released',
          released_at: releasedAt,
        });
      }
      return tieRows;
    });

    const { error } = await supabase.from('fixtures').insert(rows);
    setSaving(false);
    if (error) { alert(`Failed to release fixtures: ${error.message}`); return; }
    setScheduled(null);
    setExistingFixtures(rows);
  }

  return (
    <div className="mb-8 border rounded p-4">
      <h2 className="text-lg font-semibold mb-3">{division.name}</h2>

      {existingFixtures === null && <p className="text-gray-500 text-sm">Loading…</p>}

      {existingFixtures !== null && existingFixtures.length > 0 && (
        <RoundsTable rounds={groupByRound(existingFixtures)} teamName={teamName} />
      )}

      {existingFixtures !== null && existingFixtures.length === 0 && !scheduled && (
        <button
          onClick={handleGenerate}
          disabled={teams.length < 2}
          className="px-4 py-2 rounded bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
        >
          Generate round robin ({teams.length} teams)
        </button>
      )}
      {existingFixtures !== null && existingFixtures.length === 0 && teams.length < 2 && (
        <p className="text-xs text-gray-500 mt-2">Needs at least 2 teams — assign some under Grouping first.</p>
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

          {scheduled.map(({ round, ties, bye }) => (
            <div key={round} className="mb-4">
              <p className="text-sm font-semibold text-gray-700 mb-1">
                Round {round} — Week of {formatWeekDate(weekOf(startWeekend, round))}
              </p>
              <table className="w-full text-sm border mb-1">
                <thead className="bg-gray-50">
                  <tr><th className="text-left p-2">Home</th><th className="text-left p-2">Away</th><th className="p-2"></th></tr>
                </thead>
                <tbody>
                  {ties.map((t, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-medium">{teamName(t.home)}</td>
                      <td className="p-2">{teamName(t.away)}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {t.swapped && <span className="text-xs text-teal-700 mr-2">(auto-swapped, Req 4.9)</span>}
                        <button onClick={() => overrideHomeAway(round, i)} className="text-xs text-gray-500 underline">
                          swap
                        </button>
                      </td>
                    </tr>
                  ))}
                  {bye && (
                    <tr className="border-t bg-gray-50">
                      <td className="p-2 font-medium">{teamName(bye)}</td>
                      <td className="p-2 text-gray-500 italic" colSpan={2}>Rest</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}

          <button
            onClick={handleRelease}
            disabled={saving}
            className="mt-2 px-4 py-2 rounded bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Releasing…' : 'Release fixtures to teams'}
          </button>
        </>
      )}
    </div>
  );
}

/** Groups already-released fixture rows by round_number for display. */
function groupByRound(fixtures) {
  const byRound = new Map();
  for (const f of fixtures) {
    if (!byRound.has(f.round_number)) byRound.set(f.round_number, { round: f.round_number, weekDate: f.week_date, ties: [], bye: null });
    const r = byRound.get(f.round_number);
    if (f.is_bye) r.bye = f.away_team_id ?? f.home_team_id; // resting team lives wherever it was stored
    else r.ties.push({ home: f.home_team_id, away: f.away_team_id, swapped: false });
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
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
