// src/pages/public/FixturesCalendarPage.jsx
//
// Req 4.8 — a single page with every frozen division's fixtures laid
// out together (Home vs Away, clearly labeled), so it can be circulated
// to captains/players as one document instead of them hunting through
// individual division views. Public — no login required, same as
// Standings — since the whole point is to circulate it widely.
//
// Only shows divisions that are frozen (divisions.fixtures_frozen): an
// unfrozen division's schedule can still change (Fixtures page), so it
// isn't ready to hand out yet. As each division gets frozen it appears
// here automatically — no separate "publish" step.

import { useEffect, useState } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { downloadCsv } from '../../lib/csv.js';

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/** Groups one division's fixture rows by round_number for display. */
function groupByRound(fixtures) {
  const byRound = new Map();
  for (const f of fixtures) {
    if (!byRound.has(f.round_number)) byRound.set(f.round_number, { round: f.round_number, weekDate: f.week_date, ties: [], bye: null });
    const r = byRound.get(f.round_number);
    if (f.is_bye) r.bye = f.teams_away?.name ?? f.teams_home?.name ?? '—';
    else r.ties.push({ id: f.id, home: f.teams_home?.name ?? '—', away: f.teams_away?.name ?? '—' });
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

export default function FixturesCalendarPage({ seasonId }) {
  const { divisions } = useSeason();
  const [fixturesByDivision, setFixturesByDivision] = useState(null); // null = loading

  const frozenDivisions = divisions.filter((d) => d.fixtures_frozen);

  useEffect(() => {
    if (!seasonId || frozenDivisions.length === 0) { setFixturesByDivision({}); return; }
    setFixturesByDivision(null);

    supabase
      .from('fixtures')
      .select(`
        division_id, round_number, week_date, is_bye,
        teams_home:teams!fixtures_home_team_id_fkey(name),
        teams_away:teams!fixtures_away_team_id_fkey(name)
      `)
      .eq('season_id', seasonId)
      .in('division_id', frozenDivisions.map((d) => d.id))
      .order('round_number')
      .then(({ data }) => {
        const byDivision = {};
        for (const d of frozenDivisions) byDivision[d.id] = [];
        for (const f of data || []) byDivision[f.division_id]?.push(f);
        setFixturesByDivision(byDivision);
      });
  }, [seasonId, divisions]);

  function downloadCalendar() {
    const rows = [['Division', 'Round', 'Week Date', 'Home', 'Away']];
    for (const d of frozenDivisions) {
      for (const f of fixturesByDivision[d.id] || []) {
        rows.push([
          d.name,
          f.round_number,
          f.week_date,
          f.is_bye ? '' : (f.teams_home?.name ?? ''),
          f.is_bye ? `${f.teams_away?.name ?? f.teams_home?.name ?? ''} (Rest)` : (f.teams_away?.name ?? ''),
        ]);
      }
    }
    downloadCsv(rows, 'fixtures-calendar.csv');
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h1 className="text-xl font-semibold">Fixtures Calendar</h1>
        <button
          onClick={downloadCalendar}
          disabled={!fixturesByDivision || frozenDivisions.length === 0}
          className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm disabled:opacity-50"
        >
          Download Calendar (CSV)
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        Every division's fixtures once frozen, all in one place — Home vs Away for each round. Divisions not
        yet frozen aren't shown here.
      </p>

      {frozenDivisions.length === 0 && (
        <p className="text-gray-500 text-sm">No divisions have been frozen yet.</p>
      )}

      {fixturesByDivision === null && frozenDivisions.length > 0 && (
        <p className="text-gray-500 text-sm">Loading…</p>
      )}

      {fixturesByDivision && frozenDivisions.map((d) => (
        <div key={d.id} className="mb-8">
          <h2 className="text-lg font-semibold mb-3">{d.name}</h2>
          {(fixturesByDivision[d.id] || []).length === 0 ? (
            <p className="text-gray-500 text-sm">No fixtures.</p>
          ) : (
            groupByRound(fixturesByDivision[d.id]).map(({ round, weekDate, ties, bye }) => (
              <div key={round} className="mb-4">
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  Round {round} — Week of {formatWeekDate(weekDate)}
                </p>
                <table className="w-full text-sm border mb-1">
                  <thead className="bg-gray-50">
                    <tr><th className="text-left p-2">Home</th><th className="text-left p-2">Away</th></tr>
                  </thead>
                  <tbody>
                    {ties.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="p-2 font-medium">{t.home}</td>
                        <td className="p-2">{t.away}</td>
                      </tr>
                    ))}
                    {bye && (
                      <tr className="border-t bg-gray-50">
                        <td className="p-2 font-medium">{bye}</td>
                        <td className="p-2 text-gray-500 italic">Rest</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
