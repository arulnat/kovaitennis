// src/pages/team/ScoreEntryPage.jsx
//
// Req 5.1–5.9: either captain enters/edits a tie's 3 rubbers, saved one
// at a time as a normal (not final) update — Save is provisional right
// up until the tie finalizes. The 3 rubbers can be entered in any
// order (doubles1 first, then singles, etc.) — nothing here gates one
// on another. Eligibility (5.5) is enforced by filtering the player
// selectors live via selectablePlayers(). A running tie-score tally
// (rubbers won so far) shows once any rubber is in, and standings
// (Section 6) update live off the same `rubbers` rows automatically.
//
// Finalization replaces the original spec's 7-day captain-edit window:
// once all 3 rubbers are scored, a database trigger
// (0014_auto_finalize_tie.sql, corrected by 0015 to drop ratings from
// the condition) stamps fixtures.finalized_at itself — captains can no
// longer edit scores after that, admin still can. Strategy Builder
// ratings (the Performance tab) are optional and were deliberately
// decoupled from this: they're never required for finalization and are
// never locked by it either — the opposing captain can give one
// whenever they like. Admin has no write access to ratings at all,
// regardless of finalization ("admin can only edit the scores, not the
// performance of the players").
//
// Nothing can be scored until the fixture's season is published (Fixtures
// page) — this applies to admin too, not just captains: the schedule
// isn't final until then, so a score entered against it could end up
// orphaned by a later grouping change.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../lib/auth.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import {
  RUBBER_TYPES, winnerFromSets, isValidSinglesSet, isValidDoublesRegularSet,
  isValidSuperTiebreakSet, applyWalkover, selectablePlayers, isValidTimePlayed,
  defaultWalkoverTime, scoreToRow, rowToScore,
} from '../../lib/scoring.js';

const SKILLS = [
  { key: 'serve', label: 'Serve' },
  { key: 'forehand', label: 'Forehand' },
  { key: 'backhand', label: 'Backhand' },
  { key: 'volley', label: 'Volley' },
];

