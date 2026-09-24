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
//
// "Download" is the browser's own Print -> Save as PDF, not a CSV: a
// spreadsheet can't carry the color-coded, styled layout this page uses,
// and PDF is what actually gets circulated/printed in practice. The
// print stylesheet (index.css) keeps the colors instead of the browser's
// default plain-text printout, and page-break rules keep a division's
// rounds from splitting awkwardly across pages.

import { useEffect, useState } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import TeamLink from '../../components/TeamLink.jsx';

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/** Groups one division's fixture rows by round_number for display. */
function groupByRound(fixtures) {
  const byRound = new Map();
  for (const f of fixtures) {
    if (!byRound.has(f.round_number)) byRound.set(f.round_number, { round: f.round_number, weekDate: f.week_date, ties: [], bye: null });
    const r = byRound.get(f.round_number);
    if (f.is_bye) {
      r.bye = f.teams_away
        ? { id: f.teams_away.id, name: f.teams_away.name }
        : f.teams_home
          ? { id: f.teams_home.id, name: f.teams_home.name }
          : null;
    } else {
      r.ties.push({
        id: f.id,
        homeId: f.teams_home?.id ?? null, home: f.teams_home?.name ?? '—',
        awayId: f.teams_away?.id ?? null, away: f.teams_away?.name ?? '—',
      });
    }
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
        teams_home:teams!fixtures_home_team_id_fkey(id, name),
        teams_away:teams!fixtures_away_team_id_fkey(id, name)
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h1 className="text-xl font-bold">Fixtures Calendar</h1>
        <button
          onClick={() => window.print()}
          disabled={!fixturesByDivision || frozenDivisions.length === 0}
          className="no-print px-3 py-1.5 rounded bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
        >
          Print / Save as PDF
        </button>
      </div>
      <p className="text-sm text-slate-600 mb-6 no-print">
        Every division's fixtures once frozen, all in one place — Home vs Away for each round. Divisions not
        yet frozen aren't shown here.
      </p>

      {frozenDivisions.length === 0 && (
        <p className="text-slate-500 text-sm">No divisions have been frozen yet.</p>
      )}

      {fixturesByDivision === null && frozenDivisions.length > 0 && (
        <p className="text-slate-500 text-sm">Loading…</p>
      )}

      {fixturesByDivision && frozenDivisions.map((d) => (
        <div key={d.id} className="mb-8" style={{ breakInside: 'avoid' }}>
          <h2 className="text-white bg-teal-700 rounded-t px-3 py-2 text-base font-bold">{d.name}</h2>
          <div className="border border-t-0 border-teal-100 rounded-b p-3">
            {(fixturesByDivision[d.id] || []).length === 0 ? (
              <p className="text-slate-500 text-sm">No fixtures.</p>
            ) : (
              groupByRound(fixturesByDivision[d.id]).map(({ round, weekDate, ties, bye }) => (
                <div key={round} className="mb-4 last:mb-0" style={{ breakInside: 'avoid' }}>
                  <p className="inline-block text-xs font-semibold text-teal-800 bg-teal-50 rounded px-2 py-1 mb-2">
                    Round {round} — Week of {formatWeekDate(weekDate)}
                  </p>
                  <table className="w-full text-sm border border-slate-200 rounded overflow-hidden mb-1">
                    <thead className="bg-teal-100">
                      <tr>
                        <th className="text-left p-2 text-teal-900">Home</th>
                        <th className="text-left p-2 text-teal-900">Away</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ties.map((t, i) => (
                        <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="p-2 font-medium text-slate-800 border-t border-slate-200">
                            <TeamLink teamId={t.homeId}>{t.home}</TeamLink>
                          </td>
                          <td className="p-2 text-slate-800 border-t border-slate-200">
                            <TeamLink teamId={t.awayId}>{t.away}</TeamLink>
                          </td>
                        </tr>
                      ))}
                      {bye && (
                        <tr className="bg-accent-400/20">
                          <td className="p-2 font-medium text-slate-800 border-t border-slate-200">
                            <TeamLink teamId={bye.id}>{bye.name}</TeamLink>
                          </td>
                          <td className="p-2 text-slate-600 italic border-t border-slate-200">Rest</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
