// src/pages/public/PlayerProfilePage.jsx
//
// A single player's profile for the current season: which team/division
// they're in, singles/doubles W-L (Sets Won/Lost, Games Won/Lost — same
// split as Rising Stars and Standings), this season's Strategy Builder
// rating (Req 15.3), and the rest of their team's roster so anyone can
// hop from one player to the next without going back through the team
// page each time. Public — no login required, same as Team Profile.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import TeamLink from '../../components/TeamLink.jsx';
import PlayerLink from '../../components/PlayerLink.jsx';
import StatPanel from '../../components/StatPanel.jsx';
import Avatar from '../../components/Avatar.jsx';

const SKILLS = [
  { key: 'serve', label: 'Serve' },
  { key: 'forehand', label: 'Forehand' },
  { key: 'backhand', label: 'Backhand' },
  { key: 'volley', label: 'Volley' },
];

/** Same shape as TeamProfilePage's summarizeRatings — kept local since it's a small, page-specific read. */
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

/** This one player's record for singles or doubles (doubles1+doubles2 combined), from confirmed rubbers of fixtures their team played. */
function recordFor(fixtures, kind, playerId) {
  const rubberTypes = kind === 'singles' ? ['singles'] : ['doubles1', 'doubles2'];
  const rec = { wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 };

  for (const f of fixtures) {
    for (const r of f.rubbers ?? []) {
      if (!rubberTypes.includes(r.rubber_type) || !r.winner_side || !r.confirmed_at) continue;
      const isHome = r.home_player1_id === playerId || r.home_player2_id === playerId;
      const isAway = r.away_player1_id === playerId || r.away_player2_id === playerId;
      if (!isHome && !isAway) continue;

      let setsWon = 0, setsLost = 0, gamesWon = 0, gamesLost = 0;
      for (const n of [1, 2, 3]) {
        const h = r[`set${n}_home`], a = r[`set${n}_away`];
        if (h == null) continue;
        if (isHome) { gamesWon += h; gamesLost += a; if (h > a) setsWon++; else setsLost++; }
        else { gamesWon += a; gamesLost += h; if (a > h) setsWon++; else setsLost++; }
      }

      const won = isHome ? r.winner_side === 'home' : r.winner_side === 'away';
      rec.wins += won ? 1 : 0;
      rec.losses += won ? 0 : 1;
      rec.setsWon += setsWon; rec.setsLost += setsLost;
      rec.gamesWon += gamesWon; rec.gamesLost += gamesLost;
    }
  }
  return rec;
}

