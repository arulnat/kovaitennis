// src/pages/public/FixturesCalendarPage.jsx
//
// Req 4.8 — a single page with every division's fixtures laid out
// together, so it can be circulated to captains/players as one document
// instead of them hunting through individual division views. Public —
// no login required, same as Standings — since the whole point is to
// circulate it widely.
//
// One team-by-date grid per division: a row per team, a column per
// match date, each cell the opponent for that round — colored by
// home/away (see buildTeamDateGrid) — rather than a separate Home/Away
// table per round, so a team's whole schedule reads left-to-right in
// one line instead of being spread across many small per-round tables.
//
// Only shows anything once the season is published (seasons.published):
// an unpublished season's schedule can still change (Fixtures page), so
// it isn't ready to hand out yet. The moment an admin publishes, every
// division with fixtures appears here automatically.
//
// The small "Save" button (top right, no heading/description clutter on
// this page by design) is the browser's own Print -> Save as PDF, not a
// CSV: a spreadsheet can't carry the color-coded, styled layout this
// page uses, and PDF is what actually gets circulated/printed. The
// print stylesheet (index.css) keeps the colors instead of the browser's
// default plain-text printout and sets the page to landscape A4; on top
// of that, the whole schedule must always print as exactly one physical
// page regardless of how many teams/divisions/rounds there are, so
// printableRef below is continuously measured (via ResizeObserver, not a
// 'beforeprint' listener — automated print-to-PDF paths never fire that
// event, only the browser's own interactive Ctrl+P/window.print() dialog
// reliably does) and its scale baked into a CSS custom property that a
// @media print rule applies — correct before ANY print path captures the
// page, not just the browser's own dialog.

import { useEffect, useRef, useState } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import TeamLink from '../../components/TeamLink.jsx';

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * One division's fixtures reshaped into a team-by-date grid: a row per
 * team, a column per round/date, each cell the opponent played that
 * round (colored by home/away) or "Rest" on a bye.
 */
