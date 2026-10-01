// src/pages/admin/FinalResultsAdminPage.jsx
//
// Final week: the admin fills in the 6 single-set knockout slots
// (singles Semifinal 1/2 + Final, doubles Semifinal 1/2 + Final) among
// the season's qualifying players — Rising Stars' combined, every-
// division leaderboard, top 4 singles / top 8 doubles
// (RisingStarsPage.jsx's QUALIFY_COUNT/aggregatePlayerStats, reused
// here so "who qualifies" is computed exactly the same way in both
// places). The admin picks who plays each slot by hand (doubles pairs
// are whatever two of the 8 qualified players the admin picks for that
// match, not necessarily their in-season partner) — there's no auto-
// generated bracket.
//
// Scoring is the same rules as everywhere else, just a single set:
// isValidSinglesSet (to 6, or 7-6) and isValidStandardTiebreakSet (the
// standard 7-point breaker, not doubles' 10-point super-tiebreak — see
// the scoring.js fix for singles' own in-season sets).
//
// Save keeps a match as a private draft (posted=false, visible only
// here); Post makes it public on the Results page's Final Results tab
// (final_matches_select RLS: posted=true or admin) and, for the Final
// stage specifically, also sets the season's champion/runner-up fields
// (seasons.champion_singles_winner_id/runnerup_id,
// champion_doubles_winner_ids/runnerup_ids — Req 6.11, previously
// schema-only).

import { useCallback, useEffect, useState } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { computeIndividualStandings } from '../../lib/standings.js';
import { aggregatePlayerStats, QUALIFY_COUNT } from '../public/RisingStarsPage.jsx';
import { isValidSinglesSet, isValidStandardTiebreakSet } from '../../lib/scoring.js';
import PageHeader from '../../components/PageHeader.jsx';

const STAGES = [
  { key: 'semifinal1', label: 'Semifinal 1' },
  { key: 'semifinal2', label: 'Semifinal 2' },
  { key: 'final', label: 'Final' },
];

