// src/pages/admin/FixtureGenerationPage.jsx
//
// Req 4.1–4.12: a viewer for fixtures already generated on the Grouping
// page (that's where "Generate Fixtures" lives — a division is ready the
// moment its grouping is settled, and assignHomeAway guarantees the Req
// 4.6 home/away balance algorithmically, so there's no preview/override
// step at generation time). Pick a division from the list box; if it has
// no generated fixtures yet, nothing is shown.
//
// Admins can still manually swap a fixture's home/away after the fact —
// gated by each division's own fixtures_locked flag (defaults unlocked,
// like every other lock in this app except Purge Data): only while
// unlocked can a swap be made, so a division can be locked once its
// schedule is confirmed correct.
//
// Freeze is a separate, bigger step (divisions.fixtures_frozen): scores
// can't be entered for a division at all — by anyone, captain or admin,
// see ScoreEntryPage/UpdateScoresPage — until it's frozen. Freezing also
// locks grouping (no more adding/removing teams), and can't be done
// until the WHOLE SEASON is ready: no team left unassigned, and every
// division already has fixtures generated — freezing one division while
// the season's overall structure is still being set up would let scores
// get entered against a schedule the rest of the season might still
// reshuffle.
//
// Switching divisions keeps the previously-shown schedule on screen
// until the new one has loaded (instead of flashing to a "Loading…"
// placeholder), and scrolls the content area's top edge into a fixed
// viewport position on every switch — a min-height alone only stops the
// page collapsing when a shorter division follows a taller one; it does
// nothing for the reverse (many rounds down to none), which is what
// produced the jarring jump this anchoring fixes in both directions.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { homeAwayBalanceReport } from '../../lib/scheduler.js';
import TeamLink from '../../components/TeamLink.jsx';

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
    else r.ties.push({ id: f.id, home: f.home_team_id, away: f.away_team_id });
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

