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
//
// Clicking a team's row expands it in place to that team's completed
// ties this division/season (score vs opponent, then each rubber's
// players and set score, via the same RubberRow used on the public
// Results page) — click again to collapse. Any number of rows can be
// open at once.

import { Fragment, useEffect, useState } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { computeTeamStandings, highlightBands } from '../../lib/standings.js';
import { setsAndGamesFromRow } from '../../lib/scoring.js';
import TeamLink from '../../components/TeamLink.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import RubberRow from '../../components/RubberRow.jsx';

const RUBBER_ORDER = ['singles', 'doubles1', 'doubles2'];

export default function StandingsPage() {
  const { seasonId, divisions, divisionId: globalDivisionId, setDivisionId } = useSeason();
  const { role, teamId } = useAuth();
  const [myDivisionId, setMyDivisionId] = useState(undefined); // undefined = still looking up; null = not placed in one yet
  const [rows, setRows] = useState(null);
  const [teamNames, setTeamNames] = useState({});
  const [matchesByTeam, setMatchesByTeam] = useState({});
  const [nameOf, setNameOf] = useState({});
  const [expanded, setExpanded] = useState(new Set());

  // A team login only ever sees its own division's standings here — no
  // tabs to switch away, regardless of whatever division is selected
  // globally (nav bar) for other pages.
  const isTeamLogin = role === 'team';
  useEffect(() => {
    if (!isTeamLogin || !teamId || !seasonId) { setMyDivisionId(undefined); return; }
    let cancelled = false;
    supabase
      .from('team_seasons')
      .select('division_id')
      .eq('season_id', seasonId)
      .eq('team_id', teamId)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setMyDivisionId(data?.division_id ?? null); });
    return () => { cancelled = true; };
  }, [isTeamLogin, teamId, seasonId]);

  const divisionId = isTeamLogin ? myDivisionId : globalDivisionId;

  useEffect(() => { setExpanded(new Set()); }, [divisionId]);

  useEffect(() => {
    if (!divisionId) { setRows(isTeamLogin ? null : []); return undefined; }
    let cancelled = false;
    async function load() {
      // Independent of each other (both scoped by season+division alone)
      // — fire together rather than one round-trip at a time.
      const [{ data: teamSeasons }, { data: fixtures }] = await Promise.all([
        supabase
          .from('team_seasons')
          .select('team_id, teams(id, name)')
          .eq('season_id', seasonId)
          .eq('division_id', divisionId),
        // Which ties count is decided below (all 3 rubbers confirmed) — fixtures.status
        // is a separate scheduling field that's never actually transitioned to 'complete'
        // anywhere, so filtering on it here silently hid every finished tie.
        supabase
          .from('fixtures')
          .select('id, home_team_id, away_team_id, rubbers(*)')
          .eq('season_id', seasonId)
          .eq('division_id', divisionId),
      ]);

      const teamIds = (teamSeasons || []).map((r) => r.team_id);
      const names = Object.fromEntries((teamSeasons || []).map((r) => [r.team_id, r.teams.name]));

      const completed = (fixtures || [])
        .filter((f) => f.rubbers?.length === 3 && f.rubbers.every((r) => r.winner_side && r.confirmed_at));

      const ties = completed.map((f) => {
        const homeWins = f.rubbers.filter((r) => r.winner_side === 'home').length;
        const winner = homeWins >= 2 ? 'home' : 'away';
        let homeSetsWon = 0, homeSetsLost = 0, homeGamesWon = 0, homeGamesLost = 0;
        for (const r of f.rubbers) {
          const s = setsAndGamesFromRow(r);
          homeSetsWon += s.homeSetsWon; homeSetsLost += s.homeSetsLost;
          homeGamesWon += s.homeGamesWon; homeGamesLost += s.homeGamesLost;
        }
        return {
          homeTeamId: f.home_team_id, awayTeamId: f.away_team_id, winner,
          homeRubbersWon: homeWins,
          homeSetsWon, homeSetsLost, homeGamesWon, homeGamesLost,
        };
      });

      // Each completed tie, from both sides' own point of view, for the
      // expandable match history.
      const byTeam = {};
      for (const f of completed) {
        const homeWins = f.rubbers.filter((r) => r.winner_side === 'home').length;
        const awayWins = 3 - homeWins;
        (byTeam[f.home_team_id] ??= []).push({ fixtureId: f.id, opponentId: f.away_team_id, myWins: homeWins, oppWins: awayWins, rubbers: f.rubbers, mySide: 'home' });
        (byTeam[f.away_team_id] ??= []).push({ fixtureId: f.id, opponentId: f.home_team_id, myWins: awayWins, oppWins: homeWins, rubbers: f.rubbers, mySide: 'away' });
      }

      const playerIds = new Set();
      for (const f of completed) {
        for (const r of f.rubbers) {
          for (const pid of [r.home_player1_id, r.home_player2_id, r.away_player1_id, r.away_player2_id]) {
            if (pid) playerIds.add(pid);
          }
        }
      }
      const { data: playerRows } = playerIds.size > 0
        ? await supabase.from('players').select('id, name').in('id', [...playerIds])
        : { data: [] };
      if (cancelled) return;

      if (!cancelled) {
        const standings = computeTeamStandings(teamIds, ties);
        setRows(highlightBands(standings, teamIds.length));
        setTeamNames(names);
        setMatchesByTeam(byTeam);
        setNameOf(Object.fromEntries((playerRows || []).map((p) => [p.id, p.name])));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId, divisionId]);

  function toggle(teamId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId); else next.add(teamId);
      return next;
    });
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader title="Standings" />

      {!isTeamLogin && divisions.length > 1 && (
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

      {isTeamLogin && myDivisionId && (
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700 mb-4">
          Your division: {divisions.find((d) => d.id === myDivisionId)?.name ?? '—'}
        </p>
      )}

      {isTeamLogin && myDivisionId === null ? (
        <p className="text-gray-500 text-sm">Your team isn't placed in a division yet this season.</p>
      ) : !rows ? (
        <p className="text-gray-500 text-sm">Loading standings…</p>
      ) : (
      <div className="overflow-x-auto rounded shadow">
      <table className="w-full text-sm border">
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
          {rows.map((r, i) => {
            const isOpen = expanded.has(r.teamId);
            const matches = matchesByTeam[r.teamId] ?? [];
            return (
              <Fragment key={r.teamId}>
                <tr
                  onClick={() => toggle(r.teamId)}
                  className={`cursor-pointer hover:bg-teal-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                >
                  <td
                    className={`p-2 font-bold border-t ${
                      r.highlight === 'top' ? 'border-l-4 border-l-accent-500' : r.highlight === 'bottom' ? 'border-l-4 border-l-red-500' : ''
                    }`}
                  >
                    <span className="text-gray-400 mr-1 inline-block w-3">{isOpen ? '▾' : '▸'}</span>
                    <TeamLink teamId={r.teamId} onClick={(e) => e.stopPropagation()}>{teamNames[r.teamId]}</TeamLink>
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
                {isOpen && (
                  <tr>
                    <td colSpan={9} className="p-0 border-t bg-teal-50/40">
                      {matches.length === 0 ? (
                        <p className="text-gray-500 text-sm p-3">No completed matches yet.</p>
                      ) : (
                        <div className="divide-y">
                          {matches.map((m) => (
                            <div key={m.fixtureId} className="p-3">
                              <p className="text-sm font-bold text-teal-900 mb-1">
                                {m.myWins} – {m.oppWins} vs <TeamLink teamId={m.opponentId} onClick={(e) => e.stopPropagation()}>{teamNames[m.opponentId]}</TeamLink>
                              </p>
                              <div className="rounded border divide-y overflow-hidden">
                                {RUBBER_ORDER.map((type) => {
                                  const rubber = m.rubbers.find((x) => x.rubber_type === type);
                                  if (!rubber) return null;
                                  return <RubberRow key={type} type={type} rubber={rubber} nameOf={nameOf} mySide={m.mySide} />;
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
      )}
    </div>
  );
}
