// src/pages/public/RisingStarsPage.jsx
//
// Req 6.6/6.8 — individual standings, singles and doubles kept separate,
// ranked by wins -> sets diff -> games diff, residual ties sharing rank
// (computeIndividualStandings, standings.js) — combined across every
// division by default (6.8's cross-group leaderboard), or scoped to one
// division (6.6's per-group list) and, within that, to one team, to spot
// that team's standout players. Public — no login required, same as
// Standings (Req 10.5).
//
// Doubles credits each individual player, not the pair (Req 6.6) — a
// player's doubles1 and doubles2 rubbers are combined into one figure,
// not shown separately, since the toggle here is singles vs. doubles as
// a whole, not per doubles slot.

import { useEffect, useState } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { computeIndividualStandings } from '../../lib/standings.js';
import TeamLink from '../../components/TeamLink.jsx';
import PlayerLink from '../../components/PlayerLink.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Dropdown from '../../components/Dropdown.jsx';

const ALL_DIVISIONS = '__all__';
const ALL_TEAMS = '__all__';

/** One row per player, aggregated from every scored rubber of the given kind — doubles combines doubles1 + doubles2 rubbers into one figure per player (Req 6.6). */
function aggregatePlayerStats(fixtures, kind) {
  const rubberTypes = kind === 'singles' ? ['singles'] : ['doubles1', 'doubles2'];
  const byPlayer = new Map();

  function credit(playerId, teamId, divisionId, playerName, teamName, divisionName, won, setsWon, setsLost, gamesWon, gamesLost) {
    const rec = byPlayer.get(playerId) ?? {
      playerId, teamId, divisionId, playerName, teamName, divisionName,
      wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0,
    };
    rec.wins += won ? 1 : 0;
    rec.losses += won ? 0 : 1;
    rec.setsWon += setsWon; rec.setsLost += setsLost;
    rec.gamesWon += gamesWon; rec.gamesLost += gamesLost;
    byPlayer.set(playerId, rec);
  }

  for (const f of fixtures) {
    for (const r of f.rubbers ?? []) {
      if (!rubberTypes.includes(r.rubber_type) || !r.winner_side || !r.confirmed_at) continue;

      let homeSetsWon = 0, homeSetsLost = 0, homeGamesWon = 0, homeGamesLost = 0;
      for (const n of [1, 2, 3]) {
        const h = r[`set${n}_home`], a = r[`set${n}_away`];
        if (h == null) continue;
        homeGamesWon += h; homeGamesLost += a;
        if (h > a) homeSetsWon++; else homeSetsLost++;
      }
      const homeWon = r.winner_side === 'home';

      for (const pid of [r.home_player1_id, r.home_player2_id].filter(Boolean)) {
        credit(pid, f.home_team_id, f.division_id, r.homeNames?.[pid], f.homeTeamName, f.divisionName,
          homeWon, homeSetsWon, homeSetsLost, homeGamesWon, homeGamesLost);
      }
      for (const pid of [r.away_player1_id, r.away_player2_id].filter(Boolean)) {
        credit(pid, f.away_team_id, f.division_id, r.awayNames?.[pid], f.awayTeamName, f.divisionName,
          !homeWon, homeSetsLost, homeSetsWon, homeGamesLost, homeGamesWon);
      }
    }
  }
  return [...byPlayer.values()];
}

