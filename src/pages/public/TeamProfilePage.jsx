// src/pages/public/TeamProfilePage.jsx
//
// A single team's profile: captain/contact info, current-season division
// and standing (reusing standings.js exactly as StandingsPage does, then
// picking this team's own row out of the computed table), season roster,
// and this season's fixtures split into Completed/Upcoming tabs. Public —
// no login required, same as Standings/Fixtures Calendar (Req 10.5) —
// since this is the page every team-name hyperlink across the app (public
// or logged-in) points to, for any login.
//
// Bold hero + stat panel + roster grid, in the spirit of league.cdta.co.in's
// bold, high-contrast team page (not a copy of its layout) — see
// components/StatPanel.jsx and Avatar.jsx, shared with other pages for a
// consistent "nice look and feel" across the whole app.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { computeTeamStandings } from '../../lib/standings.js';
import StatPanel from '../../components/StatPanel.jsx';
import Avatar from '../../components/Avatar.jsx';
import PlayerLink from '../../components/PlayerLink.jsx';

const SKILLS = [
  { key: 'serve', label: 'Serve' },
  { key: 'forehand', label: 'Forehand' },
  { key: 'backhand', label: 'Backhand' },
  { key: 'volley', label: 'Volley' },
];

/** Req 15.3: this season's average overall rating (1 decimal) plus a Strong/Weak tally per skill, from every tie_player_ratings row given this season — read-only here; only editable from the opposing captain's Score Entry > Performance tab for a specific tie. Comes back empty for a signed-out visitor (RLS, Req 15.5 — not public), which just means nothing shows, not that ratings don't exist. */
function summarizeRatings(rows) {
  if (rows.length === 0) return null;
  const avg = rows.reduce((sum, r) => sum + r.overall_rating, 0) / rows.length;
  const tally = Object.fromEntries(SKILLS.map((s) => [s.key, { strong: 0, weak: 0 }]));
  for (const r of rows) {
    for (const s of SKILLS) {
      if (r[s.key] === 'strong') tally[s.key].strong++;
      else if (r[s.key] === 'weak') tally[s.key].weak++;
    }
  }
  return { average: Math.round(avg * 10) / 10, count: rows.length, tally };
}

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/** Same tie-result derivation StandingsPage uses, kept local since here it's evaluated relative to one team's side. Returns the rubber score (e.g. "2 - 1") from this team's own side, not just W/L. */
function tieOutcomeForTeam(fixture, isHome) {
  const rubbers = fixture.rubbers ?? [];
  if (rubbers.length !== 3 || !rubbers.every((r) => r.winner_side && r.confirmed_at)) return null;
  const homeWins = rubbers.filter((r) => r.winner_side === 'home').length;
  const awayWins = rubbers.length - homeWins;
  const myWins = isHome ? homeWins : awayWins;
  const oppWins = isHome ? awayWins : homeWins;
  return { won: myWins > oppWins, score: `${myWins} - ${oppWins}` };
}