export default function FinalResultsAdminPage() {
  const { seasonId } = useSeason();
  const [qualified, setQualified] = useState({ singles: [], doubles: [] });
  const [matches, setMatches] = useState(null); // null = loading
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!seasonId) { setQualified({ singles: [], doubles: [] }); setMatches([]); return; }
    setMatches(null);

    const { data: fixtureRows } = await supabase
      .from('fixtures')
      .select(`
        id, division_id, home_team_id, away_team_id,
        rubbers(rubber_type, winner_side, confirmed_at, home_player1_id, home_player2_id, away_player1_id, away_player2_id, set1_home, set1_away, set2_home, set2_away, set3_home, set3_away)
      `)
      .eq('season_id', seasonId)
      .eq('is_bye', false);

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
    const nameOf = Object.fromEntries((playerRows || []).map((p) => [p.id, p.name]));

    const fixtures = (fixtureRows || []).map((f) => ({
      ...f,
      rubbers: (f.rubbers ?? []).map((r) => ({
        ...r,
        homeNames: { [r.home_player1_id]: nameOf[r.home_player1_id], [r.home_player2_id]: nameOf[r.home_player2_id] },
        awayNames: { [r.away_player1_id]: nameOf[r.away_player1_id], [r.away_player2_id]: nameOf[r.away_player2_id] },
      })),
    }));

    const singlesRanked = computeIndividualStandings(aggregatePlayerStats(fixtures, 'singles'));
    const doublesRanked = computeIndividualStandings(aggregatePlayerStats(fixtures, 'doubles'));
    setQualified({
      singles: singlesRanked.filter((r) => r.rank <= QUALIFY_COUNT.singles),
      doubles: doublesRanked.filter((r) => r.rank <= QUALIFY_COUNT.doubles),
    });

    const { data: matchRows, error: matchErr } = await supabase.from('final_matches').select('*').eq('season_id', seasonId);
    if (matchErr) { setError(matchErr.message); setMatches([]); return; }
    setMatches(matchRows || []);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  function matchFor(kind, stage) {
    return (matches || []).find((m) => m.kind === kind && m.stage === stage) ?? null;
  }

  async function saveMatch(kind, stage, existing, fields) {
    setError('');
    const payload = { season_id: seasonId, kind, stage, ...fields, updated_at: new Date().toISOString() };
    const { error: err } = existing
      ? await supabase.from('final_matches').update(payload).eq('id', existing.id)
      : await supabase.from('final_matches').insert(payload);
    if (err) { setError(err.message); return false; }
    await load();
    return true;
  }

  async function postMatch(existing) {
    if (!existing) return;
    if (!existing.winner_side) { setError('Enter a valid score and save it first.'); return; }
    setError('');
    const { error: err } = await supabase
      .from('final_matches')
      .update({ posted: true, posted_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (err) { setError(err.message); return; }

    if (existing.stage === 'final') {
      const winnerIsA = existing.winner_side === 'a';
      if (existing.kind === 'singles') {
        await supabase.from('seasons').update({
          champion_singles_winner_id: winnerIsA ? existing.side_a_player1_id : existing.side_b_player1_id,
          champion_singles_runnerup_id: winnerIsA ? existing.side_b_player1_id : existing.side_a_player1_id,
        }).eq('id', seasonId);
      } else {
        const winnerPair = winnerIsA
          ? [existing.side_a_player1_id, existing.side_a_player2_id]
          : [existing.side_b_player1_id, existing.side_b_player2_id];
        const loserPair = winnerIsA
          ? [existing.side_b_player1_id, existing.side_b_player2_id]
          : [existing.side_a_player1_id, existing.side_a_player2_id];
        await supabase.from('seasons').update({
          champion_doubles_winner_ids: winnerPair,
          champion_doubles_runnerup_ids: loserPair,
        }).eq('id', seasonId);
      }
    }
    await load();
  }

  if (!seasonId) return <p className="p-6 text-gray-500">No season selected.</p>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader
        title="Final Results"
        subtitle="Fill in the final week's single-set semifinals and final, among the season's qualifying players (Rising Stars, every division combined)."
      />

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {matches === null ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        ['singles', 'doubles'].map((kind) => (
          <div key={kind} className="mb-8">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 border-b-2 border-accent-500 pb-1 mb-3">
              {kind} ({qualified[kind].length} of {QUALIFY_COUNT[kind]} qualified players on file)
            </h2>
            {qualified[kind].length < 2 ? (
              <p className="text-gray-500 text-sm mb-4">Not enough confirmed {kind} results yet to know who qualifies.</p>
            ) : (
              <div className="space-y-4">
                {STAGES.map((s) => (
                  <MatchSlot
                    key={s.key}
                    label={s.label}
                    kind={kind}
                    stage={s.key}
                    qualifiedPlayers={qualified[kind]}
                    existing={matchFor(kind, s.key)}
                    onSave={(fields) => saveMatch(kind, s.key, matchFor(kind, s.key), fields)}
                    onPost={() => postMatch(matchFor(kind, s.key))}
                  />
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function PlayerSelect({ value, onChange, options, disabled }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className="border rounded px-2 py-1 text-sm w-full"
    >
      <option value="">— select —</option>
      {options.map((p) => (
        <option key={p.playerId} value={p.playerId} disabled={p.disabled}>
          {p.playerName}{p.teamName ? ` (${p.teamName})` : ''}
        </option>
      ))}
    </select>
  );
}

/** One slot (e.g. "Singles — Semifinal 1"): player picker(s) for each side, a single-set score, Save (draft) and Post (public) buttons. */
function MatchSlot({ label, kind, stage, qualifiedPlayers, existing, onSave, onPost }) {
  const playersPerSide = kind === 'doubles' ? 2 : 1;

  const [a1, setA1] = useState(existing?.side_a_player1_id ?? null);
  const [a2, setA2] = useState(existing?.side_a_player2_id ?? null);
  const [b1, setB1] = useState(existing?.side_b_player1_id ?? null);
  const [b2, setB2] = useState(existing?.side_b_player2_id ?? null);
  const [gamesA, setGamesA] = useState(existing?.side_a_games ?? '');
  const [gamesB, setGamesB] = useState(existing?.side_b_games ?? '');
  const [tiebreakA, setTiebreakA] = useState(existing?.tiebreak_a ?? '');
  const [tiebreakB, setTiebreakB] = useState(existing?.tiebreak_b ?? '');
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  const chosen = [a1, a2, b1, b2].filter(Boolean);
  const options = qualifiedPlayers.map((p) => ({ playerId: p.playerId, playerName: p.playerName, teamName: p.teamName }));
  const availableFor = (currentValue) =>
    options.map((o) => ({ ...o, disabled: o.playerId !== currentValue && chosen.includes(o.playerId) }));

  const isTiebreakSet = Number(gamesA) === 7 && Number(gamesB) === 6 || Number(gamesA) === 6 && Number(gamesB) === 7;

  async function handleSave() {
    setFieldError('');
    const sideAPlayers = [a1, ...(playersPerSide === 2 ? [a2] : [])];
    const sideBPlayers = [b1, ...(playersPerSide === 2 ? [b2] : [])];
    if (sideAPlayers.some((p) => !p) || sideBPlayers.some((p) => !p)) {
      setFieldError(`Pick ${playersPerSide === 2 ? 'both players for' : 'a player on'} each side.`);
      return;
    }

    const fields = {
      side_a_player1_id: a1, side_a_player2_id: playersPerSide === 2 ? a2 : null,
      side_b_player1_id: b1, side_b_player2_id: playersPerSide === 2 ? b2 : null,
    };

    if (gamesA !== '' || gamesB !== '') {
      const ga = Number(gamesA), gb = Number(gamesB);
      if (gamesA === '' || gamesB === '' || !isValidSinglesSet(ga, gb)) {
        setFieldError('Invalid set score.');
        return;
      }
      fields.side_a_games = ga;
      fields.side_b_games = gb;
      if (isTiebreakSet) {
        const tba = Number(tiebreakA), tbb = Number(tiebreakB);
        if (tiebreakA === '' || tiebreakB === '' || !isValidStandardTiebreakSet(tba, tbb)) {
          setFieldError('Set went to 7-6 — enter a valid tiebreak point score (min 7, win by 2 past 6-6).');
          return;
        }
        fields.tiebreak_a = tba;
        fields.tiebreak_b = tbb;
      } else {
        fields.tiebreak_a = null;
        fields.tiebreak_b = null;
      }
      fields.winner_side = ga > gb ? 'a' : 'b';
    } else {
      fields.side_a_games = null;
      fields.side_b_games = null;
      fields.tiebreak_a = null;
      fields.tiebreak_b = null;
      fields.winner_side = null;
    }

    setSaving(true);
    await onSave(fields);
    setSaving(false);
  }

  async function handlePost() {
    setPosting(true);
    await onPost();
    setPosting(false);
  }

  return (
    <div className={`border rounded p-3 ${existing?.posted ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">{label}</h3>
        {existing?.posted && <span className="text-xs font-bold uppercase text-green-700">✓ Posted</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-2">
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Side A</label>
          <PlayerSelect value={a1} onChange={setA1} options={availableFor(a1)} />
          {playersPerSide === 2 && <div className="mt-1"><PlayerSelect value={a2} onChange={setA2} options={availableFor(a2)} /></div>}
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Side B</label>
          <PlayerSelect value={b1} onChange={setB1} options={availableFor(b1)} />
          {playersPerSide === 2 && <div className="mt-1"><PlayerSelect value={b2} onChange={setB2} options={availableFor(b2)} /></div>}
        </div>
      </div>

      <div className="flex items-end gap-2 mb-2">
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Games A</label>
          <input type="number" min={0} max={7} value={gamesA} onChange={(e) => setGamesA(e.target.value)} className="border rounded px-2 py-1 text-sm w-16" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Games B</label>
          <input type="number" min={0} max={7} value={gamesB} onChange={(e) => setGamesB(e.target.value)} className="border rounded px-2 py-1 text-sm w-16" />
        </div>
        {isTiebreakSet && (
          <>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Tiebreak A</label>
              <input type="number" min={0} max={50} value={tiebreakA} onChange={(e) => setTiebreakA(e.target.value)} className="border rounded px-2 py-1 text-sm w-16" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Tiebreak B</label>
              <input type="number" min={0} max={50} value={tiebreakB} onChange={(e) => setTiebreakB(e.target.value)} className="border rounded px-2 py-1 text-sm w-16" />
            </div>
          </>
        )}
      </div>

      {fieldError && <p className="text-red-600 text-xs mb-2">{fieldError}</p>}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handlePost}
          disabled={posting || !existing?.winner_side || existing?.posted}
          title={!existing?.winner_side ? 'Save a valid score first' : undefined}
          className="px-3 py-1.5 rounded bg-accent-500 text-teal-950 text-sm font-bold uppercase tracking-wide hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {existing?.posted ? 'Posted' : posting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
}