export default function ScoreEntryPage({ fixtureId }) {
  const { teamId, isAdmin } = useAuth();
  const [fixture, setFixture] = useState(null);
  const [season, setSeason] = useState(null);
  const [rubbers, setRubbers] = useState({}); // keyed by rubber_type
  const [roster, setRoster] = useState({ home: [], away: [] });
  const [teamNames, setTeamNames] = useState({ home: '', away: '' });
  const [ratings, setRatings] = useState([]); // tie_player_ratings rows for this fixture
  const [activeTab, setActiveTab] = useState('singles');

  const reloadFixture = () => supabase.from('fixtures').select('*').eq('id', fixtureId).single().then(({ data }) => setFixture(data));
  const reloadRatings = () => supabase.from('tie_player_ratings').select('*').eq('fixture_id', fixtureId).then(({ data }) => setRatings(data || []));

  useEffect(() => {
    reloadFixture();
    reloadRatings();
    supabase.from('rubbers').select('*').eq('fixture_id', fixtureId).then(({ data }) => {
      const byType = {};
      for (const r of data || []) byType[r.rubber_type] = r;
      setRubbers(byType);
    });
  }, [fixtureId]);

  useEffect(() => {
    if (!fixture?.home_team_id || !fixture?.away_team_id) return;
    Promise.all([
      supabase.from('teams').select('name').eq('id', fixture.home_team_id).single(),
      supabase.from('teams').select('name').eq('id', fixture.away_team_id).single(),
    ]).then(([h, a]) => setTeamNames({ home: h.data?.name ?? 'Home', away: a.data?.name ?? 'Away' }));
  }, [fixture?.home_team_id, fixture?.away_team_id]);

  useEffect(() => {
    if (!fixture?.season_id) return;
    supabase.from('seasons').select('published').eq('id', fixture.season_id).single().then(({ data }) => setSeason(data));
  }, [fixture?.season_id]);

  useEffect(() => {
    if (!fixture) return;
    Promise.all([
      supabase.from('team_players').select('player_id, players(id, name)').eq('season_id', fixture.season_id).eq('team_id', fixture.home_team_id),
      supabase.from('team_players').select('player_id, players(id, name)').eq('season_id', fixture.season_id).eq('team_id', fixture.away_team_id),
    ]).then(([h, a]) => {
      setRoster({
        home: (h.data || []).map((r) => r.players),
        away: (a.data || []).map((r) => r.players),
      });
    });
  }, [fixture]);

  const tieComplete = RUBBER_TYPES.every((t) => rubbers[t]?.winner_side);
  const isFinalized = !!fixture?.finalized_at;
  const isPublished = !!season?.published;
  // Either captain can edit scores — Req 5.2 — until the tie finalizes;
  // admin can still edit scores after that (never ratings — see below).
  const canEdit = isPublished && (isAdmin || !isFinalized);
  const mySide = teamId && fixture ? (teamId === fixture.home_team_id ? 'home' : teamId === fixture.away_team_id ? 'away' : null) : null;

  // already-selected players across the tie, for eligibility filtering (Req 5.5)
  const alreadySelectedFor = (side) => ({
    doubles1: [rubbers.doubles1?.[`${side}_player1_id`], rubbers.doubles1?.[`${side}_player2_id`]].filter(Boolean),
    doubles2: [rubbers.doubles2?.[`${side}_player1_id`], rubbers.doubles2?.[`${side}_player2_id`]].filter(Boolean),
  });

  async function saveRubber(type, { homePlayers, awayPlayers, score, isWalkover, walkoverSide, walkoverStage, timePlayed }) {
    let finalScore = score;
    if (isWalkover) {
      const matchKind = type === 'singles' ? 'singles' : 'doubles';
      finalScore = applyWalkover(matchKind, walkoverSide, walkoverStage);
    }

    const winner = winnerFromSets(type, finalScore);
    const row = {
      fixture_id: fixtureId,
      rubber_type: type,
      home_player1_id: homePlayers[0] ?? null,
      home_player2_id: homePlayers[1] ?? null,
      away_player1_id: awayPlayers[0] ?? null,
      away_player2_id: awayPlayers[1] ?? null,
      ...scoreToRow(finalScore),
      is_walkover: isWalkover,
      walkover_winner_side: isWalkover ? walkoverSide : null,
      time_played_minutes: isWalkover ? (timePlayed ?? defaultWalkoverTime(walkoverStage.stage) ?? 0) : timePlayed,
      winner_side: winner,
      completed_at: new Date().toISOString(),
    };

    if (!isValidTimePlayed(row.time_played_minutes)) {
      alert('Time played must be between 0 and 180 minutes (3-hour cap, Req 5.9).');
      return;
    }

    const { data, error } = await supabase
      .from('rubbers')
      .upsert(row, { onConflict: 'fixture_id,rubber_type' })
      .select()
      .single();

    if (error) { alert(`Save failed: ${error.message}`); return; }

    setRubbers((prev) => ({ ...prev, [type]: data }));

    await supabase.from('audit_log').insert({
      action: 'rubber.save', entity_type: 'rubber', entity_id: data.id,
      detail: { rubber_type: type, winner },
    });

    // A database trigger (0014) may have just finalized the fixture off
    // this save (all 3 rubbers + both sides' ratings now complete) —
    // re-fetch to pick that up rather than trying to recompute it here.
    reloadFixture();
  }

  async function saveRating(playerId, ratedByTeamId, { overallRating, skills }) {
    const row = {
      fixture_id: fixtureId,
      rated_player_id: playerId,
      rated_by_team_id: ratedByTeamId,
      overall_rating: overallRating,
      ...Object.fromEntries(SKILLS.map((s) => [s.key, skills[s.key] || null])),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('tie_player_ratings').upsert(row, { onConflict: 'fixture_id,rated_player_id' }).select().single();
    if (error) { alert(`Save failed: ${error.message}`); return; }
    setRatings((prev) => [...prev.filter((r) => r.rated_player_id !== playerId), data]);
    reloadFixture(); // may have just finalized the tie (0014)
  }

  if (!fixture) return <p className="p-6">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader title="Score Entry" />

      {!isPublished && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
          This season isn't published yet — scores can't be entered until an admin publishes it.
        </p>
      )}

      <p className="text-sm text-gray-600 mb-4">
        Either captain can save or edit any rubber's score, in any order — Save is provisional, not final.{' '}
        {isFinalized ? (
          <span className="text-red-600 font-semibold">
            This tie is finalized — {isAdmin ? 'admin can still fix a score.' : 'contact admin for any further changes to scores.'}
          </span>
        ) : (
          <span className="text-teal-700">It stays open until all 3 rubbers are scored — then it locks for good.</span>
        )}{' '}
        Rating the opposing players who played (Performance tab) is optional and never locks — give one whenever you like, before or after the tie finalizes.
      </p>

      {RUBBER_TYPES.some((t) => rubbers[t]?.winner_side) && (
        <TieScoreTally rubbers={rubbers} teamNames={teamNames} />
      )}

      <div className="flex border-b-2 border-accent-500 mb-4 flex-wrap">
        {RUBBER_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setActiveTab(type)}
            className={`px-4 py-2 text-sm font-extrabold uppercase tracking-wide rounded-t flex items-center gap-1.5 ${
              activeTab === type ? 'bg-teal-900 text-white' : 'text-teal-800 hover:bg-teal-50'
            }`}
          >
            {RUBBER_LABELS[type]}
            {rubbers[type]?.winner_side && (
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${activeTab === type ? 'bg-accent-500 text-teal-950' : 'bg-teal-700 text-white'}`}>✓</span>
            )}
          </button>
        ))}
        <button
          onClick={() => setActiveTab('performance')}
          className={`px-4 py-2 text-sm font-extrabold uppercase tracking-wide rounded-t ${
            activeTab === 'performance' ? 'bg-teal-900 text-white' : 'text-teal-800 hover:bg-teal-50'
          }`}
        >
          Performance
        </button>
      </div>

      {RUBBER_TYPES.map((type) => (
        <div key={type} className={activeTab === type ? '' : 'hidden'}>
          {rubbers[type]?.winner_side && (
            <RubberResultCard
              rubber={rubbers[type]}
              homeTeamName={teamNames.home}
              awayTeamName={teamNames.away}
              homeRoster={roster.home}
              awayRoster={roster.away}
              weekDate={fixture.week_date}
            />
          )}
          <RubberEditor
            type={type}
            rubber={rubbers[type]}
            homeRoster={roster.home}
            awayRoster={roster.away}
            selectableHome={selectablePlayers(roster.home.map((p) => p.id), alreadySelectedFor('home'), type)}
            selectableAway={selectablePlayers(roster.away.map((p) => p.id), alreadySelectedFor('away'), type)}
            disabled={!canEdit}
            onSave={(payload) => saveRubber(type, payload)}
          />
        </div>
      ))}

      <div className={activeTab === 'performance' ? '' : 'hidden'}>
        <PerformanceTab
          fixture={fixture}
          rubbers={rubbers}
          roster={roster}
          teamNames={teamNames}
          ratings={ratings}
          tieComplete={tieComplete}
          isAdmin={isAdmin}
          mySide={mySide}
          onSave={saveRating}
        />
      </div>
    </div>
  );
}

const RUBBER_LABELS = { singles: 'Singles', doubles1: 'Doubles 1', doubles2: 'Doubles 2' };

/** Running rubbers-won tally for the tie so far — "the points between 2 teams" — updates the instant any rubber is saved, in whatever order they were entered. This is the match score itself; each team's season standings points (Section 6) update the same way, live off the same `rubbers` rows, wherever standings are shown. */
function TieScoreTally({ rubbers, teamNames }) {
  const homeWon = RUBBER_TYPES.filter((t) => rubbers[t]?.winner_side === 'home').length;
  const awayWon = RUBBER_TYPES.filter((t) => rubbers[t]?.winner_side === 'away').length;
  return (
    <div className="flex items-center justify-center gap-4 bg-teal-950 text-white rounded-lg shadow-lg py-3 mb-4">
      <span className={`text-sm font-extrabold uppercase tracking-wide ${homeWon > awayWon ? 'text-accent-400' : ''}`}>{teamNames.home}</span>
      <span className="text-2xl font-extrabold">{homeWon} – {awayWon}</span>
      <span className={`text-sm font-extrabold uppercase tracking-wide ${awayWon > homeWon ? 'text-accent-400' : ''}`}>{teamNames.away}</span>
    </div>
  );
}

/** Distinct player ids actually selected across the 3 rubbers, for one side — "who played", per Req 15.1/15.2. */
function playersWhoPlayed(rubbers, side) {
  const ids = new Set();
  for (const type of RUBBER_TYPES) {
    const r = rubbers[type];
    if (!r) continue;
    if (r[`${side}_player1_id`]) ids.add(r[`${side}_player1_id`]);
    if (r[`${side}_player2_id`]) ids.add(r[`${side}_player2_id`]);
  }
  return [...ids];
}

/**
 * Req 15.1/15.2/15.5/15.7 — the opposing captain rates each player who
 * played, once per tie: a 5–10 overall score plus Strong/Weak/neutral
 * tags on 4 named skills. Optional, and never locked by finalization —
 * only the opposing captain can write here (see tie_player_ratings
 * RLS) — admin never can, only ever a read-only view.
 */
function PerformanceTab({ fixture, rubbers, roster, teamNames, ratings, tieComplete, isAdmin, mySide, onSave }) {
  if (!tieComplete) {
    return <p className="text-sm text-gray-500 p-4">Enter and save all 3 rubbers' scores first — ratings open once the tie is complete.</p>;
  }

  const homePlayed = playersWhoPlayed(rubbers, 'home');
  const awayPlayed = playersWhoPlayed(rubbers, 'away');
  const ratingFor = (playerId) => ratings.find((r) => r.rated_player_id === playerId);

  // Read-only for admin, or for whichever side isn't a captain at all (shouldn't happen given RequireRole, but no side to rate as a fallback).
  if (isAdmin || !mySide) {
    return (
      <div className="space-y-6">
        {isAdmin && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Admin view only — ratings can't be edited by admin, only by the opposing team's captain.
          </p>
        )}
        <ReadOnlyRatings title={`${teamNames.home}'s players, rated by ${teamNames.away}`} playerIds={homePlayed} roster={roster.home} ratings={ratings} />
        <ReadOnlyRatings title={`${teamNames.away}'s players, rated by ${teamNames.home}`} playerIds={awayPlayed} roster={roster.away} ratings={ratings} />
      </div>
    );
  }

  // A captain only ever rates the OTHER side's players who played.
  const opponentSide = mySide === 'home' ? 'away' : 'home';
  const opponentPlayers = opponentSide === 'home' ? homePlayed : awayPlayed;
  const opponentRoster = opponentSide === 'home' ? roster.home : roster.away;
  const myTeamId = fixture[`${mySide}_team_id`];

  return (
    <div>
      <p className="text-sm text-gray-600 mb-3">
        Rate {teamNames[opponentSide]}'s players who played this tie — optional, a scouting aid for whoever plays them next. Give it whenever you like, it's never locked.
      </p>
      {opponentPlayers.length === 0 ? (
        <p className="text-sm text-gray-500">No opposing players recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {opponentPlayers.map((playerId) => (
            <PlayerRatingRow
              key={playerId}
              playerId={playerId}
              playerName={opponentRoster.find((p) => p.id === playerId)?.name ?? '—'}
              existing={ratingFor(playerId)}
              onSave={(payload) => onSave(playerId, myTeamId, payload)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReadOnlyRatings({ title, playerIds, roster, ratings }) {
  if (playerIds.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-teal-900 mb-2">{title}</p>
      <table className="w-full text-sm border rounded overflow-hidden">
        <thead className="bg-teal-50">
          <tr>
            <th className="text-left p-2">Player</th>
            <th className="p-2">Overall</th>
            {SKILLS.map((s) => <th key={s.key} className="p-2">{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {playerIds.map((id) => {
            const r = ratings.find((x) => x.rated_player_id === id);
            return (
              <tr key={id} className="border-t">
                <td className="p-2 font-medium">{roster.find((p) => p.id === id)?.name ?? '—'}</td>
                <td className="p-2 text-center">{r?.overall_rating ?? '—'}</td>
                {SKILLS.map((s) => (
                  <td key={s.key} className="p-2 text-center capitalize">{r?.[s.key] ?? '—'}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlayerRatingRow({ playerId, playerName, existing, onSave }) {
  const [overallRating, setOverallRating] = useState(existing?.overall_rating ?? '');
  const [skills, setSkills] = useState(Object.fromEntries(SKILLS.map((s) => [s.key, existing?.[s.key] ?? null])));
  const [saving, setSaving] = useState(false);

  function toggleSkill(key, value) {
    setSkills((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
  }

  async function save() {
    const n = Number(overallRating);
    if (!Number.isInteger(n) || n < 5 || n > 10) { alert('Overall rating must be a whole number from 5 to 10.'); return; }
    setSaving(true);
    await onSave({ overallRating: n, skills });
    setSaving(false);
  }

  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <p className="font-semibold">{playerName}</p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Overall (5–10)</label>
          <input
            type="number" min="5" max="10" value={overallRating}
            onChange={(e) => setOverallRating(e.target.value)}
            className="border rounded px-2 py-1 w-16 text-center text-sm"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 mb-2">
        {SKILLS.map((s) => (
          <div key={s.key} className="flex items-center gap-1 text-xs">
            <span className="text-gray-600 w-16">{s.label}</span>
            {['strong', 'weak'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleSkill(s.key, v)}
                className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] ${
                  skills[s.key] === v
                    ? v === 'strong' ? 'bg-teal-700 text-white' : 'bg-amber-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        ))}
      </div>
      <button onClick={save} disabled={disabled || saving} className="px-3 py-1 rounded bg-teal-700 text-white text-xs font-bold uppercase tracking-wide disabled:opacity-50">
        {saving ? 'Saving…' : existing ? 'Update rating' : 'Save rating'}
      </button>
    </div>
  );
}

function formatCardDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}

/** Bold at-a-glance result summary for an already-scored rubber — winner checkmarked, a colored status banner (gold "Completed" / red "Walkover"), set scores per side. */
function RubberResultCard({ rubber, homeTeamName, awayTeamName, homeRoster, awayRoster, weekDate }) {
  const nameOf = (roster, id) => roster.find((p) => p.id === id)?.name;
  const homeNames = [rubber.home_player1_id, rubber.home_player2_id].filter(Boolean).map((id) => nameOf(homeRoster, id)).filter(Boolean);
  const awayNames = [rubber.away_player1_id, rubber.away_player2_id].filter(Boolean).map((id) => nameOf(awayRoster, id)).filter(Boolean);
  const sets = [1, 2, 3]
    .map((n) => ({ home: rubber[`set${n}_home`], away: rubber[`set${n}_away`] }))
    .filter((s) => s.home != null);
  const homeWon = rubber.winner_side === 'home';

  const Row = ({ won, teamName, players, side }) => (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-teal-950 text-white">
      <div className="min-w-0">
        <p className={`font-extrabold uppercase text-sm truncate ${won ? 'text-accent-400' : 'text-white'}`}>{teamName}</p>
        <p className="text-xs text-slate-300 truncate">{players.join(' / ') || '—'}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {won && <span className="w-5 h-5 rounded-full bg-accent-500 text-teal-950 flex items-center justify-center text-xs font-bold">✓</span>}
        {sets.map((s, i) => (
          <span key={i} className="w-6 text-center font-extrabold">{side === 'home' ? s.home : s.away}</span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="rounded-lg overflow-hidden shadow-lg mb-4">
      {weekDate && (
        <div className="bg-accent-500 text-teal-950 text-xs font-extrabold uppercase tracking-wide px-3 py-1.5">
          {formatCardDate(weekDate)}
        </div>
      )}
      <Row won={homeWon} teamName={homeTeamName} players={homeNames} side="home" />
      <div className={`text-center text-xs font-extrabold uppercase tracking-wide py-1.5 ${rubber.is_walkover ? 'bg-red-600 text-white' : 'bg-accent-500 text-teal-950'}`}>
        {rubber.is_walkover ? `${homeWon ? 'Away' : 'Home'} team gave walkover` : 'Completed'}
      </div>
      <Row won={!homeWon} teamName={awayTeamName} players={awayNames} side="away" />
    </div>
  );
}

// Which walkover stages apply to each match kind, and what extra info each
// needs to reconstruct the resulting score via applyWalkover() (Req 5.6).
const SINGLES_WALKOVER_STAGES = [
  { value: 'not_started', label: 'Before any games played' },
  { value: 'mid_set1', label: 'Mid-set, before the 6-6 breaker' },
  { value: 'mid_super_tiebreak', label: 'During the 6-6 breaker' },
];
const DOUBLES_WALKOVER_STAGES = [
  { value: 'not_started', label: 'Before any games played' },
  { value: 'mid_set1', label: 'Mid-set 1' },
  { value: 'set1_complete', label: 'Set 1 complete, set 2 not started' },
  { value: 'mid_set2', label: 'Mid-set 2' },
  { value: 'mid_super_tiebreak', label: 'During the super-tiebreak (1-1 after 2 sets)' },
];

function RubberEditor({ type, rubber, homeRoster, awayRoster, selectableHome, selectableAway, disabled, onSave }) {
  const isSingles = type === 'singles';
  const label = RUBBER_LABELS[type];

  const [homePlayers, setHomePlayers] = useState(
    rubber ? [rubber.home_player1_id, rubber.home_player2_id].filter(Boolean) : []
  );
  const [awayPlayers, setAwayPlayers] = useState(
    rubber ? [rubber.away_player1_id, rubber.away_player2_id].filter(Boolean) : []
  );
  const [isWalkover, setIsWalkover] = useState(rubber?.is_walkover ?? false);
  const [walkoverSide, setWalkoverSide] = useState(rubber?.walkover_winner_side ?? 'home');
  const [walkoverStage, setWalkoverStage] = useState('not_started');
  const [walkoverSet1, setWalkoverSet1] = useState({ home: '', away: '' });
  const [walkoverSet2, setWalkoverSet2] = useState({ home: '', away: '' });
  const [walkoverLoserGames, setWalkoverLoserGames] = useState('');
  const [walkoverLoserPoints, setWalkoverLoserPoints] = useState('');
  const [set1, setSet1] = useState(rubber ? { home: rubber.set1_home, away: rubber.set1_away } : { home: '', away: '' });
  const [set2, setSet2] = useState(rubber?.set2_home != null ? { home: rubber.set2_home, away: rubber.set2_away } : { home: '', away: '' });
  const [set3, setSet3] = useState(rubber?.set3_home != null ? { home: rubber.set3_home, away: rubber.set3_away } : { home: '', away: '' });
  const [timePlayed, setTimePlayed] = useState(rubber?.time_played_minutes ?? '');

  const walkoverStages = isSingles ? SINGLES_WALKOVER_STAGES : DOUBLES_WALKOVER_STAGES;

  /** Builds the `progress` object applyWalkover() needs for the selected stage, validating along the way. Returns null (having alerted) if incomplete/invalid. */
  function buildWalkoverProgress() {
    const loserGames = Number(walkoverLoserGames);
    const loserPoints = Number(walkoverLoserPoints);
    const s1 = { home: Number(walkoverSet1.home), away: Number(walkoverSet1.away) };
    const s2 = { home: Number(walkoverSet2.home), away: Number(walkoverSet2.away) };

    switch (walkoverStage) {
      case 'not_started':
        return { stage: 'not_started' };

      case 'mid_set1':
        if (walkoverLoserGames === '' || !Number.isInteger(loserGames) || loserGames < 0) {
          alert("Enter the losing side's game count at the point of retirement."); return null;
        }
        return { stage: 'mid_set1', loserGames };

      case 'set1_complete':
        if (!isValidDoublesRegularSet(s1.home, s1.away)) { alert('Enter a valid set 1 score.'); return null; }
        return { stage: 'set1_complete', set1: s1 };

      case 'mid_set2':
        if (!isValidDoublesRegularSet(s1.home, s1.away)) { alert('Enter a valid set 1 score.'); return null; }
        if (walkoverLoserGames === '' || !Number.isInteger(loserGames) || loserGames < 0) {
          alert("Enter the losing side's set 2 game count at the point of retirement."); return null;
        }
        return { stage: 'mid_set2', set1: s1, loserGames };

      case 'mid_super_tiebreak':
        if (walkoverLoserPoints === '' || !Number.isInteger(loserPoints) || loserPoints < 0) {
          alert("Enter the losing side's super-tiebreak point count at the point of retirement."); return null;
        }
        if (isSingles) return { stage: 'mid_super_tiebreak', loserPoints };
        if (!isValidDoublesRegularSet(s1.home, s1.away)) { alert('Enter a valid set 1 score.'); return null; }
        if (!isValidDoublesRegularSet(s2.home, s2.away)) { alert('Enter a valid set 2 score.'); return null; }
        return { stage: 'mid_super_tiebreak', set1: s1, set2: s2, loserPoints };

      default:
        return { stage: 'not_started' };
    }
  }

  function handleSubmit() {
    const score = { set1: { home: Number(set1.home), away: Number(set1.away) } };
    if (!isSingles && set2.home !== '') score.set2 = { home: Number(set2.home), away: Number(set2.away) };
    if (!isSingles && set3.home !== '') score.set3 = { home: Number(set3.home), away: Number(set3.away) };

    let progress = { stage: 'not_started' };
    if (isWalkover) {
      const built = buildWalkoverProgress();
      if (!built) return; // invalid/incomplete input — alert already shown
      progress = built;
    } else {
      const set1Valid = isSingles
        ? isValidSinglesSet(score.set1.home, score.set1.away)
        : isValidDoublesRegularSet(score.set1.home, score.set1.away);
      if (!set1Valid) { alert('Invalid set 1 score.'); return; }
      if (!isSingles && score.set2 && !isValidDoublesRegularSet(score.set2.home, score.set2.away)) {
        alert('Invalid set 2 score.'); return;
      }
      if (score.set3 && !isValidSuperTiebreakSet(score.set3.home, score.set3.away)) {
        alert('Invalid super-tiebreak score (min 10, win by 2 past 10-10).'); return;
      }
    }

    onSave({
      homePlayers, awayPlayers, score, isWalkover, walkoverSide,
      walkoverStage: progress,
      timePlayed: timePlayed === '' ? null : Number(timePlayed),
    });
  }

  return (
    <div className="border rounded p-4 mb-4">
      <p className="font-medium mb-2">{label}</p>

      <label className="flex items-center gap-2 text-sm mb-3">
        <input type="checkbox" checked={isWalkover} onChange={(e) => setIsWalkover(e.target.checked)} disabled={disabled} />
        Walkover
      </label>

      {isWalkover ? (
        <div className="grid grid-cols-2 gap-4 mb-2">
          <PlayerPicker label="Home" roster={homeRoster} selectable={selectableHome} count={isSingles ? 1 : 2} value={homePlayers} onChange={setHomePlayers} disabled={disabled} />
          <PlayerPicker label="Away" roster={awayRoster} selectable={selectableAway} count={isSingles ? 1 : 2} value={awayPlayers} onChange={setAwayPlayers} disabled={disabled} />
        </div>
      ) : null}

      {isWalkover ? (
        <div className="space-y-2 mb-2">
          <Dropdown
            value={walkoverSide}
            onChange={setWalkoverSide}
            disabled={disabled}
            options={[
              { value: 'home', label: 'Home wins (walkover)' },
              { value: 'away', label: 'Away wins (walkover)' },
            ]}
          />

          <div>
            <label className="text-sm text-gray-600 block mb-1">How far had the match gotten? (Req 5.6)</label>
            <Dropdown
              value={walkoverStage}
              onChange={setWalkoverStage}
              disabled={disabled}
              options={walkoverStages.map((s) => ({ value: s.value, label: s.label }))}
            />
          </div>

          {(walkoverStage === 'set1_complete' || walkoverStage === 'mid_set2' || walkoverStage === 'mid_super_tiebreak') && !isSingles && (
            <SetInput label="Set 1 (as played)" value={walkoverSet1} onChange={setWalkoverSet1} disabled={disabled} />
          )}
          {walkoverStage === 'mid_super_tiebreak' && !isSingles && (
            <SetInput label="Set 2 (as played)" value={walkoverSet2} onChange={setWalkoverSet2} disabled={disabled} />
          )}
          {(walkoverStage === 'mid_set1' || walkoverStage === 'mid_set2') && (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-48 text-gray-600">Losing side's games when retired:</span>
              <input
                type="number" min="0" value={walkoverLoserGames}
                onChange={(e) => setWalkoverLoserGames(e.target.value)}
                disabled={disabled}
                className="border rounded px-2 py-1 w-16"
              />
            </div>
          )}
          {walkoverStage === 'mid_super_tiebreak' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-48 text-gray-600">Losing side's breaker points when retired:</span>
              <input
                type="number" min="0" value={walkoverLoserPoints}
                onChange={(e) => setWalkoverLoserPoints(e.target.value)}
                disabled={disabled}
                className="border rounded px-2 py-1 w-16"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="mb-2">
          <table className="text-sm mb-3">
            <thead>
              <tr className="text-xs text-gray-500">
                <th></th>
                <th className="text-left px-2 pb-1 font-medium">Player</th>
                <th className="px-2 pb-1 font-medium">Set score</th>
                {!isSingles && <th className="px-2 pb-1 font-medium">Set score</th>}
                {!isSingles && <th className="px-2 pb-1 font-medium">Point score</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pr-2 text-xs font-semibold text-gray-600 whitespace-nowrap">Home</td>
                <td className="px-2 pb-1"><PlayerPicker roster={homeRoster} selectable={selectableHome} count={isSingles ? 1 : 2} value={homePlayers} onChange={setHomePlayers} disabled={disabled} compact /></td>
                <td className="px-2 pb-1"><ScoreCell value={set1.home} onChange={(v) => setSet1({ ...set1, home: v })} disabled={disabled} /></td>
                {!isSingles && <td className="px-2 pb-1"><ScoreCell value={set2.home} onChange={(v) => setSet2({ ...set2, home: v })} disabled={disabled} /></td>}
                {!isSingles && <td className="px-2 pb-1"><ScoreCell value={set3.home} onChange={(v) => setSet3({ ...set3, home: v })} disabled={disabled} /></td>}
              </tr>
              <tr>
                <td className="pr-2 text-xs font-semibold text-gray-600 whitespace-nowrap">Away</td>
                <td className="px-2 pb-1"><PlayerPicker roster={awayRoster} selectable={selectableAway} count={isSingles ? 1 : 2} value={awayPlayers} onChange={setAwayPlayers} disabled={disabled} compact /></td>
                <td className="px-2 pb-1"><ScoreCell value={set1.away} onChange={(v) => setSet1({ ...set1, away: v })} disabled={disabled} /></td>
                {!isSingles && <td className="px-2 pb-1"><ScoreCell value={set2.away} onChange={(v) => setSet2({ ...set2, away: v })} disabled={disabled} /></td>}
                {!isSingles && <td className="px-2 pb-1"><ScoreCell value={set3.away} onChange={(v) => setSet3({ ...set3, away: v })} disabled={disabled} /></td>}
              </tr>
            </tbody>
          </table>
          <button onClick={handleSubmit} disabled={disabled} className="px-4 py-1.5 rounded bg-teal-700 text-white text-sm font-bold uppercase tracking-wide disabled:opacity-50">
            Save
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <label className="text-sm">Time played (min, max 180):</label>
        <input
          type="number" min="0" max="180" value={timePlayed}
          onChange={(e) => setTimePlayed(e.target.value)}
          disabled={disabled}
          className="border rounded px-2 py-1 text-sm w-20"
        />
      </div>

      {isWalkover && (
        <button onClick={handleSubmit} disabled={disabled} className="px-4 py-1.5 rounded bg-teal-700 text-white text-sm font-bold uppercase tracking-wide disabled:opacity-50">
          Save
        </button>
      )}
    </div>
  );
}

function PlayerPicker({ label, roster, selectable, count, value, onChange, disabled, compact }) {
  const selectableSet = new Set(selectable);
  return (
    <div className={compact ? 'w-40' : undefined}>
      {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
      {[...Array(count)].map((_, i) => (
        <Dropdown
          key={i}
          value={value[i] ?? ''}
          disabled={disabled}
          placeholder="Select player…"
          onChange={(v) => {
            const next = [...value];
            next[i] = v;
            onChange(next);
          }}
          className="w-full mb-1"
          options={[
            { value: '', label: 'Select player…' },
            ...roster
              .filter((p) => selectableSet.has(p.id) || p.id === value[i])
              .map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      ))}
    </div>
  );
}

/** A single side's score for one set/point column — home and away are separate table rows, not a home-dash-away pair, so each cell only ever holds one number. */
function ScoreCell({ value, onChange, disabled }) {
  return (
    <input
      type="number" min="0" value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded px-2 py-1.5 w-14 text-center"
    />
  );
}

function SetInput({ label, value, onChange, disabled }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 text-gray-600">{label}</span>
      <input type="number" min="0" value={value.home} disabled={disabled}
        onChange={(e) => onChange({ ...value, home: e.target.value })} className="border rounded px-2 py-1 w-16" />
      <span>–</span>
      <input type="number" min="0" value={value.away} disabled={disabled}
        onChange={(e) => onChange({ ...value, away: e.target.value })} className="border rounded px-2 py-1 w-16" />
    </div>
  );
}