export default function TeamProfilePage({ seasonId, teamId }) {
  const [team, setTeam] = useState(null); // null = loading, false = not found
  const [teamSeason, setTeamSeason] = useState(null); // this season's placement, or undefined if none
  const [roster, setRoster] = useState([]);
  const [ratingsByPlayer, setRatingsByPlayer] = useState({}); // player_id -> summarizeRatings() result
  const [standingRow, setStandingRow] = useState(null); // { rank, totalTeams, ...record } or null
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('upcoming'); // 'upcoming' | 'completed'

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

      if ((rosterRows || []).length > 0) {
        const { data: ratingRows } = await supabase
          .from('tie_player_ratings')
          .select('rated_player_id, overall_rating, serve, forehand, backhand, volley, fixtures!inner(season_id)')
          .eq('fixtures.season_id', seasonId)
          .in('rated_player_id', rosterRows.map((r) => r.player_id));
        if (cancelled) return;
        const byPlayer = {};
        for (const r of ratingRows || []) (byPlayer[r.rated_player_id] ??= []).push(r);
        setRatingsByPlayer(Object.fromEntries(Object.entries(byPlayer).map(([id, rows]) => [id, summarizeRatings(rows)])));
      }

      if (tsRow?.division_id) {
        const [{ data: divisionTeamSeasons }, { data: divisionFixtures }] = await Promise.all([
          supabase.from('team_seasons').select('team_id').eq('season_id', seasonId).eq('division_id', tsRow.division_id),
          // Which ties count is decided below (all 3 rubbers confirmed) — not
          // fixtures.status, which is a scheduling field nothing ever sets to
          // 'complete', so filtering on it here silently hid every finished tie.
          supabase.from('fixtures').select('id, home_team_id, away_team_id, rubbers(*)')
            .eq('season_id', seasonId).eq('division_id', tsRow.division_id),
        ]);
        if (cancelled) return;

        const teamIds = (divisionTeamSeasons || []).map((r) => r.team_id);
        const ties = (divisionFixtures || [])
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
          rubbers(winner_side, confirmed_at)
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
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-500">Team not found.</p>
        <Link to="/standings" className="text-teal-700 text-sm underline">Back to Standings</Link>
      </div>
    );
  }

  const scoredFixtures = fixtures.filter((f) => !f.is_bye && f.rubbers?.length === 3 && f.rubbers.every((r) => r.winner_side && r.confirmed_at));
  const upcomingFixtures = fixtures.filter((f) => f.is_bye || !(f.rubbers?.length === 3 && f.rubbers.every((r) => r.winner_side && r.confirmed_at)));
  const shownFixtures = tab === 'completed' ? scoredFixtures : upcomingFixtures;

  const statRows = [
    ...(team.clubs?.name ? [{ label: 'Club', value: team.clubs.name }] : []),
    { label: 'Captain', value: team.captain_name || '—' },
    ...(team.captain_phone ? [{ label: 'Phone', value: team.captain_phone }] : []),
    ...(teamSeason?.divisions?.name ? [{ label: 'Division', value: teamSeason.divisions.name, highlight: true }] : []),
    ...(standingRow ? [
      { label: 'Rank', value: `${standingRow.rank} of ${standingRow.totalTeams}` },
      { label: 'Points', value: standingRow.points },
      { label: 'Played', value: standingRow.played },
      { label: 'Won', value: standingRow.wins },
      { label: 'Lost', value: standingRow.losses },
      { label: 'Sets Won', value: standingRow.setsWon },
      { label: 'Sets Lost', value: standingRow.setsLost },
      { label: 'Games Won', value: standingRow.gamesWon },
      { label: 'Games Lost', value: standingRow.gamesLost },
    ] : []),
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Hero */}
      <div className="rounded-lg overflow-hidden shadow-lg bg-gradient-to-br from-teal-800 to-teal-950 text-white px-6 py-8 mb-6 flex items-center gap-5">
        <Avatar name={team.name} size="lg" className="ring-4 ring-accent-500" />
        <div>
          <h1 className="text-3xl font-extrabold uppercase tracking-tight text-white">{team.name}</h1>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : !seasonId ? (
        <p className="text-gray-500 text-sm">No season selected.</p>
      ) : !teamSeason ? (
        <p className="text-gray-500 text-sm">Not registered for the currently selected season.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="md:col-span-1">
            {!teamSeason.division_id ? (
              <p className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded p-3">
                Unassigned — not yet placed in a division.
              </p>
            ) : (
              <StatPanel rows={statRows} />
            )}
          </div>

          <div className="md:col-span-1">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 border-b-2 border-accent-500 pb-1 mb-3">
              Players ({roster.length})
            </h2>
            {roster.length === 0 ? (
              <p className="text-gray-500 text-sm">No roster on file for this season.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {roster.map((r) => (
                  <PlayerLink key={r.player_id} playerId={r.player_id} className="block">
                    <div className="flex flex-col items-center text-center gap-1.5 p-2 rounded-lg bg-white shadow border border-slate-100 hover:border-accent-500 transition-colors">
                      <Avatar name={r.players?.name} />
                      <span className="text-xs font-semibold text-slate-800 leading-tight">{r.players?.name}</span>
                      {r.players?.gender && <span className="text-[10px] text-slate-400 uppercase">{r.players.gender}</span>}
                      {ratingsByPlayer[r.player_id] && (
                        <span className="text-[9px] text-slate-500 leading-tight" title={`Average of ${ratingsByPlayer[r.player_id].count} rating(s) this season`}>
                          Avg {ratingsByPlayer[r.player_id].average}
                        </span>
                      )}
                    </div>
                  </PlayerLink>
                ))}
              </div>
            )}
          </div>

          {roster.some((r) => ratingsByPlayer[r.player_id]) && (
            <div className="md:col-span-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 border-b-2 border-accent-500 pb-1 mb-3">
                Player Ratings
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                This season's average rating and skill tally, given by the opposing captain after each tie — see Score Entry's Performance tab.
              </p>
              <table className="w-full text-sm border rounded overflow-hidden">
                <thead className="bg-teal-900 text-teal-50">
                  <tr>
                    <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Player</th>
                    <th className="p-2 font-bold uppercase text-xs tracking-wide">Avg</th>
                    {SKILLS.map((s) => <th key={s.key} className="p-2 font-bold uppercase text-xs tracking-wide">{s.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {roster.filter((r) => ratingsByPlayer[r.player_id]).map((r, i) => {
                    const summary = ratingsByPlayer[r.player_id];
                    return (
                      <tr key={r.player_id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="p-2 font-medium border-t"><PlayerLink playerId={r.player_id}>{r.players?.name}</PlayerLink></td>
                        <td className="p-2 text-center border-t font-extrabold">{summary.average}</td>
                        {SKILLS.map((s) => (
                          <td key={s.key} className="p-2 text-center border-t text-xs">
                            {summary.tally[s.key].strong || summary.tally[s.key].weak
                              ? `${summary.tally[s.key].strong}S / ${summary.tally[s.key].weak}W`
                              : '—'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="md:col-span-2">
            <div className="flex border-b-2 border-accent-500 mb-3">
              {['upcoming', 'completed'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-extrabold uppercase tracking-wide rounded-t ${
                    tab === t ? 'bg-teal-900 text-white' : 'text-teal-800 hover:bg-teal-50'
                  }`}
                >
                  {t === 'upcoming' ? 'Upcoming Matches' : 'Completed Matches'}
                </button>
              ))}
            </div>

            {shownFixtures.length === 0 ? (
              <p className="text-gray-500 text-sm">No {tab} matches.</p>
            ) : (
              <table className="w-full text-sm border rounded overflow-hidden">
                <thead className="bg-teal-900 text-teal-50">
                  <tr>
                    <th className="p-2 font-bold uppercase text-xs tracking-wide">Round</th>
                    <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Week</th>
                    <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Opponent</th>
                    <th className="p-2 font-bold uppercase text-xs tracking-wide">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {shownFixtures.map((f, i) => {
                    if (f.is_bye) {
                      return (
                        <tr key={f.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="p-2 text-center border-t">{f.round_number}</td>
                          <td className="p-2 border-t">{formatWeekDate(f.week_date)}</td>
                          <td className="p-2 text-gray-500 italic border-t" colSpan={2}>Rest (bye)</td>
                        </tr>
                      );
                    }
                    const isHome = f.home_team_id === teamId;
                    const opponent = isHome ? f.teams_away : f.teams_home;
                    const outcome = tieOutcomeForTeam(f, isHome);
                    return (
                      <tr key={f.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="p-2 text-center border-t font-semibold">{f.round_number}</td>
                        <td className="p-2 border-t">{formatWeekDate(f.week_date)}</td>
                        <td className="p-2 border-t">
                          {isHome ? 'vs ' : '@ '}
                          <Link to={`/team/${opponent?.id}`} className="font-semibold hover:underline hover:text-teal-700">
                            {opponent?.name ?? '—'}
                          </Link>
                        </td>
                        <td className={`p-2 text-center border-t font-extrabold ${!outcome ? 'text-gray-400' : outcome.won ? 'text-green-700' : 'text-red-700'}`}>
                          {outcome?.score ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

