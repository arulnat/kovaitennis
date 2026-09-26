// src/pages/public/StandingsPage.jsx
//
// Req 6.1, 6.5, 6.9: per-group team standings, top-2/bottom-2 highlighted.
// Computed live from `rubbers`/`fixtures` via standings.js — never cached,
// so a same-day score correction (Req 5.7) shows up immediately.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { computeTeamStandings, highlightBands } from '../../lib/standings.js';
import TeamLink from '../../components/TeamLink.jsx';
import PageHeader from '../../components/PageHeader.jsx';

export default function StandingsPage({ seasonId, divisionId }) {
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
        .filter((f) => f.rubbers?.length === 3 && f.rubbers.every((r) => r.winner_side))
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

  if (!rows) return <p className="p-6">Loading standings…</p>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader title="Standings" />
      <table className="w-full text-sm border rounded overflow-hidden shadow">
        <thead className="bg-teal-900 text-teal-50">
          <tr>
            <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Team</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">P</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">W</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">L</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">Pts</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">Sets +/-</th>
            <th className="p-2 font-bold uppercase text-xs tracking-wide">Games +/-</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.teamId}
              className={
                r.highlight === 'top' ? 'bg-accent-400/30' : r.highlight === 'bottom' ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50'
              }
            >
              <td className="p-2 font-bold border-t"><TeamLink teamId={r.teamId}>{teamNames[r.teamId]}</TeamLink></td>
              <td className="p-2 text-center border-t">{r.played}</td>
              <td className="p-2 text-center border-t">{r.wins}</td>
              <td className="p-2 text-center border-t">{r.losses}</td>
              <td className="p-2 text-center border-t font-extrabold">{r.points}</td>
              <td className="p-2 text-center border-t">{r.setsDiff}</td>
              <td className="p-2 text-center border-t">{r.gamesDiff}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-2">
        Top 2 (gold) and bottom 2 (red) highlighted per Req 6.5. Teams tied after every tiebreak level share the same rank (Req 6.4).
      </p>
    </div>
  );
}
