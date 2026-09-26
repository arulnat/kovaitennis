// src/pages/public/FixturesCalendarPage.jsx
//
// Req 4.8 — a single page with every frozen division's fixtures laid
// out together (Home vs Away, clearly labeled), so it can be circulated
// to captains/players as one document instead of them hunting through
// individual division views. Public — no login required, same as
// Standings — since the whole point is to circulate it widely.
//
// Only shows anything once the season is published (seasons.published):
// an unpublished season's schedule can still change (Fixtures page), so
// it isn't ready to hand out yet. The moment an admin publishes, every
// division with fixtures appears here automatically.
//
// "Download" is the browser's own Print -> Save as PDF, not a CSV: a
// spreadsheet can't carry the color-coded, styled layout this page uses,
// and PDF is what actually gets circulated/printed in practice. The
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
import PageHeader from '../../components/PageHeader.jsx';

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
      // applied for print — verified experimentally (print-to-PDF, then
      // counting the resulting pages) rather than derived from a known
      // cause; 1.0 (no margin) consistently produced 2 pages instead of
      // 1, and this value was the largest (least-shrinking, most
      // legible) one that still reliably held to a single page across
      // repeated tries. Revisit if a much larger season (many more
      // divisions/rounds) is ever found to still spill onto a second
      // page — it may need to go lower still.
      const SAFETY_MARGIN = 0.65;
      const scale = Math.min(1, PRINT_AREA_WIDTH_PX / el.scrollWidth, PRINT_AREA_HEIGHT_PX / el.scrollHeight) * SAFETY_MARGIN;
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
      <PageHeader
        title="Fixtures Calendar"
        subtitle="Every division's fixtures once the season is published, all in one place — Home vs Away for each round. Nothing shows here until then."
        actions={
          <button
            onClick={() => window.print()}
            disabled={!fixturesByDivision || shownDivisions.length === 0}
            className="no-print px-4 py-2 rounded bg-teal-700 text-white text-sm font-bold uppercase tracking-wide hover:bg-teal-800 disabled:opacity-50 shadow"
          >
            Print / Save as PDF
          </button>
        }
      />

      {shownDivisions.length === 0 && (
        <p className="text-slate-500 text-sm">The season hasn't been published yet.</p>
      )}

      {fixturesByDivision === null && shownDivisions.length > 0 && (
        <p className="text-slate-500 text-sm">Loading…</p>
      )}

      {fixturesByDivision && (
        <div ref={printableRef} className="fixtures-print-fit">
          {shownDivisions.map((d) => (
            <div key={d.id} className="mb-8">
              <h2 className="text-white bg-teal-900 rounded-t px-3 py-2 text-base font-extrabold uppercase tracking-wide border-b-2 border-accent-500">{d.name}</h2>
              <div className="border border-t-0 border-teal-100 rounded-b p-3">
                {(fixturesByDivision[d.id] || []).length === 0 ? (
                  <p className="text-slate-500 text-sm">No fixtures.</p>
                ) : (
                  groupByRound(fixturesByDivision[d.id]).map(({ round, weekDate, ties, bye }) => (
                    <div key={round} className="mb-4 last:mb-0">
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
      )}
    </div>
  );
}