export default function PlayerProfilePage({ seasonId, playerId }) {
  const [player, setPlayer] = useState(null); // null = loading, false = not found
  const [teamId, setTeamId] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [divisionName, setDivisionName] = useState('');
  const [teammates, setTeammates] = useState([]);
  const [singlesRecord, setSinglesRecord] = useState(null);
  const [doublesRecord, setDoublesRecord] = useState(null);
  const [ratingSummary, setRatingSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);

      const { data: playerRow } = await supabase.from('players').select('id, name, gender').eq('id', playerId).maybeSingle();
      if (cancelled) return;
      if (!playerRow) { setPlayer(false); setLoading(false); return; }
      setPlayer(playerRow);

      if (!seasonId) { setLoading(false); return; }

      const { data: tpRow } = await supabase
        .from('team_players')
        .select('team_id, teams(id, name)')
        .eq('season_id', seasonId)
        .eq('player_id', playerId)
        .maybeSingle();
      if (cancelled) return;
      if (!tpRow) { setLoading(false); return; }
      setTeamId(tpRow.team_id);
      setTeamName(tpRow.teams?.name ?? '');

      const [{ data: tsRow }, { data: teammateRows }, { data: fixtureRows }, { data: ratingRows }] = await Promise.all([
        supabase.from('team_seasons').select('divisions(name)').eq('season_id', seasonId).eq('team_id', tpRow.team_id).maybeSingle(),
        supabase.from('team_players').select('player_id, players(id, name, gender)').eq('season_id', seasonId).eq('team_id', tpRow.team_id),
        supabase.from('fixtures')
          .select('rubbers(rubber_type, winner_side, confirmed_at, home_player1_id, home_player2_id, away_player1_id, away_player2_id, set1_home, set1_away, set2_home, set2_away, set3_home, set3_away)')
          .eq('season_id', seasonId)
          .or(`home_team_id.eq.${tpRow.team_id},away_team_id.eq.${tpRow.team_id}`),
        supabase.from('tie_player_ratings').select('overall_rating, serve, forehand, backhand, volley, fixtures!inner(season_id)')
          .eq('fixtures.season_id', seasonId).eq('rated_player_id', playerId),
      ]);
      if (cancelled) return;

      setDivisionName(tsRow?.divisions?.name ?? '');
      setTeammates(teammateRows || []);
      setSinglesRecord(recordFor(fixtureRows || [], 'singles', playerId));
      setDoublesRecord(recordFor(fixtureRows || [], 'doubles', playerId));
      setRatingSummary(summarizeRatings(ratingRows || []));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId, playerId]);

  if (player === null || loading) return <p className="p-6 text-gray-500">Loading…</p>;
  if (player === false) return <p className="p-6 text-gray-500">Player not found.</p>;
  if (!seasonId) return <p className="p-6 text-gray-500">No season selected.</p>;
  if (!teamId) return <p className="p-6 text-gray-500">{player.name} isn't on a roster for the currently selected season.</p>;

  const recordRows = (rec) => [
    { label: 'Won', value: rec.wins },
    { label: 'Lost', value: rec.losses },
    { label: 'Sets Won', value: rec.setsWon },
    { label: 'Sets Lost', value: rec.setsLost },
    { label: 'Games Won', value: rec.gamesWon },
    { label: 'Games Lost', value: rec.gamesLost },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="rounded-lg overflow-hidden shadow-lg bg-gradient-to-br from-teal-800 to-teal-950 text-white px-6 py-8 mb-6 flex items-center gap-5">
        <Avatar name={player.name} size="lg" className="ring-4 ring-accent-500" />
        <div>
          <h1 className="text-3xl font-extrabold uppercase tracking-tight text-white">{player.name}</h1>
          <p className="text-sm text-teal-100 mt-1">
            <TeamLink teamId={teamId} className="hover:underline">{teamName}</TeamLink>
            {divisionName && <span className="text-teal-300"> — {divisionName}</span>}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 border-b-2 border-accent-500 pb-1 mb-3">Singles</h2>
          <StatPanel rows={recordRows(singlesRecord)} />
        </div>
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 border-b-2 border-accent-500 pb-1 mb-3">Doubles</h2>
          <StatPanel rows={recordRows(doublesRecord)} />
        </div>

        {ratingSummary && (
          <div className="md:col-span-2">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 border-b-2 border-accent-500 pb-1 mb-3">
              Performance Rating
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              This season's average rating (of {ratingSummary.count}) and skill tally, given by opposing captains after each tie.
            </p>
            <table className="w-full text-sm border rounded overflow-hidden">
              <thead className="bg-teal-900 text-teal-50">
                <tr>
                  <th className="p-2 font-bold uppercase text-xs tracking-wide">Avg</th>
                  {SKILLS.map((s) => <th key={s.key} className="p-2 font-bold uppercase text-xs tracking-wide">{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  <td className="p-2 text-center border-t font-extrabold">{ratingSummary.average}</td>
                  {SKILLS.map((s) => (
                    <td key={s.key} className="p-2 text-center border-t text-xs">
                      {ratingSummary.tally[s.key].strong || ratingSummary.tally[s.key].weak
                        ? `${ratingSummary.tally[s.key].strong}S / ${ratingSummary.tally[s.key].weak}W`
                        : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="md:col-span-2">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 border-b-2 border-accent-500 pb-1 mb-3">
            Teammates ({teammates.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {teammates.map((t) => (
              <PlayerLink key={t.player_id} playerId={t.player_id} className="block">
                <div
                  className={`flex flex-col items-center text-center gap-1.5 p-2 rounded-lg bg-white shadow border hover:border-accent-500 transition-colors ${
                    t.player_id === playerId ? 'border-accent-500' : 'border-slate-100'
                  }`}
                >
                  <Avatar name={t.players?.name} />
                  <span className="text-xs font-semibold text-slate-800 leading-tight">{t.players?.name}</span>
                </div>
              </PlayerLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
