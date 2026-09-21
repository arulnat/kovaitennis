// src/pages/team/ScoreEntryPage.jsx
//
// Req 5.1–5.9: either captain enters/edits a tie's 3 rubbers. Once all 3
// are in, the tie stays editable by either captain for 7 days (incl.
// player corrections, Req 5.7), then locks to admin-only. No confirm/
// dispute step (v6). Eligibility (5.5) is enforced by filtering the
// player selectors live via selectablePlayers().

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../lib/auth.jsx';
import {
  RUBBER_TYPES, winnerFromSets, isValidSinglesSet, isValidDoublesRegularSet,
  isValidSuperTiebreakSet, applyWalkover, selectablePlayers, isValidTimePlayed,
  defaultWalkoverTime, scoreToRow, rowToScore,
} from '../../lib/scoring.js';

const EDIT_WINDOW_DAYS = 7; // Req 5.7

export default function ScoreEntryPage({ fixtureId }) {
  const { teamId, isAdmin } = useAuth();
  const [fixture, setFixture] = useState(null);
  const [rubbers, setRubbers] = useState({}); // keyed by rubber_type
  const [roster, setRoster] = useState({ home: [], away: [] });

  useEffect(() => {
    supabase.from('fixtures').select('*').eq('id', fixtureId).single().then(({ data }) => setFixture(data));
    supabase.from('rubbers').select('*').eq('fixture_id', fixtureId).then(({ data }) => {
      const byType = {};
      for (const r of data || []) byType[r.rubber_type] = r;
      setRubbers(byType);
    });
  }, [fixtureId]);

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
  const earliestLock = useMemo(() => {
    const times = RUBBER_TYPES.map((t) => rubbers[t]?.completed_at).filter(Boolean);
    if (times.length < 3) return null;
    const latestCompletion = new Date(Math.max(...times.map((t) => new Date(t).getTime())));
    return new Date(latestCompletion.getTime() + EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  }, [rubbers]);

  const isLocked = tieComplete && earliestLock && new Date() > earliestLock && !isAdmin;
  const canEdit = !isLocked; // either captain (home or away) can edit — Req 5.2

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

    // Once all 3 rubbers are in, stamp locked_at on all of them (Req 5.7)
    const { data: allRubbers } = await supabase.from('rubbers').select('*').eq('fixture_id', fixtureId);
    if (allRubbers?.length === 3 && allRubbers.every((r) => r.winner_side)) {
      const lockAt = new Date(Date.now() + EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('rubbers').update({ locked_at: lockAt }).eq('fixture_id', fixtureId).is('locked_at', null);
    }
  }

  if (!fixture) return <p className="p-6">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Score Entry</h1>
      <p className="text-sm text-gray-600 mb-4">
        Either captain can enter or edit any rubber. {tieComplete && !isAdmin && (
          isLocked
            ? <span className="text-red-600">This tie is locked — contact admin for any further changes.</span>
            : <span className="text-teal-700">Editable until {earliestLock?.toLocaleDateString()} (7-day window, Req 5.7).</span>
        )}
      </p>

      {RUBBER_TYPES.map((type) => (
        <RubberEditor
          key={type}
          type={type}
          rubber={rubbers[type]}
          homeRoster={roster.home}
          awayRoster={roster.away}
          selectableHome={selectablePlayers(roster.home.map((p) => p.id), alreadySelectedFor('home'), type)}
          selectableAway={selectablePlayers(roster.away.map((p) => p.id), alreadySelectedFor('away'), type)}
          disabled={!canEdit}
          onSave={(payload) => saveRubber(type, payload)}
        />
      ))}
    </div>
  );
}

