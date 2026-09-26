// src/lib/scoring.js
//
// Score entry & match rules (Req 5.1–5.9). Pure functions operating on
// plain score objects so they're independent of the DB/UI layer.
//
// Score shape used throughout this module:
//   { set1: {home, away}, set2?: {home, away}, set3?: {home, away} }
// Singles only ever has set1 (Req 5.3 — the whole rubber is one set).
// Doubles has set1 + set2, and set3 ONLY when 1-1 after two sets, holding
// the 10-pt super-tiebreak as the deciding "3rd set" (Req 5.4).

export const RUBBER_TYPES = ['singles', 'doubles1', 'doubles2'];
export const TIME_CAP_MINUTES = 180; // Req 5.9 — hard 3-hour cap

/**
 * Determine the winner of a completed (non-walkover) rubber from its sets.
 * @param {'singles'|'doubles1'|'doubles2'} rubberType
 * @param {{set1:{home:number,away:number}, set2?:{home:number,away:number}, set3?:{home:number,away:number}}} score
 * @returns {'home'|'away'}
 */
export function winnerFromSets(rubberType, score) {
  const { set1, set2, set3 } = score;
  if (!set1) throw new Error('set1 is required');

  const winOf = (s) => (s.home > s.away ? 'home' : 'away');

  if (rubberType === 'singles') {
    return winOf(set1); // singles is a single set, full stop (Req 5.3)
  }

  // doubles: best of 2 sets, decided by set3 (super-tiebreak) if 1-1
  const set1Winner = winOf(set1);
  if (!set2) return set1Winner; // only one set recorded; treat as decisive
  const set2Winner = winOf(set2);

  if (set1Winner === set2Winner) return set1Winner; // 2-0, no breaker needed
  if (!set3) {
    throw new Error('Doubles rubber is 1-1 after two sets — set3 (the super-tiebreak decider) is required');
  }
  return winOf(set3);
}

/** Singles set: single set to 6, standard 7-pt tiebreak at 6-6, recorded as "7-6" (Req 5.3). */
export function isValidSinglesSet(home, away) {
  return isValidSetScore(home, away);
}

/** Doubles regular set: standard 7-pt tiebreak at 6-6 (Req 5.4), recorded as 7-6. */
export function isValidDoublesRegularSet(home, away) {
  return isValidSetScore(home, away);
}

/**
 * A doubles super-tiebreak "set" (Req 5.4, and singles' 6-6 breaker under
 * 5.3): minimum winning score 10, must win by 2 beyond 10-10.
 */
export function isValidSuperTiebreakSet(home, away) {
  if (home < 0 || away < 0) return false;
  const max = Math.max(home, away);
  const min = Math.min(home, away);
  if (max < 10) return false;
  if (max === 10) return min <= 8;
  return max - min === 2; // past 10, must win by exactly 2 (11-9, 12-10, ...)
}

function isValidSetScore(home, away) {
  if (home < 0 || away < 0) return false;
  const max = Math.max(home, away);
  const min = Math.min(home, away);
  if (max < 6) return false;
  if (max === 6) return min <= 4; // 6-0..6-4
  if (max === 7) return min === 5 || min === 6; // 7-5, or 7-6 (tiebreak win)
  return false; // no set score should exceed 7 games under this ruleset
}

/**
 * Walkover auto-fill (Req 5.6). Given when the walkover was declared,
 * compute the resulting score in the same {set1, set2?, set3?} shape used
 * everywhere else in this module.
 *
 * @param {'singles'|'doubles'} matchKind
 * @param {'home'|'away'} winnerSide
 * @param {object} progress - what had actually been played:
 *   { stage: 'not_started' }
 *   { stage: 'mid_set1', loserGames: number }
 *   { stage: 'set1_complete', set1: {home,away} }                        // doubles only
 *   { stage: 'mid_set2', set1: {home,away}, loserGames: number }         // doubles only
 *   { stage: 'mid_super_tiebreak', set1: {home,away}, set2: {home,away}, loserPoints: number } // doubles only
 *   { stage: 'mid_super_tiebreak', loserPoints: number }                 // singles' 6-6 breaker
 * @returns {{set1:{home,away}, set2?:{home,away}, set3?:{home,away}}}
 */