function buildTeamDateGrid(fixtures) {
  const roundDates = new Map(); // round_number -> week_date
  const teams = new Map(); // teamId -> name
  const cells = new Map(); // `${teamId}:${round}` -> {opponentId, opponentName, isHome} | 'bye'

  for (const f of fixtures) {
    roundDates.set(f.round_number, f.week_date);
    if (f.is_bye) {
      const resting = f.teams_away ?? f.teams_home;
      if (resting) {
        teams.set(resting.id, resting.name);
        cells.set(`${resting.id}:${f.round_number}`, 'bye');
      }
      continue;
    }
    if (f.teams_home && f.teams_away) {
      teams.set(f.teams_home.id, f.teams_home.name);
      teams.set(f.teams_away.id, f.teams_away.name);
      cells.set(`${f.teams_home.id}:${f.round_number}`, { opponentId: f.teams_away.id, opponentName: f.teams_away.name, isHome: true });
      cells.set(`${f.teams_away.id}:${f.round_number}`, { opponentId: f.teams_home.id, opponentName: f.teams_home.name, isHome: false });
    }
  }

  const rounds = [...roundDates.keys()].sort((a, b) => a - b);
  const teamRows = [...teams.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { rounds, roundDates, teamRows, cells };
}

// A4 landscape at 96dpi, minus the @page margin set in index.css (10mm ~
// 38px per side) — the printable area printableRef's content must fit
// inside once scaled.
const PRINT_AREA_WIDTH_PX = 1123 - 2 * 38;
const PRINT_AREA_HEIGHT_PX = 794 - 2 * 38;

export default function FixturesCalendarPage({ seasonId }) {
  const { divisions, activeSeason } = useSeason();
  const [fixturesByDivision, setFixturesByDivision] = useState(null); // null = loading
  const printableRef = useRef(null);

  const shownDivisions = activeSeason?.published ? divisions : [];

  // Shrink the whole schedule to fit one printed page, whatever its
  // actual size. Recomputed continuously (mount + every size change, via
  // ResizeObserver) rather than on a 'beforeprint' listener, since that
  // event only fires for the browser's own interactive print dialog —
  // Chrome's automated printToPDF path (and possibly other print-to-PDF
  // routes) never fires it, which previously left the page completely
  // unscaled. Baking the scale into a CSS custom property means it's
  // already correct by the time ANY print mechanism captures the page —
  // the @media print rule that consumes it (index.css) needs no JS to
  // run at print time at all.
  useEffect(() => {
    const el = printableRef.current;
    if (!el) return undefined;
    function updateScale() {
      // SAFETY_MARGIN: the on-screen measurement below reliably
      // undershoots how tall the content actually renders once `zoom` is
      // actually shrinking something for print — verified experimentally
      // (print-to-PDF, then counting the resulting pages) rather than
      // derived from a known cause; 1.0 (no margin) consistently produced
      // 2 pages instead of 1, and this value was the largest (least-
      // shrinking, most legible) one that still reliably held to a
      // single page across repeated tries. Only applied when shrinking
      // is actually needed (rawScale < 1) — a season short enough to
      // already fit at its natural size prints at natural size, no
      // needless extra shrink, since `zoom: 1` shouldn't carry the same
      // discrepancy a real zoom<1 does. Revisit the margin itself if a
      // much larger season (many more divisions/rounds) is ever found to
      // still spill onto a second page — it may need to go lower still.
      const SAFETY_MARGIN = 0.65;
      const rawScale = Math.min(1, PRINT_AREA_WIDTH_PX / el.scrollWidth, PRINT_AREA_HEIGHT_PX / el.scrollHeight);
      const scale = rawScale < 1 ? rawScale * SAFETY_MARGIN : 1;
      el.style.setProperty('--print-scale', String(scale));
    }
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fixturesByDivision]);

  useEffect(() => {
    if (!seasonId || shownDivisions.length === 0) { setFixturesByDivision({}); return; }
    setFixturesByDivision(null);

    supabase
      .from('fixtures')
      .select(`
        division_id, round_number, week_date, is_bye,
        teams_home:teams!fixtures_home_team_id_fkey(id, name),
        teams_away:teams!fixtures_away_team_id_fkey(id, name)
      `)
      .eq('season_id', seasonId)
      .in('division_id', shownDivisions.map((d) => d.id))
      .order('round_number')
      .then(({ data }) => {
        const byDivision = {};
        for (const d of shownDivisions) byDivision[d.id] = [];
        for (const f of data || []) byDivision[f.division_id]?.push(f);
        setFixturesByDivision(byDivision);
      });
  }, [seasonId, divisions, activeSeason?.published]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-end mb-4 no-print">
        <button
          onClick={() => window.print()}
          disabled={!fixturesByDivision || shownDivisions.length === 0}
          className="px-3 py-1 rounded bg-teal-700 text-white text-xs font-bold uppercase tracking-wide hover:bg-teal-800 disabled:opacity-50 shadow"
        >
          Save
        </button>
      </div>

      {shownDivisions.length === 0 && (
        <p className="text-slate-500 text-sm">The season hasn't been published yet.</p>
      )}

      {fixturesByDivision === null && shownDivisions.length > 0 && (
        <p className="text-slate-500 text-sm">Loading…</p>
      )}

      {fixturesByDivision && (
        <div ref={printableRef} className="fixtures-print-fit">
          {shownDivisions.map((d) => {
            const grid = buildTeamDateGrid(fixturesByDivision[d.id] || []);
            return (
              <div key={d.id} className="mb-2">
                <h2 className="text-white bg-teal-900 rounded-t px-3 py-1.5 text-base font-extrabold uppercase tracking-wide border-b-2 border-accent-500">{d.name}</h2>
                <div className="border border-t-0 border-teal-100 rounded-b px-3 pt-1 overflow-x-auto">
                  {grid.teamRows.length === 0 ? (
                    <p className="text-slate-500 text-sm">No fixtures.</p>
                  ) : (
                    <table className="text-sm border-collapse">
                      <thead className="bg-teal-100">
                        <tr>
                          <th className="text-left py-1 px-2 text-teal-900 whitespace-nowrap">Team</th>
                          {grid.rounds.map((r) => (
                            <th key={r} className="py-1 px-2 text-teal-900 text-xs whitespace-nowrap">{formatWeekDate(grid.roundDates.get(r))}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grid.teamRows.map((team, i) => (
                          <tr key={team.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="py-0.5 px-2 font-semibold text-slate-800 border-t border-slate-200 whitespace-nowrap">
                              <TeamLink teamId={team.id}>{team.name}</TeamLink>
                            </td>
                            {grid.rounds.map((r) => {
                              const cell = grid.cells.get(`${team.id}:${r}`);
                              return (
                                <td key={r} className="py-0.5 px-2 text-center border-t border-slate-200 whitespace-nowrap">
                                  {cell === 'bye' ? (
                                    <span className="text-slate-400 italic text-xs">Rest</span>
                                  ) : cell ? (
                                    <TeamLink
                                      teamId={cell.opponentId}
                                      className={`font-bold hover:underline ${cell.isHome ? 'text-teal-700' : 'text-accent-600'}`}
                                    >
                                      {cell.opponentName}
                                    </TeamLink>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
