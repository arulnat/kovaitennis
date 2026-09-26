// src/pages/public/StandingsPage.jsx
//
// Req 6.1, 6.5, 6.9: per-group team standings, top-2/bottom-2 highlighted.
// Computed live from `rubbers`/`fixtures` via standings.js — never cached,
// so a same-day score correction (Req 5.7) shows up immediately.
//
// Switches division via an in-page tab row (every division in the
// season, always visible) rather than sending people up to the nav
// bar's division dropdown — that dropdown still exists (other pages
// still depend on it), and clicking a tab here moves it too, so the two
// stay in sync instead of becoming a second, disconnected selector.

import { useEffect, useState } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { computeTeamStandings, highlightBands } from '../../lib/standings.js';
import TeamLink from '../../components/TeamLink.jsx';
import PageHeader from '../../components/PageHeader.jsx';

export default function StandingsPage() {
  const { seasonId, divisions, divisionId, setDivisionId } = useSeason();
  const [rows, setRows] = useState(null);
  const [teamNames, setTeamNames] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: teamSeasons } = await supabase
        .from('team_seasons')
        .select('team_id, teams(id, name)')
        .eq('season_id', seasonId)
        .eq('division_id', divisionId);

      const teamIds = (teamSeasons || []).map((r) => r.team_id);
      const names = Object.fromEntries((teamSeasons || []).map((r) => [r.team_id, r.teams.name]));

      const { data: fixtures } = await supabase
        .from('fixtures')
        .select('id, home_team_id, away_team_id, rubbers(*)')
        .eq('season_id', seasonId)
        .eq('division_id', divisionId)
        .eq('status', 'complete'); // adjust to your actual "all 3 rubbers in" marker

      const ties = (fixtures || [])
        .filter((f) => f.rubbers?.length === 3 && f.rubbers.every((r) => r.winner_side && r.confirmed_at))
        .map((f) => {
          const homeWins = f.rubbers.filter((r) => r.winner_side === 'home').length;
          const winner = homeWins >= 2 ? 'home' : 'away';
          let homeSetsWon = 0, homeSetsLost = 0, homeGamesWon = 0, homeGamesLost = 0;
          for (const r of f.rubbers) {
            const sets = [[r.set1_home, r.set1_away], [r.set2_home, r.set2_away], [r.set3_home, r.set3_away]]
              .filter(([h]) => h != null);
            for (const [h, a] of sets) {
              homeGamesWon += h; homeGamesLost += a;
              if (h > a) homeSetsWon++; else homeSetsLost++;
            }
          }
          return {
            homeTeamId: f.home_team_id, awayTeamId: f.away_team_id, winner,
            homeSetsWon, homeSetsLost, homeGamesWon, homeGamesLost,
          };
        });

      if (!cancelled) {
        const standings = computeTeamStandings(teamIds, ties);
        setRows(highlightBands(standings, teamIds.length));
        setTeamNames(names);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId, divisionId]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader title="Standings" />

      {divisions.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {divisions.map((d) => (
            <button
              key={d.id}
              onClick={() => setDivisionId(d.id)}
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
                d.id === divisionId ? 'bg-teal-900 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {!rows ? (
        <p className="text-gray-500 text-sm">Loading standings…</p>
      ) : (
      <table className="w-full text-sm border rounded overflow-hidden shadow">
        <thead className="bg-teal-900 text-teal-50">
          <tr>
            <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Team</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">P</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">W</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">L</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">Pts</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">Sets Won</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">Sets Lost</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">Games Won</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">Games Lost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.teamId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td
                className={`p-2 font-bold border-t ${
                  r.highlight === 'top' ? 'border-l-4 border-l-accent-500' : r.highlight === 'bottom' ? 'border-l-4 border-l-red-500' : ''
                }`}
              >
                <TeamLink teamId={r.teamId}>{teamNames[r.teamId]}</TeamLink>
              </td>
              <td className="p-2 text-center border-t">{r.played}</td>
              <td className="p-2 text-center border-t">{r.wins}</td>
              <td className="p-2 text-center border-t">{r.losses}</td>
              <td className="p-2 text-center border-t font-extrabold">{r.points}</td>
              <td className="p-2 text-center border-t">{r.setsWon}</td>
              <td className="p-2 text-center border-t">{r.setsLost}</td>
              <td className="p-2 text-center border-t">{r.gamesWon}</td>
              <td className="p-2 text-center border-t">{r.gamesLost}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
      {rows && (
        <p className="text-xs text-gray-500 mt-2">
          Top 2 (gold) and bottom 2 (red) marked with a colored edge. Teams tied after every tiebreak level share the same rank.
        </p>
      )}
    </div>
  );
}
