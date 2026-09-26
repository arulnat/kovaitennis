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
import { useAuth } from '../../lib/auth.jsx';
import { computeTeamStandings } from '../../lib/standings.js';
import StatPanel from '../../components/StatPanel.jsx';
import Avatar from '../../components/Avatar.jsx';

const RATING_SKILLS = [
  { key: 'rating_serve', label: 'Serve', short: 'S' },
  { key: 'rating_volley', label: 'Volley', short: 'V' },
  { key: 'rating_forehand', label: 'Forehand', short: 'F' },
  { key: 'rating_backhand', label: 'Backhand', short: 'B' },
  { key: 'rating_fitness', label: 'Fitness', short: 'Ft' },
];

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
  const { teamId: myTeamId, isAdmin } = useAuth();
  const [team, setTeam] = useState(null); // null = loading, false = not found
  const [teamSeason, setTeamSeason] = useState(null); // this season's placement, or undefined if none
  const [roster, setRoster] = useState([]);
  const [ratingsByPlayer, setRatingsByPlayer] = useState({}); // player_id -> {rating_serve, ...}
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
          .from('player_ratings')
          .select('*')
          .in('player_id', rosterRows.map((r) => r.player_id));
        if (cancelled) return;
        setRatingsByPlayer(Object.fromEntries((ratingRows || []).map((r) => [r.player_id, r])));
      }

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
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-500">Team not found.</p>
        <Link to="/standings" className="text-teal-700 text-sm underline">Back to Standings</Link>
      </div>
    );
  }

  const canEditRatings = isAdmin || (!!myTeamId && myTeamId === teamId);

  const scoredFixtures = fixtures.filter((f) => !f.is_bye && f.rubbers?.length === 3 && f.rubbers.every((r) => r.winner_side));
  const upcomingFixtures = fixtures.filter((f) => f.is_bye || !(f.rubbers?.length === 3 && f.rubbers.every((r) => r.winner_side)));
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
      { label: 'Won / Lost', value: `${standingRow.wins} / ${standingRow.losses}` },
      { label: 'Sets +/-', value: `${standingRow.setsDiff >= 0 ? '+' : ''}${standingRow.setsDiff}` },
      { label: 'Games +/-', value: `${standingRow.gamesDiff >= 0 ? '+' : ''}${standingRow.gamesDiff}` },
    ] : []),
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Hero */}
      <div className="rounded-lg overflow-hidden shadow-lg bg-gradient-to-br from-teal-800 to-teal-950 text-white px-6 py-8 mb-6 flex items-center gap-5">
        <Avatar name={team.name} size="lg" className="ring-4 ring-accent-500" />
        <div>
          <h1 className="text-3xl font-extrabold uppercase tracking-tight text-white">{team.name}</h1>
          {teamSeason?.status && teamSeason.status !== 'placed' && (
            <span className="inline-block mt-1 text-xs font-bold uppercase tracking-wide bg-accent-500 text-teal-950 rounded px-2 py-0.5">
              {teamSeason.status}
            </span>
          )}
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
                  <div key={r.player_id} className="flex flex-col items-center text-center gap-1.5 p-2 rounded-lg bg-white shadow border border-slate-100">
                    <Avatar name={r.players?.name} />
                    <span className="text-xs font-semibold text-slate-800 leading-tight">{r.players?.name}</span>
                    {r.players?.gender && <span className="text-[10px] text-slate-400 uppercase">{r.players.gender}</span>}
                    {ratingsByPlayer[r.player_id] && (
                      <span className="text-[9px] text-slate-500 leading-tight">
                        {RATING_SKILLS.map((s) => `${s.short}${ratingsByPlayer[r.player_id][s.key] ?? '–'}`).join(' · ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {canEditRatings && roster.length > 0 && (
            <div className="md:col-span-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 border-b-2 border-accent-500 pb-1 mb-3">
                Player Ratings
              </h2>
              <PlayerRatingsEditor
                roster={roster}
                ratingsByPlayer={ratingsByPlayer}
                onSaved={(playerId, row) => setRatingsByPlayer((prev) => ({ ...prev, [playerId]: row }))}
              />
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
                        <td className={`p-2 text-center border-t font-extrabold ${outcome === 'W' ? 'text-green-700' : outcome === 'L' ? 'text-red-700' : 'text-gray-400'}`}>
                          {outcome ?? '—'}
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

/** Editable Serve/Volley/Forehand/Backhand/Fitness ratings (5-10 scale) — visible only to an admin or the player's own team's captain (see player_ratings RLS); everyone else just sees the read-only badges on each player's card above. */
function PlayerRatingsEditor({ roster, ratingsByPlayer, onSaved }) {
  return (
    <table className="w-full text-sm border rounded overflow-hidden">
      <thead className="bg-teal-900 text-teal-50">
        <tr>
          <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Player</th>
          {RATING_SKILLS.map((s) => (
            <th key={s.key} className="p-2 font-bold uppercase text-xs tracking-wide">{s.label}</th>
          ))}
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {roster.map((r, i) => (
          <PlayerRatingRow
            key={r.player_id}
            playerId={r.player_id}
            playerName={r.players?.name}
            rating={ratingsByPlayer[r.player_id]}
            striped={i % 2 === 1}
            onSaved={onSaved}
          />
        ))}
      </tbody>
    </table>
  );
}

function PlayerRatingRow({ playerId, playerName, rating, striped, onSaved }) {
  const [values, setValues] = useState(
    Object.fromEntries(RATING_SKILLS.map((s) => [s.key, rating?.[s.key] ?? '']))
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    for (const s of RATING_SKILLS) {
      const v = values[s.key];
      if (v !== '' && (!Number.isInteger(Number(v)) || Number(v) < 5 || Number(v) > 10)) {
        alert(`${s.label} must be a whole number from 5 to 10.`);
        return;
      }
    }
    setSaving(true);
    const row = {
      player_id: playerId,
      ...Object.fromEntries(RATING_SKILLS.map((s) => [s.key, values[s.key] === '' ? null : Number(values[s.key])])),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('player_ratings').upsert(row).select().single();
    setSaving(false);
    if (error) { alert(`Save failed: ${error.message}`); return; }
    onSaved(playerId, data);
  }

  return (
    <tr className={striped ? 'bg-slate-50' : 'bg-white'}>
      <td className="p-2 font-semibold border-t whitespace-nowrap">{playerName}</td>
      {RATING_SKILLS.map((s) => (
        <td key={s.key} className="p-2 text-center border-t">
          <input
            type="number" min="5" max="10" value={values[s.key]}
            onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
            className="border rounded px-1 py-1 w-14 text-center"
          />
        </td>
      ))}
      <td className="p-2 text-right border-t">
        <button onClick={save} disabled={saving} className="px-3 py-1 rounded bg-teal-700 text-white text-xs font-bold uppercase tracking-wide disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </td>
    </tr>
  );
}