export function applyWalkover(matchKind, winnerSide, progress) {
  const winScore = (loser) => (winnerSide === 'home' ? { home: 6, away: loser } : { home: loser, away: 6 });
  const cleanShutout = () => (winnerSide === 'home' ? { home: 6, away: 0 } : { home: 0, away: 6 });
  const breakerScore = (loserPoints, winTo = 10) =>
    winnerSide === 'home' ? { home: winTo, away: loserPoints } : { home: loserPoints, away: winTo };

  if (matchKind === 'singles') {
    switch (progress.stage) {
      case 'not_started':
        return { set1: cleanShutout() };
      case 'mid_set1':
        return { set1: winScore(progress.loserGames) };
      case 'mid_super_tiebreak':
        // singles' breaker result is folded into the single set's score,
        // recorded simply as 7-6 per Req 5.3 — the breaker stopping mid-way
        // still resolves the set as a 7-6 win, not a separate field.
        return { set1: winnerSide === 'home' ? { home: 7, away: 6 } : { home: 6, away: 7 } };
      default:
        throw new Error(`Unhandled singles walkover stage: ${progress.stage}`);
    }
  }

  // doubles
  switch (progress.stage) {
    case 'not_started':
      return { set1: cleanShutout() };
    case 'mid_set1':
      return { set1: winScore(progress.loserGames) };
    case 'set1_complete':
      // set1 stands as played; set2 hadn't started -> clean shutout
      return { set1: progress.set1, set2: cleanShutout() };
    case 'mid_set2': {
      const set2 = winScore(progress.loserGames);
      const set1Winner = progress.set1.home > progress.set1.away ? 'home' : 'away';
      const set2Winner = set2.home > set2.away ? 'home' : 'away'; // == winnerSide
      if (set1Winner !== set2Winner) {
        // 1-1 after the walkover-completed set2 -> auto super-tiebreak 10-0
        return { set1: progress.set1, set2, set3: winnerSide === 'home' ? { home: 10, away: 0 } : { home: 0, away: 10 } };
      }
      return { set1: progress.set1, set2 };
    }
    case 'mid_super_tiebreak':
      return { set1: progress.set1, set2: progress.set2, set3: breakerScore(progress.loserPoints) };
    default:
      throw new Error(`Unhandled doubles walkover stage: ${progress.stage}`);
  }
}

/**
 * Eligibility (Req 5.5): a player may play singles + at most one doubles
 * rubber, never both doubles. Given the players already selected elsewhere
 * in this tie (by team side), return the pool of selectable player IDs.
 * Also used when a captain corrects a mis-selected player (5.7/5.5) —
 * call again with the updated `alreadySelected` to get a fresh valid pool.
 *
 * @param {string[]} teamRosterIds - all eligible player IDs for the team
 * @param {{singles?:string, doubles1?:string[], doubles2?:string[]}} alreadySelected
 * @param {'singles'|'doubles1'|'doubles2'} forRubber - which slot we're filling
 */
export function selectablePlayers(teamRosterIds, alreadySelected, forRubber) {
  // Singles is unrestricted by doubles selections — a player CAN play
  // singles plus one doubles rubber in the same tie (Req 5.5).
  if (forRubber === 'singles') {
    return [...teamRosterIds];
  }
  // The two doubles rubbers ARE mutually exclusive with each other.
  const otherDoublesSelections = forRubber === 'doubles1' ? alreadySelected.doubles2 : alreadySelected.doubles1;
  const used = new Set(otherDoublesSelections || []);
  return teamRosterIds.filter((id) => !used.has(id));
}

/** Time-played validation (Req 5.9): 0–180 minutes inclusive. */
export function isValidTimePlayed(minutes) {
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= TIME_CAP_MINUTES;
}

/**
 * Default time-played for a walkover (Req 5.9): 0 for a clean
 * (not-started) walkover; for any partial-match walkover, the captain's
 * already-entered value is kept as-is (returning null here signals
 * "don't overwrite whatever was entered").
 */
export function defaultWalkoverTime(stage) {
  return stage === 'not_started' ? 0 : null;
}

/**
 * Convert a {set1,set2?,set3?} score into the flat DB row shape used by
 * the `rubbers` table.
 */
export function scoreToRow(score) {
  return {
    set1_home: score.set1?.home ?? null,
    set1_away: score.set1?.away ?? null,
    set1_tiebreak_home: score.set1?.tiebreakHome ?? null,
    set1_tiebreak_away: score.set1?.tiebreakAway ?? null,
    set2_home: score.set2?.home ?? null,
    set2_away: score.set2?.away ?? null,
    set3_home: score.set3?.home ?? null,
    set3_away: score.set3?.away ?? null,
  };
}

/** Inverse of scoreToRow. */
export function rowToScore(row) {
  const score = { set1: { home: row.set1_home, away: row.set1_away } };
  if (row.set1_tiebreak_home != null) {
    score.set1.tiebreakHome = row.set1_tiebreak_home;
    score.set1.tiebreakAway = row.set1_tiebreak_away;
  }
  if (row.set2_home != null) score.set2 = { home: row.set2_home, away: row.set2_away };
  if (row.set3_home != null) score.set3 = { home: row.set3_home, away: row.set3_away };
  return score;
}
