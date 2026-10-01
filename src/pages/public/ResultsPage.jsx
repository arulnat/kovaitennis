// src/pages/public/ResultsPage.jsx
//
// Public results listing, two tabs:
// - League (default): pick a division (in-page tabs, same pattern as
//   Standings), optionally narrow to one week, see every completed tie
//   in that scope with a rubber-by-rubber breakdown (who played, set
//   scores, walkover).
// - Final Results: the season-wide (no division) single-set knockout
//   among the season's qualifying players — singles/doubles Semifinal
//   1/2 + Final, filled in from the admin Final Results page
//   (FinalResultsAdminPage.jsx) and only shown here once "Posted"
//   (final_matches.posted — a draft score stays admin-only). The
//   Champions banner reads seasons.champion_singles_winner_id/
//   champion_doubles_winner_ids, set automatically when the admin posts
//   each kind's Final.
//
// Public — no login required, same as Standings/Fixtures Calendar/
// Rising Stars — so any login (or none at all) sees the same page.
//
// "Completed" means the same thing it does everywhere else in the app:
// all 3 rubbers confirmed (Score Entry's Update button), not merely
// saved as a draft — a draft-only tie simply doesn't show up here yet.

import { useEffect, useState } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import TeamLink from '../../components/TeamLink.jsx';
import PlayerLink from '../../components/PlayerLink.jsx';
import RubberRow from '../../components/RubberRow.jsx';

const ALL_WEEKS = '__all__';
const RUBBER_ORDER = ['singles', 'doubles1', 'doubles2'];
const FINAL_STAGES = [
  { key: 'semifinal1', label: 'Semifinal 1' },
  { key: 'semifinal2', label: 'Semifinal 2' },
  { key: 'final', label: 'Final' },
];

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ResultsPage() {
  const { seasonId, divisions, divisionId, setDivisionId } = useSeason();
  const [tab, setTab] = useState('league'); // 'league' | 'final'

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader title="Results" subtitle={tab === 'league' ? 'Every completed tie, rubber by rubber.' : "The final week's single-set semifinals and final."} />

      <div className="flex border-b-2 border-accent-500 mb-4">
        {[{ key: 'league', label: 'League' }, { key: 'final', label: 'Final Results' }].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-extrabold uppercase tracking-wide rounded-t ${
              tab === t.key ? 'bg-teal-900 text-white' : 'text-teal-800 hover:bg-teal-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'league' ? (
        <LeagueResults seasonId={seasonId} divisions={divisions} divisionId={divisionId} setDivisionId={setDivisionId} />
      ) : (
        <FinalResultsTab seasonId={seasonId} />
      )}
    </div>
  );
}

