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
// default plain-text printout and sets the page to landscape A4 for more
// room; on top of that, the whole schedule must always print as exactly
// one physical page regardless of how many teams/divisions/rounds there
// are, so printableRef below is measured and scaled down (via CSS
// transform, right before the browser's print dialog opens) to fit
// within one page's printable area — the more there is to show, the
// smaller it prints, rather than spilling onto a second page.

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
  const { divisions } = useSeason();
  const [fixturesByDivision, setFixturesByDivision] = useState(null); // null = loading
  const printableRef = useRef(null);

  const frozenDivisions = divisions.filter((d) => d.fixtures_frozen);

  // Shrink the whole schedule to fit one printed page, whatever its actual
  // size — measured fresh right before printing (not on every render,
  // since the unscaled size is what needs measuring).
  useEffect(() => {
    function fitToOnePage() {
      const el = printableRef.current;
      if (!el) return;
      el.style.transform = 'none';
      el.style.width = '';
      const scale = Math.min(
        1,
        PRINT_AREA_WIDTH_PX / el.scrollWidth,
        PRINT_AREA_HEIGHT_PX / el.scrollHeight
      );
      el.style.transform = `scale(${scale})`;
      el.style.transformOrigin = 'top left';
      el.style.width = `${100 / scale}%`;
    }
    function resetAfterPrint() {
      const el = printableRef.current;
      if (!el) return;
      el.style.transform = '';
      el.style.width = '';
    }
    window.addEventListener('beforeprint', fitToOnePage);
    window.addEventListener('afterprint', resetAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', fitToOnePage);
      window.removeEventListener('afterprint', resetAfterPrint);
    };
  }, [fixturesByDivision]);

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
      <PageHeader
        title="Fixtures Calendar"
        subtitle="Every division's fixtures once frozen, all in one place — Home vs Away for each round. Divisions not yet frozen aren't shown here."
        actions={
          <button
            onClick={() => window.print()}
            disabled={!fixturesByDivision || frozenDivisions.length === 0}
            className="no-print px-4 py-2 rounded bg-teal-700 text-white text-sm font-bold uppercase tracking-wide hover:bg-teal-800 disabled:opacity-50 shadow"
          >
            Print / Save as PDF
          </button>
        }
      />

      {frozenDivisions.length === 0 && (
        <p className="text-slate-500 text-sm">No divisions have been frozen yet.</p>
      )}

      {fixturesByDivision === null && frozenDivisions.length > 0 && (
        <p className="text-slate-500 text-sm">Loading…</p>
      )}

      {fixturesByDivision && (
        <div ref={printableRef}>
          {frozenDivisions.map((d) => (
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