export default function RisingStarsPage({ seasonId }) {
  const { divisions } = useSeason();
  const [kind, setKind] = useState('singles'); // 'singles' | 'doubles'
  const [divisionId, setDivisionId] = useState(ALL_DIVISIONS);
  const [teamId, setTeamId] = useState(ALL_TEAMS);
  const [nameSearch, setNameSearch] = useState('');
  const [rows, setRows] = useState(null); // null = loading
  const [teamsInScope, setTeamsInScope] = useState([]);

  useEffect(() => { setTeamId(ALL_TEAMS); }, [divisionId]);

  useEffect(() => {
    if (!seasonId) { setRows([]); return; }
    let cancelled = false;

    async function load() {
      setRows(null);

      let fixtureQuery = supabase
        .from('fixtures')
        .select(`
          id, division_id, home_team_id, away_team_id,
          teams_home:teams!fixtures_home_team_id_fkey(id, name),
          teams_away:teams!fixtures_away_team_id_fkey(id, name),
          divisions(id, name),
          rubbers(rubber_type, winner_side, confirmed_at, home_player1_id, home_player2_id, away_player1_id, away_player2_id, set1_home, set1_away, set2_home, set2_away, set3_home, set3_away)
        `)
        .eq('season_id', seasonId)
        .eq('is_bye', false);
      if (divisionId !== ALL_DIVISIONS) fixtureQuery = fixtureQuery.eq('division_id', divisionId);

      const { data: fixtureRows } = await fixtureQuery;
      if (cancelled) return;

      const playerIds = new Set();
      for (const f of fixtureRows || []) {
        for (const r of f.rubbers ?? []) {
          for (const pid of [r.home_player1_id, r.home_player2_id, r.away_player1_id, r.away_player2_id]) {
            if (pid) playerIds.add(pid);
          }
        }
      }
      const { data: playerRows } = playerIds.size > 0
        ? await supabase.from('players').select('id, name').in('id', [...playerIds])
        : { data: [] };
      if (cancelled) return;
      const nameOf = Object.fromEntries((playerRows || []).map((p) => [p.id, p.name]));

      const fixtures = (fixtureRows || []).map((f) => ({
        ...f,
        homeTeamName: f.teams_home?.name,
        awayTeamName: f.teams_away?.name,
        divisionName: f.divisions?.name,
        rubbers: (f.rubbers ?? []).map((r) => ({
          ...r,
          homeNames: { [r.home_player1_id]: nameOf[r.home_player1_id], [r.home_player2_id]: nameOf[r.home_player2_id] },
          awayNames: { [r.away_player1_id]: nameOf[r.away_player1_id], [r.away_player2_id]: nameOf[r.away_player2_id] },
        })),
      }));

      const teamsSeen = new Map();
      for (const f of fixtures) {
        if (f.home_team_id) teamsSeen.set(f.home_team_id, f.homeTeamName);
        if (f.away_team_id) teamsSeen.set(f.away_team_id, f.awayTeamName);
      }
      if (!cancelled) setTeamsInScope([...teamsSeen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));

      const stats = aggregatePlayerStats(fixtures, kind);
      const ranked = computeIndividualStandings(stats);
      if (!cancelled) setRows(ranked);
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId, kind, divisionId]);

  const teamFiltered = teamId === ALL_TEAMS ? rows : (rows ?? []).filter((r) => r.teamId === teamId);
  const search = nameSearch.trim().toLowerCase();
  const shownRows = search ? (teamFiltered ?? []).filter((r) => r.playerName?.toLowerCase().includes(search)) : teamFiltered;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PageHeader title="Rising Stars" subtitle="Individual leaderboard — most wins first, tied on wins broken by sets +/-, then games +/-." />

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex border-2 border-accent-500 rounded overflow-hidden">
          {['singles', 'doubles'].map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-4 py-1.5 text-sm font-bold uppercase tracking-wide ${kind === k ? 'bg-teal-900 text-white' : 'bg-white text-teal-800 hover:bg-teal-50'}`}
            >
              {k}
            </button>
          ))}
        </div>

        <Dropdown
          value={divisionId}
          onChange={setDivisionId}
          options={[{ value: ALL_DIVISIONS, label: 'Show All (every division)' }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]}
          className="w-48"
        />

        <Dropdown
          value={teamId}
          onChange={setTeamId}
          options={[{ value: ALL_TEAMS, label: 'All Teams' }, ...teamsInScope.map((t) => ({ value: t.id, label: t.name }))]}
          className="w-40"
        />

        <input
          type="text"
          value={nameSearch}
          onChange={(e) => setNameSearch(e.target.value)}
          placeholder="Search for a player…"
          className="border rounded px-2 py-1.5 text-sm flex-1 min-w-[10rem]"
        />
      </div>

      {shownRows === null ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : shownRows.length === 0 ? (
        <p className="text-gray-500 text-sm">{search ? `No ${kind} players matching "${nameSearch}".` : `No ${kind} results yet.`}</p>
      ) : (
        <table className="w-full text-sm border rounded overflow-hidden shadow">
          <thead className="bg-teal-900 text-teal-50">
            <tr>
              <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Player</th>
              <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Team</th>
              <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Division</th>
              <th className="p-2 font-bold uppercase text-xs tracking-wide">W</th>
              <th className="p-2 font-bold uppercase text-xs tracking-wide">L</th>
              <th className="p-2 font-bold uppercase text-xs tracking-wide">Sets Won</th>
              <th className="p-2 font-bold uppercase text-xs tracking-wide">Sets Lost</th>
              <th className="p-2 font-bold uppercase text-xs tracking-wide">Games Won</th>
              <th className="p-2 font-bold uppercase text-xs tracking-wide">Games Lost</th>
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r, i) => (
              <tr key={r.playerId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="p-2 font-bold border-t"><PlayerLink playerId={r.playerId}>{r.playerName ?? '—'}</PlayerLink></td>
                <td className="p-2 border-t"><TeamLink teamId={r.teamId}>{r.teamName}</TeamLink></td>
                <td className="p-2 border-t text-gray-600">{r.divisionName}</td>
                <td className="p-2 text-center border-t font-extrabold">{r.wins}</td>
                <td className="p-2 text-center border-t font-extrabold">{r.losses}</td>
                <td className="p-2 text-center border-t">{r.setsWon}</td>
                <td className="p-2 text-center border-t">{r.setsLost}</td>
                <td className="p-2 text-center border-t">{r.gamesWon}</td>
                <td className="p-2 text-center border-t">{r.gamesLost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