function RubberEditor({ type, rubber, homeRoster, awayRoster, selectableHome, selectableAway, disabled, onSave }) {
  const isSingles = type === 'singles';
  const label = type === 'singles' ? 'Singles' : type === 'doubles1' ? 'Doubles 1' : 'Doubles 2';

  const [homePlayers, setHomePlayers] = useState(
    rubber ? [rubber.home_player1_id, rubber.home_player2_id].filter(Boolean) : []
  );
  const [awayPlayers, setAwayPlayers] = useState(
    rubber ? [rubber.away_player1_id, rubber.away_player2_id].filter(Boolean) : []
  );
  const [isWalkover, setIsWalkover] = useState(rubber?.is_walkover ?? false);
  const [walkoverSide, setWalkoverSide] = useState(rubber?.walkover_winner_side ?? 'home');
  const [set1, setSet1] = useState(rubber ? { home: rubber.set1_home, away: rubber.set1_away } : { home: '', away: '' });
  const [set2, setSet2] = useState(rubber?.set2_home != null ? { home: rubber.set2_home, away: rubber.set2_away } : { home: '', away: '' });
  const [set3, setSet3] = useState(rubber?.set3_home != null ? { home: rubber.set3_home, away: rubber.set3_away } : { home: '', away: '' });
  const [timePlayed, setTimePlayed] = useState(rubber?.time_played_minutes ?? '');

  const nameOf = (roster, id) => roster.find((p) => p.id === id)?.name ?? '';

  function handleSubmit() {
    const score = { set1: { home: Number(set1.home), away: Number(set1.away) } };
    if (!isSingles && set2.home !== '') score.set2 = { home: Number(set2.home), away: Number(set2.away) };
    if (!isSingles && set3.home !== '') score.set3 = { home: Number(set3.home), away: Number(set3.away) };

    if (!isWalkover) {
      if (!isValidSinglesSet(score.set1.home, score.set1.away) && isSingles) {
        alert('Invalid set score.'); return;
      }
      if (!isSingles && score.set2 && !isValidDoublesRegularSet(score.set2.home, score.set2.away)) {
        alert('Invalid set 2 score.'); return;
      }
      if (score.set3 && !isValidSuperTiebreakSet(score.set3.home, score.set3.away)) {
        alert('Invalid super-tiebreak score (min 10, win by 2 past 10-10).'); return;
      }
    }

    onSave({
      homePlayers, awayPlayers, score, isWalkover, walkoverSide,
      walkoverStage: { stage: 'not_started' }, // simplified for this scaffold — a full UI would ask which stage
      timePlayed: timePlayed === '' ? null : Number(timePlayed),
    });
  }

  return (
    <div className="border rounded p-4 mb-4">
      <p className="font-medium mb-2">{label}</p>

      <div className="grid grid-cols-2 gap-4 mb-2">
        <PlayerPicker label="Home" roster={homeRoster} selectable={selectableHome} count={isSingles ? 1 : 2} value={homePlayers} onChange={setHomePlayers} disabled={disabled} />
        <PlayerPicker label="Away" roster={awayRoster} selectable={selectableAway} count={isSingles ? 1 : 2} value={awayPlayers} onChange={setAwayPlayers} disabled={disabled} />
      </div>

      <label className="flex items-center gap-2 text-sm mb-2">
        <input type="checkbox" checked={isWalkover} onChange={(e) => setIsWalkover(e.target.checked)} disabled={disabled} />
        Walkover
      </label>

      {isWalkover ? (
        <select value={walkoverSide} onChange={(e) => setWalkoverSide(e.target.value)} disabled={disabled} className="border rounded px-2 py-1 text-sm mb-2">
          <option value="home">Home wins (walkover)</option>
          <option value="away">Away wins (walkover)</option>
        </select>
      ) : (
        <div className="space-y-1 mb-2">
          <SetInput label="Set 1" value={set1} onChange={setSet1} disabled={disabled} />
          {!isSingles && <SetInput label="Set 2" value={set2} onChange={setSet2} disabled={disabled} />}
          {!isSingles && <SetInput label="Super-TB (if 1-1)" value={set3} onChange={setSet3} disabled={disabled} />}
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

      {rubber?.winner_side && (
        <p className="text-sm text-teal-700 mb-2">
          Winner: {rubber.winner_side === 'home' ? nameOf(homeRoster, rubber.home_player1_id) || 'Home' : nameOf(awayRoster, rubber.away_player1_id) || 'Away'}
        </p>
      )}

      <button onClick={handleSubmit} disabled={disabled} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm disabled:opacity-50">
        Save {label}
      </button>
    </div>
  );
}

function PlayerPicker({ label, roster, selectable, count, value, onChange, disabled }) {
  const selectableSet = new Set(selectable);
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {[...Array(count)].map((_, i) => (
        <select
          key={i}
          value={value[i] ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const next = [...value];
            next[i] = e.target.value;
            onChange(next);
          }}
          className="border rounded px-2 py-1 text-sm w-full mb-1"
        >
          <option value="">Select player…</option>
          {roster
            .filter((p) => selectableSet.has(p.id) || p.id === value[i])
            .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ))}
    </div>
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
