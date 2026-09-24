// src/pages/public/TeamProfilePage.jsx
//
// A single team's profile: captain/contact info, current-season division
// and standing (reusing standings.js exactly as StandingsPage does, then
// picking this team's own row out of the computed table), season roster,
// and this season's fixtures with results. Public — no login required,
// same as Standings/Fixtures Calendar (Req 10.5) — since this is the page
// every team-name hyperlink across the app (public or logged-in) points
// to, for any login.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { computeTeamStandings } from '../../lib/standings.js';

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/** Same tie-result derivation StandingsPage uses, kept local since here it's evaluated relative to one team's side. */
function tieOutcomeForTeam(fixture, isHome) {
  const rubbers = fixture.rubbers ?? [];
  if (rubbers.length !== 3 || !rubbers.every((r) => r.winner_side)) return null;
  const homeWins = rubbers.filter((r) => r.winner_side === 'home').length;
  const won = isHome ? homeWins >= 2 : homeWins < 2;
  return won ? 'W' : 'L';
}

export default function TeamProfilePage({ seasonId, teamId }) {
  const [team, setTeam] = useState(null); // null = loading, false = not found
  const [teamSeason, setTeamSeason] = useState(null); // this season's placement, or undefined if none
  const [roster, setRoster] = useState([]);
  const [standingRow, setStandingRow] = useState(null); // { rank, totalTeams, ...record } or null
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);

      const { data: teamRow, error: teamErr } = await supabase
        .from('teams')
        .select('id, name, captain_name, captain_phone, alternate_contact_phone, club_id, clubs(name)')
        .eq('id', teamId)
        .maybeSingle();
      if (cancelled) return;
      if (teamErr || !teamRow) { setTeam(false); setLoading(false); return; }
      setTeam(teamRow);

      if (!seasonId) { setLoading(false); return; }

      const { data: tsRow } = await supabase
        .from('team_seasons')
        .select('division_id, status, divisions(id, name)')
        .eq('season_id', seasonId)
        .eq('team_id', teamId)
        .maybeSingle();
      if (cancelled) return;
      setTeamSeason(tsRow || null);

      const { data: rosterRows } = await supabase
        .from('team_players')
        .select('player_id, players(id, name, gender)')
        .eq('season_id', seasonId)
        .eq('team_id', teamId);
      if (cancelled) return;
      setRoster(rosterRows || []);

      if (tsRow?.division_id) {
        const [{ data: divisionTeamSeasons }, { data: divisionFixtures }] = await Promise.all([
          supabase.from('team_seasons').select('team_id').eq('season_id', seasonId).eq('division_id', tsRow.division_id),
          supabase.from('fixtures').select('id, home_team_id, away_team_id, rubbers(*)')
            .eq('season_id', seasonId).eq('division_id', tsRow.division_id).eq('status', 'complete'),
        ]);
        if (cancelled) return;

        const teamIds = (divisionTeamSeasons || []).map((r) => r.team_id);
        const ties = (divisionFixtures || [])
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
            return { homeTeamId: f.home_team_id, awayTeamId: f.away_team_id, winner, homeSetsWon, homeSetsLost, homeGamesWon, homeGamesLost };
          });

        const standings = computeTeamStandings(teamIds, ties);
        const mine = standings.find((r) => r.teamId === teamId);
        if (mine) setStandingRow({ ...mine, totalTeams: teamIds.length });
      } else {
        setStandingRow(null);
      }

      const { data: fixtureRows } = await supabase
        .from('fixtures')
        .select(`
          id, round_number, week_date, is_bye, home_team_id, away_team_id,
          teams_home:teams!fixtures_home_team_id_fkey(id, name),
          teams_away:teams!fixtures_away_team_id_fkey(id, name),
          rubbers(winner_side)
        `)
        .eq('season_id', seasonId)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order('round_number');
      if (cancelled) return;
      setFixtures(fixtureRows || []);

      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId, teamId]);

  if (team === null) return <p className="p-6 text-gray-500">Loading…</p>;
  if (team === false) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-gray-500">Team not found.</p>
        <Link to="/standings" className="text-teal-700 text-sm underline">Back to Standings</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">{team.name}</h1>
      <p className="text-sm text-gray-600 mb-4">
        {team.clubs?.name ? `${team.clubs.name} · ` : ''}
        Captain: {team.captain_name || '—'}{team.captain_phone ? ` (${team.captain_phone})` : ''}
      </p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : !seasonId ? (
        <p className="text-gray-500 text-sm">No season selected.</p>
      ) : !teamSeason ? (
        <p className="text-gray-500 text-sm">Not registered for the currently selected season.</p>
      ) : (
        <>
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-1">This season</p>
            {!teamSeason.division_id ? (
              <p className="text-amber-700 text-sm">Unassigned — not yet placed in a division.</p>
            ) : (
              <div className="text-sm border rounded p-3 bg-teal-50 inline-block">
                <span className="font-medium">{teamSeason.divisions?.name}</span>
                {standingRow && (
                  <span className="text-gray-700">
                    {' '}— Rank {standingRow.rank} of {standingRow.totalTeams} ·{' '}
                    {standingRow.played}P {standingRow.wins}W {standingRow.losses}L ·{' '}
                    Pts {standingRow.points} · Sets {standingRow.setsDiff >= 0 ? '+' : ''}{standingRow.setsDiff} ·{' '}
                    Games {standingRow.gamesDiff >= 0 ? '+' : ''}{standingRow.gamesDiff}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-1">Roster ({roster.length})</p>
            {roster.length === 0 ? (
              <p className="text-gray-500 text-sm">No roster on file for this season.</p>
            ) : (
              <ul className="text-sm border rounded divide-y">
                {roster.map((r) => (
                  <li key={r.player_id} className="p-2">
                    {r.players?.name}
                    {r.players?.gender ? <span className="text-gray-400"> ({r.players.gender})</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Fixtures</p>
            {fixtures.length === 0 ? (
              <p className="text-gray-500 text-sm">No fixtures yet this season.</p>
            ) : (
              <table className="w-full text-sm border">
                <thead className="bg-teal-50">
                  <tr>
                    <th className="p-2">Round</th>
                    <th className="text-left p-2">Week</th>
                    <th className="text-left p-2">Opponent</th>
                    <th className="p-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtures.map((f) => {
                    if (f.is_bye) {
                      return (
                        <tr key={f.id} className="border-t bg-gray-50">
                          <td className="p-2 text-center">{f.round_number}</td>
                          <td className="p-2">{formatWeekDate(f.week_date)}</td>
                          <td className="p-2 text-gray-500 italic" colSpan={2}>Rest (bye)</td>
                        </tr>
                      );
                    }
                    const isHome = f.home_team_id === teamId;
                    const opponent = isHome ? f.teams_away : f.teams_home;
                    const outcome = tieOutcomeForTeam(f, isHome);
                    return (
                      <tr key={f.id} className="border-t">
                        <td className="p-2 text-center">{f.round_number}</td>
                        <td className="p-2">{formatWeekDate(f.week_date)}</td>
                        <td className="p-2">
                          {isHome ? 'vs ' : '@ '}
                          <Link to={`/team/${opponent?.id}`} className="hover:underline hover:text-teal-700">
                            {opponent?.name ?? '—'}
                          </Link>
                        </td>
                        <td className={`p-2 text-center font-medium ${outcome === 'W' ? 'text-green-700' : outcome === 'L' ? 'text-red-700' : 'text-gray-400'}`}>
                          {outcome ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