export default function FixtureGenerationPage({ seasonId }) {
  const { divisions, refreshDivisions } = useSeason();
  const { isAdmin } = useAuth();
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [teams, setTeams] = useState([]);
  const [fixtures, setFixtures] = useState(null); // null = never loaded yet (first load only)
  const requestId = useRef(0);
  const contentRef = useRef(null);

  useEffect(() => {
    if (!selectedDivisionId && divisions.length > 0) setSelectedDivisionId(divisions[0].id);
  }, [divisions, selectedDivisionId]);

  // A min-height only stops the page collapsing when a shorter division
  // follows a taller one — it does nothing when the reverse happens (a
  // division with many rounds followed by one with none). Anchoring
  // scroll to the top of the content area on every switch, before the
  // new data even arrives, keeps a fixed reference point regardless of
  // how much the content's height changes either way.
  useEffect(() => {
    contentRef.current?.scrollIntoView({ block: 'start' });
  }, [selectedDivisionId]);

  const loadFixtures = useCallback(async () => {
    if (!selectedDivisionId) return;
    const thisRequest = ++requestId.current;

    const [{ data: teamRows }, { data: fixtureRows }] = await Promise.all([
      supabase.from('team_seasons').select('team_id, teams(id, name)').eq('season_id', seasonId).eq('division_id', selectedDivisionId),
      supabase
        .from('fixtures')
        .select('id, round_number, week_date, home_team_id, away_team_id, is_bye')
        .eq('season_id', seasonId)
        .eq('division_id', selectedDivisionId)
        .order('round_number'),
    ]);

    if (thisRequest !== requestId.current) return; // a newer division switch superseded this
    setTeams((teamRows || []).map((r) => r.teams));
    setFixtures(fixtureRows || []);
  }, [seasonId, selectedDivisionId]);

  useEffect(() => { loadFixtures(); }, [loadFixtures]);

  const division = divisions.find((d) => d.id === selectedDivisionId) ?? null;

  async function toggleFixturesLock() {
    if (!division) return;
    const { error } = await supabase.from('divisions').update({ fixtures_locked: !division.fixtures_locked }).eq('id', division.id);
    if (error) { alert(error.message); return; }
    refreshDivisions();
  }

  async function toggleFreeze() {
    if (!division) return;

    if (division.fixtures_frozen) {
      if (!confirm(`Unfreeze "${division.name}"? Scores can no longer be entered for it until it's frozen again.`)) return;
      const { error } = await supabase.from('divisions').update({ fixtures_frozen: false }).eq('id', division.id);
      if (error) { alert(error.message); return; }
      refreshDivisions();
      return;
    }

    // Freezing is season-wide readiness, not just this division: nothing
    // left unassigned, and every division already has fixtures generated.
    const [{ count: unassignedCount, error: unassignedErr }, { data: allFixtures, error: fixturesErr }] = await Promise.all([
      supabase.from('team_seasons').select('id', { count: 'exact', head: true }).eq('season_id', seasonId).is('division_id', null),
      supabase.from('fixtures').select('division_id').eq('season_id', seasonId),
    ]);
    if (unassignedErr) { alert(unassignedErr.message); return; }
    if (fixturesErr) { alert(fixturesErr.message); return; }

    if (unassignedCount > 0) {
      alert(`${unassignedCount} team(s) are still in the unassigned pool — place every team into a division under Grouping before freezing.`);
      return;
    }

    const divisionsWithFixtures = new Set((allFixtures || []).map((f) => f.division_id));
    const missing = divisions.filter((d) => !divisionsWithFixtures.has(d.id));
    if (missing.length > 0) {
      alert(`Fixtures haven't been generated yet for: ${missing.map((d) => d.name).join(', ')}. Generate fixtures for every division under Grouping first.`);
      return;
    }

    if (!confirm(`Freeze "${division.name}"? This locks its roster (no more adding or removing teams) and allows scores to be entered for it. This can be undone by unfreezing.`)) return;

    const { error } = await supabase.from('divisions').update({ fixtures_frozen: true, grouping_locked: true }).eq('id', division.id);
    if (error) { alert(error.message); return; }
    refreshDivisions();
  }

  async function swapHomeAway(tie) {
    if (division?.fixtures_locked) { alert(`"${division.name}"'s fixtures are locked. Unlock them first to swap home/away.`); return; }
    const { error } = await supabase.from('fixtures').update({ home_team_id: tie.away, away_team_id: tie.home }).eq('id', tie.id);
    if (error) { alert(error.message); return; }
    loadFixtures();
  }

  const teamName = (id) => teams.find((t) => t.id === id)?.name ?? '—';
  const rounds = fixtures ? groupByRound(fixtures) : [];
  // homeAwayBalanceReport (scheduler.js) only reads each round's `ties`
  // ({home, away} team ids), which groupByRound's output already matches.
  const balanceReport = isAdmin
    ? homeAwayBalanceReport(rounds).sort((a, b) => teamName(a.teamId).localeCompare(teamName(b.teamId)))
    : [];

  if (divisions.length === 0) {
    return <p className="p-6 text-gray-500">This season has no divisions yet — create one under Divisions first.</p>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Fixtures</h1>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <label className="text-sm text-gray-700">
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

        {division && (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-1 rounded ${division.fixtures_locked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                Swaps {division.fixtures_locked ? 'Locked' : 'Unlocked'}
              </span>
              <button onClick={toggleFixturesLock} className="text-xs text-teal-700 underline">
                {division.fixtures_locked ? 'Unlock swaps' : 'Lock swaps'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-1 rounded ${division.fixtures_frozen ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {division.fixtures_frozen ? 'Frozen' : 'Not Frozen'}
              </span>
              <button onClick={toggleFreeze} className="text-xs text-teal-700 underline">
                {division.fixtures_frozen ? 'Unfreeze' : 'Freeze'}
              </button>
            </div>
          </div>
        )}
      </div>

      {division && !division.fixtures_frozen && (
        <p className="text-xs text-gray-500 mb-4">
          Scores can't be entered for this division until it's frozen — see Update Scores.
        </p>
      )}

      <div ref={contentRef} style={{ minHeight: '16rem' }}>
        {fixtures === null && <p className="text-gray-500 text-sm">Loading…</p>}

        {fixtures !== null && fixtures.length === 0 && (
          <p className="text-gray-500 text-sm">
            No fixtures generated yet for this division — use Grouping to generate them.
          </p>
        )}

        {fixtures !== null && fixtures.length > 0 && (
          <>
            {isAdmin && <HomeAwayCountsTable report={balanceReport} teamName={teamName} />}
            <RoundsTable
              rounds={rounds}
              teamName={teamName}
              onSwap={division?.fixtures_locked ? null : swapHomeAway}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Admin/super_admin only — how many times each team is home vs away across the whole generated schedule (Req 4.6). */
function HomeAwayCountsTable({ report, teamName }) {
  return (
    <div className="mb-4 max-w-xs">
      <p className="text-sm font-semibold text-gray-700 mb-1">Home / Away count</p>
      <table className="w-full text-sm border">
        <thead className="bg-teal-50">
          <tr>
            <th className="text-left p-2">Team</th>
            <th className="p-2">Home</th>
            <th className="p-2">Away</th>
          </tr>
        </thead>
        <tbody>
          {report.map((r) => (
            <tr key={r.teamId} className={`border-t ${r.balanced ? '' : 'bg-amber-50'}`}>
              <td className="p-2 font-medium"><TeamLink teamId={r.teamId}>{teamName(r.teamId)}</TeamLink></td>
              <td className="p-2 text-center">{r.home}</td>
              <td className="p-2 text-center">{r.away}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoundsTable({ rounds, teamName, onSwap }) {
  return (
    <>
      {rounds.map(({ round, weekDate, ties, bye }) => (
        <div key={round} className="mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-1">
            Round {round} — Week of {formatWeekDate(weekDate)}
          </p>
          <table className="w-full text-sm border mb-1">
            <thead className="bg-teal-50">
              <tr><th className="text-left p-2">Home</th><th className="text-left p-2">Away</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {ties.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2 font-medium"><TeamLink teamId={t.home}>{teamName(t.home)}</TeamLink></td>
                  <td className="p-2"><TeamLink teamId={t.away}>{teamName(t.away)}</TeamLink></td>
                  <td className="p-2 text-right">
                    {onSwap && (
                      <button onClick={() => onSwap(t)} className="text-xs text-gray-500 underline">
                        swap
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {bye && (
                <tr className="border-t bg-gray-50">
                  <td className="p-2 font-medium"><TeamLink teamId={bye}>{teamName(bye)}</TeamLink></td>
                  <td className="p-2 text-gray-500 italic" colSpan={2}>Rest</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