function LeagueResults({ seasonId, divisions, divisionId, setDivisionId }) {
  const [weekDate, setWeekDate] = useState(ALL_WEEKS);
  const [fixtures, setFixtures] = useState(null); // null = loading

  useEffect(() => { setWeekDate(ALL_WEEKS); }, [divisionId]);

  useEffect(() => {
    if (!seasonId || !divisionId) { setFixtures([]); return; }
    let cancelled = false;

    async function load() {
      setFixtures(null);

      const { data: fixtureRows } = await supabase
        .from('fixtures')
        .select(`
          id, week_date, home_team_id, away_team_id,
          teams_home:teams!fixtures_home_team_id_fkey(id, name),
          teams_away:teams!fixtures_away_team_id_fkey(id, name),
          rubbers(*)
        `)
        .eq('season_id', seasonId)
        .eq('division_id', divisionId)
        .eq('is_bye', false)
        .order('week_date', { ascending: false });
      if (cancelled) return;

      const completed = (fixtureRows || [])
        .filter((f) => f.rubbers?.length === 3 && f.rubbers.every((r) => r.winner_side && r.confirmed_at));

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
      const nameOf = Object.fromEntries((playerRows || []).map((p) => [p.id, p.name]));

      if (!cancelled) setFixtures(completed.map((f) => ({ ...f, nameOf })));
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId, divisionId]);

  if (!divisionId) return <p className="text-gray-500 text-sm">This season has no divisions yet.</p>;

  const weekOptions = [...new Set((fixtures || []).map((f) => f.week_date))].sort().reverse();
  const shownFixtures = weekDate === ALL_WEEKS ? fixtures : (fixtures || []).filter((f) => f.week_date === weekDate);

  return (
    <>
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

      <div className="mb-4">
        <Dropdown
          value={weekDate}
          onChange={setWeekDate}
          options={[
            { value: ALL_WEEKS, label: 'All weeks' },
            ...weekOptions.map((w) => ({ value: w, label: formatWeekDate(w) })),
          ]}
          className="w-56"
        />
      </div>

      {fixtures === null ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : shownFixtures.length === 0 ? (
        <p className="text-gray-500 text-sm">No completed results yet.</p>
      ) : (
        shownFixtures.map((f) => <ResultCard key={f.id} fixture={f} />)
      )}
    </>
  );
}

function ResultCard({ fixture: f }) {
  const homeWins = f.rubbers.filter((r) => r.winner_side === 'home').length;
  const awayWins = 3 - homeWins;
  const homeWonTie = homeWins > awayWins;

  return (
    <div className="rounded-lg overflow-hidden shadow-lg mb-5">
      <div className="bg-accent-500 text-teal-950 text-xs font-extrabold uppercase tracking-wide px-3 py-1.5">
        {formatWeekDate(f.week_date)}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-teal-950 text-white">
        <span className={`font-extrabold uppercase truncate ${homeWonTie ? 'text-accent-400' : ''}`}>
          <TeamLink teamId={f.home_team_id} className="hover:underline">{f.teams_home?.name}</TeamLink>
        </span>
        <span className="text-2xl font-extrabold shrink-0 px-3">{homeWins} – {awayWins}</span>
        <span className={`font-extrabold uppercase truncate text-right ${!homeWonTie ? 'text-accent-400' : ''}`}>
          <TeamLink teamId={f.away_team_id} className="hover:underline">{f.teams_away?.name}</TeamLink>
        </span>
      </div>
      <div className="divide-y">
        {RUBBER_ORDER.map((type) => {
          const r = f.rubbers.find((x) => x.rubber_type === type);
          if (!r) return null;
          return <RubberRow key={type} type={type} rubber={r} nameOf={f.nameOf} />;
        })}
      </div>
    </div>
  );
}

function FinalResultsTab({ seasonId }) {
  const [matches, setMatches] = useState(null); // null = loading
  const [champion, setChampion] = useState(null);

  useEffect(() => {
    if (!seasonId) { setMatches([]); return; }
    let cancelled = false;

    async function load() {
      setMatches(null);
      const [{ data: matchRows }, { data: seasonRow }] = await Promise.all([
        supabase.from('final_matches').select('*').eq('season_id', seasonId).eq('posted', true),
        supabase.from('seasons')
          .select('champion_singles_winner_id, champion_singles_runnerup_id, champion_doubles_winner_ids, champion_doubles_runnerup_ids')
          .eq('id', seasonId)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const playerIds = new Set();
      for (const m of matchRows || []) {
        for (const pid of [m.side_a_player1_id, m.side_a_player2_id, m.side_b_player1_id, m.side_b_player2_id]) {
          if (pid) playerIds.add(pid);
        }
      }
      for (const pid of [
        seasonRow?.champion_singles_winner_id, seasonRow?.champion_singles_runnerup_id,
        ...(seasonRow?.champion_doubles_winner_ids || []), ...(seasonRow?.champion_doubles_runnerup_ids || []),
      ]) {
        if (pid) playerIds.add(pid);
      }

      const { data: playerRows } = playerIds.size > 0
        ? await supabase.from('players').select('id, name').in('id', [...playerIds])
        : { data: [] };
      if (cancelled) return;
      const nameOf = Object.fromEntries((playerRows || []).map((p) => [p.id, p.name]));

      setMatches((matchRows || []).map((m) => ({ ...m, nameOf })));
      setChampion(seasonRow ? { ...seasonRow, nameOf } : null);
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId]);

  if (matches === null) return <p className="text-gray-500 text-sm">Loading…</p>;

  function matchFor(kind, stage) {
    return matches.find((m) => m.kind === kind && m.stage === stage);
  }

  const hasChampion = !!(champion?.champion_singles_winner_id || champion?.champion_doubles_winner_ids?.length > 0);

  return (
    <>
      {hasChampion && (
        <div className="rounded-lg overflow-hidden shadow-lg mb-6 bg-gradient-to-br from-accent-500 to-accent-600 text-teal-950 p-5">
          <h2 className="text-lg font-extrabold uppercase tracking-wide mb-2">Champions</h2>
          {champion.champion_singles_winner_id && (
            <p className="text-sm mb-1">
              <span className="font-bold uppercase">Singles:</span>{' '}
              <PlayerLink playerId={champion.champion_singles_winner_id}>{champion.nameOf[champion.champion_singles_winner_id]}</PlayerLink>
              {champion.champion_singles_runnerup_id && (
                <> (runner-up: <PlayerLink playerId={champion.champion_singles_runnerup_id}>{champion.nameOf[champion.champion_singles_runnerup_id]}</PlayerLink>)</>
              )}
            </p>
          )}
          {champion.champion_doubles_winner_ids?.length > 0 && (
            <p className="text-sm">
              <span className="font-bold uppercase">Doubles:</span>{' '}
              {champion.champion_doubles_winner_ids.map((id) => champion.nameOf[id]).join(' / ')}
              {champion.champion_doubles_runnerup_ids?.length > 0 && (
                <> (runner-up: {champion.champion_doubles_runnerup_ids.map((id) => champion.nameOf[id]).join(' / ')})</>
              )}
            </p>
          )}
        </div>
      )}

      {matches.length === 0 ? (
        <p className="text-gray-500 text-sm">No final-week results posted yet.</p>
      ) : (
        ['singles', 'doubles'].map((kind) => {
          const kindMatches = FINAL_STAGES.map((s) => ({ ...s, match: matchFor(kind, s.key) })).filter((s) => s.match);
          if (kindMatches.length === 0) return null;
          return (
            <div key={kind} className="mb-6">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 border-b-2 border-accent-500 pb-1 mb-3">{kind}</h2>
              <div className="space-y-3">
                {kindMatches.map(({ key, label, match }) => <FinalMatchCard key={key} label={label} match={match} />)}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

function sideLabel(match, side) {
  const names = [match[`side_${side}_player1_id`], match[`side_${side}_player2_id`]]
    .filter(Boolean)
    .map((id) => match.nameOf[id] ?? '—');
  return names.join(' / ');
}

function FinalMatchCard({ label, match }) {
  const scoreText = match.side_a_games != null
    ? `${match.side_a_games}-${match.side_b_games}${match.tiebreak_a != null ? ` (${match.tiebreak_a}-${match.tiebreak_b})` : ''}`
    : '—';
  return (
    <div className="rounded-lg overflow-hidden shadow border">
      <div className="bg-teal-900 text-teal-50 text-xs font-extrabold uppercase tracking-wide px-3 py-1.5">{label}</div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white">
        <span className={`font-semibold ${match.winner_side === 'a' ? 'text-teal-900' : 'text-slate-500'}`}>{sideLabel(match, 'a')}</span>
        <span className="text-lg font-extrabold shrink-0 px-3">{scoreText}</span>
        <span className={`font-semibold text-right ${match.winner_side === 'b' ? 'text-teal-900' : 'text-slate-500'}`}>{sideLabel(match, 'b')}</span>
      </div>
    </div>
  );
}
