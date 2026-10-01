// Zero-dependency test runner — `node src/lib/__tests__/run-tests.mjs`
// Exercises the pure logic modules against the actual requirement
// scenarios described in v6, so the algorithms are verified before
// they're wired into the UI.

import assert from 'node:assert/strict';
import {
  generateRoundRobin, assignHomeAway, homeAwayBalanceReport,
  buildPriorMeetingMap, buildFixtureRows, computeMatchWeekends, pairKey,
} from '../scheduler.js';
import {
  winnerFromSets, isValidSinglesSet, isValidDoublesRegularSet,
  isValidSuperTiebreakSet, isValidStandardTiebreakSet, applyWalkover, selectablePlayers,
  isValidTimePlayed, defaultWalkoverTime, setsAndGamesFromRow,
} from '../scoring.js';
import {
  computeTeamStandings, computeIndividualStandings, highlightBands,
} from '../standings.js';
import { validateBulkUpload, generateLoginId } from '../bulkUpload.js';
import { seededShuffle, planAutoGroup } from '../grouping.js';
import { normalizePhone } from '../phone.js';
import { calculateAge, isAgeEligible, MIN_AGE } from '../age.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  - ${name}`); }
  catch (e) { failed++; console.log(`FAIL  - ${name}\n        ${e.message}`); }
}

console.log('\n== scheduler.js ==');

test('round robin: 4 teams -> 3 rounds, everyone plays everyone once, no byes', () => {
  const rounds = generateRoundRobin(['A', 'B', 'C', 'D']);
  assert.equal(rounds.length, 3);
  const seen = new Set();
  for (const { pairs } of rounds) {
    assert.equal(pairs.length, 2); // 4 teams -> 2 matches per round, no bye
    for (const [a, b] of pairs) seen.add(pairKey(a, b));
  }
  assert.equal(seen.size, 6); // C(4,2) = 6 unique pairings total
});

test('round robin: 5 teams (odd) -> each round has exactly one bye', () => {
  const rounds = generateRoundRobin(['A', 'B', 'C', 'D', 'E']);
  assert.equal(rounds.length, 5);
  for (const { pairs } of rounds) {
    assert.equal(pairs.length, 2); // 5 teams -> 2 matches + 1 sitting out
  }
  // every team should sit a bye exactly once across 5 rounds
  const playedCount = Object.fromEntries(['A','B','C','D','E'].map(t => [t, 0]));
  for (const { pairs } of rounds) for (const [a,b] of pairs) { playedCount[a]++; playedCount[b]++; }
  for (const t of ['A','B','C','D','E']) assert.equal(playedCount[t], 4); // played all 4 others

  // the bye field names exactly the team sitting out that round, and each
  // team gets exactly one bye across the 5 rounds (Req 4.5)
  const byeCount = Object.fromEntries(['A','B','C','D','E'].map(t => [t, 0]));
  for (const { pairs, bye } of rounds) {
    assert.notEqual(bye, null);
    assert.ok(!pairs.flat().includes(bye), `bye team ${bye} should not also appear in a pair`);
    byeCount[bye]++;
  }
  for (const t of ['A','B','C','D','E']) assert.equal(byeCount[t], 1);
});

test('round robin: 4 teams (even) -> bye is null every round', () => {
  const rounds = generateRoundRobin(['A', 'B', 'C', 'D']);
  for (const { bye } of rounds) assert.equal(bye, null);
});

test('home/away: prior-season meeting triggers an automatic swap (Req 4.9)', () => {
  const rounds = generateRoundRobin(['A', 'B']);
  const prior = buildPriorMeetingMap([{ home_team_id: 'A', away_team_id: 'B' }]);
  const scheduled = assignHomeAway(rounds, prior);
  const tie = scheduled[0].ties[0];
  assert.equal(tie.swapped, true);
  assert.equal(tie.home, 'B'); // A hosted last time -> B hosts now
  assert.equal(tie.away, 'A');
});

test('home/away: no prior meeting -> balanced within the season (Req 4.6)', () => {
  const rounds = generateRoundRobin(['A', 'B', 'C', 'D']);
  const scheduled = assignHomeAway(rounds, new Map());
  const report = homeAwayBalanceReport(scheduled);
  for (const r of report) assert.equal(r.balanced, true, `team ${r.teamId} unbalanced: ${r.home}H/${r.away}A`);
});

test('home/away: balance holds for odd team counts too, where a naive greedy pick fails often (Req 4.6)', () => {
  // A running "give home to whoever has fewer home games so far" greedy —
  // the previous implementation — violates |home-away|<=1 for 35-90% of
  // random trials on odd team counts. assignHomeAway must not regress to
  // that: verify every team count from 3 to 15 comes out balanced.
  for (let n = 3; n <= 15; n++) {
    const teams = Array.from({ length: n }, (_, i) => `T${i}`);
    const rounds = generateRoundRobin(teams);
    const scheduled = assignHomeAway(rounds, new Map());
    const report = homeAwayBalanceReport(scheduled);
    for (const r of report) {
      assert.equal(r.balanced, true, `n=${n} team ${r.teamId} unbalanced: ${r.home}H/${r.away}A`);
    }
  }
});

test('home/away: every pair plays exactly once, home+away covers all of it, no team plays itself', () => {
  const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const rounds = generateRoundRobin(teams);
  const scheduled = assignHomeAway(rounds, new Map());
  const seenPairs = new Set();
  for (const { ties } of scheduled) {
    for (const { home, away } of ties) {
      assert.notEqual(home, away);
      const key = pairKey(home, away);
      assert.ok(!seenPairs.has(key), `pair ${key} scheduled more than once`);
      seenPairs.add(key);
    }
  }
  assert.equal(seenPairs.size, (teams.length * (teams.length - 1)) / 2);
});

test('home/away: forced Req 4.9 swaps are always respected, even when they push a team out of balance', () => {
  // 6 teams, ALL pairs forced (worst case for the repair pass) — the
  // forced direction must never be violated, whatever it costs balance.
  const teams = ['A', 'B', 'C', 'D', 'E', 'F'];
  const rounds = generateRoundRobin(teams);
  const prior = new Map();
  const priorFixtures = [];
  for (const { pairs } of rounds) {
    for (const [a, b] of pairs) priorFixtures.push({ home_team_id: a, away_team_id: b });
  }
  const priorMap = buildPriorMeetingMap(priorFixtures);
  const scheduled = assignHomeAway(rounds, priorMap);
  for (const { ties } of scheduled) {
    for (const { home, away, swapped } of ties) {
      assert.equal(swapped, true);
      // whoever was home in priorFixtures must be AWAY now
      const key = pairKey(home, away);
      assert.equal(priorMap.get(key), away);
    }
  }
});

test('buildFixtureRows: 5 teams -> correct row count, week dates 7 days apart, one bye row per round', () => {
  const rows = buildFixtureRows({
    seasonId: 'S1', divisionId: 'D1', teamIds: ['A', 'B', 'C', 'D', 'E'], startWeekend: '2026-01-03',
  });
  // 5 teams: 5 rounds, 2 real ties + 1 bye row per round = 15 rows total
  assert.equal(rows.length, 15);
  assert.equal(rows.filter((r) => r.is_bye).length, 5);
  assert.equal(rows.filter((r) => !r.is_bye).length, 10);
  for (const r of rows) { assert.equal(r.season_id, 'S1'); assert.equal(r.division_id, 'D1'); assert.equal(r.status, 'released'); }

  const weekDatesByRound = new Map(rows.map((r) => [r.round_number, r.week_date]));
  assert.equal(weekDatesByRound.get(1), '2026-01-03');
  assert.equal(weekDatesByRound.get(2), '2026-01-10');
  assert.equal(weekDatesByRound.get(3), '2026-01-17');

  for (const r of rows.filter((r) => r.is_bye)) {
    assert.equal(r.home_team_id, null);
    assert.notEqual(r.away_team_id, null);
  }
});

test('computeMatchWeekends: no holidays -> plain weekly cadence', () => {
  const weekends = computeMatchWeekends('2026-01-03', 4);
  assert.deepEqual(weekends, ['2026-01-03', '2026-01-10', '2026-01-17', '2026-01-24']);
});

test('computeMatchWeekends: a holiday mid-season pushes that round and everything after it by a week', () => {
  // round 3 would normally fall on 2026-01-17 -- mark it a holiday
  const weekends = computeMatchWeekends('2026-01-03', 4, ['2026-01-17']);
  assert.deepEqual(weekends, ['2026-01-03', '2026-01-10', '2026-01-24', '2026-01-31']);
});

test('computeMatchWeekends: a holiday before generation is skipped the same as one added later (rain-out)', () => {
  // two ways of expressing "round 1 can't be played on 2026-01-03" produce
  // the same schedule -- planned in advance or reacted to after the fact
  const plannedInAdvance = computeMatchWeekends('2026-01-03', 3, ['2026-01-03']);
  const addedLikeARainOut = computeMatchWeekends('2026-01-03', 3, ['2026-01-03']);
  assert.deepEqual(plannedInAdvance, addedLikeARainOut);
  assert.deepEqual(plannedInAdvance, ['2026-01-10', '2026-01-17', '2026-01-24']);
});

test('buildFixtureRows: a holiday shifts week dates but leaves round_number/pairings alone', () => {
  const withoutHoliday = buildFixtureRows({
    seasonId: 'S1', divisionId: 'D1', teamIds: ['A', 'B', 'C', 'D'], startWeekend: '2026-01-03',
  });
  const withHoliday = buildFixtureRows({
    seasonId: 'S1', divisionId: 'D1', teamIds: ['A', 'B', 'C', 'D'], startWeekend: '2026-01-03', holidays: ['2026-01-10'],
  });

  // same pairings/rounds, just later dates from round 2 onward
  const strip = (rows) => rows.map(({ week_date, ...rest }) => rest).sort((a, b) => a.round_number - b.round_number || (a.home_team_id || '').localeCompare(b.home_team_id || ''));
  assert.deepEqual(strip(withoutHoliday), strip(withHoliday));

  const datesByRound = (rows) => new Map(rows.map((r) => [r.round_number, r.week_date]));
  assert.equal(datesByRound(withoutHoliday).get(1), datesByRound(withHoliday).get(1)); // round 1 untouched
  assert.notEqual(datesByRound(withoutHoliday).get(2), datesByRound(withHoliday).get(2)); // round 2 pushed
});

console.log('\n== scoring.js ==');

test('singles set validation accepts 6-4, 7-5, 7-6; rejects 8-6, 6-5', () => {
  assert.equal(isValidSinglesSet(6, 4), true);
  assert.equal(isValidSinglesSet(7, 5), true);
  assert.equal(isValidSinglesSet(7, 6), true); // the 10-pt breaker, recorded as 7-6
  assert.equal(isValidSinglesSet(8, 6), false);
  assert.equal(isValidSinglesSet(6, 5), false);
});

test('super-tiebreak validation (doubles set3): 10-8 valid, 10-9 invalid (must win by 2 past 10), 12-10 valid', () => {
  assert.equal(isValidSuperTiebreakSet(10, 8), true);
  assert.equal(isValidSuperTiebreakSet(10, 9), false);
  assert.equal(isValidSuperTiebreakSet(11, 9), true);
  assert.equal(isValidSuperTiebreakSet(12, 10), true);
  assert.equal(isValidSuperTiebreakSet(12, 9), false);
});

test('standard tiebreak validation (singles 6-6 breaker): 7-3 and 7-5 valid, 7-6 invalid (must win by 2), 9-7 valid', () => {
  assert.equal(isValidStandardTiebreakSet(7, 3), true); // a low-scoring breaker, rejected under the old (wrong) 10-point rule
  assert.equal(isValidStandardTiebreakSet(7, 5), true);
  assert.equal(isValidStandardTiebreakSet(7, 6), false); // not a 2-point margin, breaker would continue
  assert.equal(isValidStandardTiebreakSet(8, 6), true);
  assert.equal(isValidStandardTiebreakSet(9, 7), true);
  assert.equal(isValidStandardTiebreakSet(9, 8), false);
  assert.equal(isValidStandardTiebreakSet(6, 4), false); // below 7, breaker isn't over yet
});

test('winnerFromSets: singles is decided by set1 alone', () => {
  assert.equal(winnerFromSets('singles', { set1: { home: 7, away: 6 } }), 'home');
});

test('winnerFromSets: doubles 2-0 needs no super-tiebreak', () => {
  const score = { set1: { home: 6, away: 3 }, set2: { home: 6, away: 4 } };
  assert.equal(winnerFromSets('doubles1', score), 'home');
});

test('winnerFromSets: doubles 1-1 requires set3 (super-tiebreak) to decide', () => {
  const score = { set1: { home: 6, away: 3 }, set2: { home: 4, away: 6 }, set3: { home: 10, away: 7 } };
  assert.equal(winnerFromSets('doubles1', score), 'home');
  assert.throws(() => winnerFromSets('doubles1', { set1: score.set1, set2: score.set2 }));
});

test('walkover: singles, before any games -> clean 6-0', () => {
  const r = applyWalkover('singles', 'home', { stage: 'not_started' });
  assert.deepEqual(r.set1, { home: 6, away: 0 });
});

test('walkover: singles, mid-set at 3-2 (home leading, away wins) -> away 6-3... wait, loser keeps actual count', () => {
  // scenario from spec: 3-2 -> 6-2 (winner's actual doesn't matter, loser count kept)
  const r = applyWalkover('singles', 'home', { stage: 'mid_set1', loserGames: 2 });
  assert.deepEqual(r.set1, { home: 6, away: 2 });
});

test('walkover: doubles, set1 complete + set2 not started -> set2 clean 6-0', () => {
  const r = applyWalkover('doubles', 'away', { stage: 'set1_complete', set1: { home: 4, away: 6 } });
  assert.deepEqual(r.set1, { home: 4, away: 6 });
  assert.deepEqual(r.set2, { home: 0, away: 6 });
});

test('walkover: doubles, mid-set2 producing a 1-1 split -> auto super-tiebreak 10-0', () => {
  // home won set1 6-3; away was walking over mid-set2 while leading 4-2
  // -> away wins set2 (bumped to 6, home keeps 2) => set1 home won, set2 away won => 1-1 => breaker
  const r = applyWalkover('doubles', 'away', { stage: 'mid_set2', set1: { home: 6, away: 3 }, loserGames: 2 });
  assert.deepEqual(r.set2, { home: 2, away: 6 });
  assert.deepEqual(r.set3, { home: 0, away: 10 });
});

test('walkover: mid-super-tiebreak, home wins with away having reached 7 -> 10-7', () => {
  const r = applyWalkover('doubles', 'home', {
    stage: 'mid_super_tiebreak',
    set1: { home: 6, away: 4 }, set2: { home: 4, away: 6 }, loserPoints: 7,
  });
  assert.deepEqual(r.set3, { home: 10, away: 7 });
});

test('eligibility: a player picked for doubles1 is excluded from doubles2 but NOT from singles', () => {
  const roster = ['p1', 'p2', 'p3', 'p4'];
  const already = { doubles1: ['p1', 'p2'] };
  assert.deepEqual(selectablePlayers(roster, already, 'doubles2'), ['p3', 'p4']);
  assert.deepEqual(selectablePlayers(roster, already, 'singles'), ['p1', 'p2', 'p3', 'p4']);
});

test('time played: cap at 180 minutes, reject negative/non-integer', () => {
  assert.equal(isValidTimePlayed(180), true);
  assert.equal(isValidTimePlayed(181), false);
  assert.equal(isValidTimePlayed(-1), false);
  assert.equal(isValidTimePlayed(90.5), false);
});

test('walkover time default: 0 for clean walkover, "leave as-is" (null) otherwise', () => {
  assert.equal(defaultWalkoverTime('not_started'), 0);
  assert.equal(defaultWalkoverTime('mid_set1'), null);
});

test('setsAndGamesFromRow: doubles super-tiebreak counts as one set but adds nothing to games', () => {
  // 6-4, 4-6, 10-8 -> sets 2-1, games 10-10 (the breaker's own 10-8 is ignored for games)
  const row = { set1_home: 6, set1_away: 4, set2_home: 4, set2_away: 6, set3_home: 10, set3_away: 8 };
  const r = setsAndGamesFromRow(row);
  assert.equal(r.homeSetsWon, 2);
  assert.equal(r.homeSetsLost, 1);
  assert.equal(r.homeGamesWon, 10);
  assert.equal(r.homeGamesLost, 10);
});

test('setsAndGamesFromRow: singles decided by a 6-6 breaker is recorded as a plain 7-6 set (no set3 involved)', () => {
  const row = { set1_home: 7, set1_away: 6, set2_home: null, set2_away: null, set3_home: null, set3_away: null };
  const r = setsAndGamesFromRow(row);
  assert.equal(r.homeSetsWon, 1);
  assert.equal(r.homeSetsLost, 0);
  assert.equal(r.homeGamesWon, 7);
  assert.equal(r.homeGamesLost, 6);
});

console.log('\n== standings.js ==');

test('team standings: 2-team tiebreak uses head-to-head (Req 6.3)', () => {
  // A and B both finish 1-1 overall but A beat B head-to-head
  const teams = ['A', 'B', 'C'];
  const ties = [
    { homeTeamId: 'A', awayTeamId: 'B', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
    { homeTeamId: 'B', awayTeamId: 'C', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
    { homeTeamId: 'C', awayTeamId: 'A', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
  ];
  // all three teams are 1-1 with equal points (every tie a 3-0 sweep) -> falls through to sets/games diff, all equal -> shared rank
  const standings = computeTeamStandings(teams, ties);
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 1);
  assert.equal(standings[2].rank, 1);
});

test('team standings: clear winner ranks above a tied pair correctly, tied pair shares rank 2', () => {
  const teams = ['A', 'B', 'C'];
  const ties = [
    { homeTeamId: 'A', awayTeamId: 'B', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 2 },
    { homeTeamId: 'A', awayTeamId: 'C', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 2 },
    { homeTeamId: 'B', awayTeamId: 'C', winner: 'home', homeRubbersWon: 2, homeSetsWon: 2, homeSetsLost: 1, homeGamesWon: 12, homeGamesLost: 10 },
  ];
  const standings = computeTeamStandings(teams, ties);
  assert.equal(standings[0].teamId, 'A');
  assert.equal(standings[0].rank, 1);
  // A sweeps both ties (6 pts) and B/C end up on different points (2 vs 1)
  // here, so no tiebreak is even needed between them in this fixture.
});

test('team standings tiebreak (Step 2): 3+ tied on points -> mini-league among just them decides, then Step 3 head-to-head breaks a remaining pair', () => {
  // X, Y, Z all finish on 5 points; W is untied at 3. The mini-league
  // (only the X-Y, X-Z, Y-Z matches) gives X=5, Y=2, Z=2 — X is clear,
  // but Y and Z are left level in the mini-league, so their own direct
  // head-to-head (Y beat Z) breaks that remaining pair per Step 3.
  const teams = ['X', 'Y', 'Z', 'W'];
  const ties = [
    { homeTeamId: 'X', awayTeamId: 'Y', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
    { homeTeamId: 'X', awayTeamId: 'Z', winner: 'home', homeRubbersWon: 2, homeSetsWon: 2, homeSetsLost: 1, homeGamesWon: 12, homeGamesLost: 10 },
    { homeTeamId: 'Y', awayTeamId: 'Z', winner: 'home', homeRubbersWon: 2, homeSetsWon: 2, homeSetsLost: 1, homeGamesWon: 12, homeGamesLost: 10 },
    { homeTeamId: 'W', awayTeamId: 'X', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
    { homeTeamId: 'Y', awayTeamId: 'W', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
    { homeTeamId: 'Z', awayTeamId: 'W', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
  ];
  const standings = computeTeamStandings(teams, ties);
  const rankOf = (id) => standings.find((r) => r.teamId === id).rank;
  assert.equal(rankOf('X'), 1);
  assert.equal(rankOf('Y'), 2); // beat Z head-to-head
  assert.equal(rankOf('Z'), 3);
  assert.equal(rankOf('W'), 4); // never tied with X/Y/Z on points at all
});

test('team standings tiebreak (Step 4): mini-league ties exactly -> games diff separates what it can, residual pair shares rank (draw/lot)', () => {
  // Same 3-team cyclic sweep as the "all equal" test above, but with
  // different game margins this time: the mini-league (identical to the
  // whole 3-team league here) still can't separate anyone, and sets diff
  // is symmetric too (every tie a clean 2-0 sweep) - but games diff
  // separates A from the rest, while B and C remain genuinely tied even
  // on games diff, so they share rank 2 (an actual draw/lot would decide
  // the real order between just the two of them).
  const teams = ['A', 'B', 'C'];
  const ties = [
    { homeTeamId: 'A', awayTeamId: 'B', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
    { homeTeamId: 'B', awayTeamId: 'C', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 6 },
    { homeTeamId: 'C', awayTeamId: 'A', winner: 'home', homeRubbersWon: 3, homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 8 },
  ];
  const standings = computeTeamStandings(teams, ties);
  assert.equal(standings[0].teamId, 'A');
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 2);
  assert.equal(standings[2].rank, 2); // B and C: still tied even after games diff -> shared rank
});

test('individual standings: residual tie after wins/sets/games all equal -> shared rank (Req 6.6)', () => {
  const records = [
    { playerId: 'p1', wins: 3, losses: 1, setsWon: 6, setsLost: 2, gamesWon: 40, gamesLost: 20 },
    { playerId: 'p2', wins: 3, losses: 1, setsWon: 6, setsLost: 2, gamesWon: 40, gamesLost: 20 },
    { playerId: 'p3', wins: 2, losses: 2, setsWon: 4, setsLost: 4, gamesWon: 30, gamesLost: 30 },
  ];
  const standings = computeIndividualStandings(records);
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 1); // shares rank 1 with p1
  assert.equal(standings[2].rank, 3); // next distinct rank is 3, not 2 (competition ranking)
});

test('individual standings: equal wins/sets-diff/games-diff -> more rubbers played ranks higher', () => {
  // p1: 7 played (3 won, 4 lost); p2: 3 played (3 won, 0 lost) — same wins,
  // same sets diff, same games diff, but p1 played more, so p1 ranks first
  // even though p2 is undefeated.
  const records = [
    { playerId: 'p1', wins: 3, losses: 4, setsWon: 8, setsLost: 6, gamesWon: 50, gamesLost: 40 },
    { playerId: 'p2', wins: 3, losses: 0, setsWon: 8, setsLost: 6, gamesWon: 50, gamesLost: 40 },
  ];
  const standings = computeIndividualStandings(records);
  assert.equal(standings[0].playerId, 'p1');
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].playerId, 'p2');
  assert.equal(standings[1].rank, 2);
});

test('highlightBands: top 2 and bottom 2 flagged correctly in a group of 6', () => {
  const rows = [1,2,3,4,5,6].map((rank) => ({ teamId: `T${rank}`, rank }));
  const bands = highlightBands(rows, 6);
  assert.equal(bands[0].highlight, 'top');
  assert.equal(bands[1].highlight, 'top');
  assert.equal(bands[2].highlight, null);
  assert.equal(bands[3].highlight, null);
  assert.equal(bands[4].highlight, 'bottom');
  assert.equal(bands[5].highlight, 'bottom');
});

console.log('\n== bulkUpload.js ==');

test('bulk upload: one row per team creates the captain plus 3 default placeholder players (Req 1.5)', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, true);
  assert.equal(result.teams.length, 1);
  assert.equal(result.teams[0].teamName, 'Aces');
  assert.equal(result.teams[0].players.length, 4); // captain + 3 placeholders
  assert.deepEqual(result.teams[0].players[0], { name: 'Ravi', gender: null, isCaptain: true }); // captain listed first, real name kept
  assert.equal(result.teams[0].players[1].isCaptain, false);
  assert.deepEqual(result.teams[0].players.slice(1).map((p) => p.name), ['Player 1', 'Player 2', 'Player 3']);
});

test('bulk upload: multiple team rows in one file all parse', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210'],
    ['Smashers', 'Anita', '9123456780'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, true);
  assert.equal(result.teams.length, 2);
  assert.equal(result.teams[0].players.length, 4);
  assert.equal(result.teams[1].teamName, 'Smashers');
  assert.equal(result.teams[1].players.length, 4);
});

test('bulk upload: a trailing blank line is ignored, not treated as an empty team row', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210'],
    ['', '', '', ''],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, true);
  assert.equal(result.teams.length, 1);
});

test('bulk upload: whole file rejected if ANY row has an error (all-or-nothing, Req 2.1)', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210'],
    ['Smashers', 'Anita', 'not-a-phone'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('captain phone')));
  // all-or-nothing: even the valid "Aces" row is not returned
  assert.equal(result.teams, undefined);
});

test('bulk upload: captain name is normalized to title case regardless of how it was typed', () => {
  const rows = [
    ['Aces', 'raVI KUMAR', '9876543210'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, true);
  assert.equal(result.teams[0].captainName, 'Ravi Kumar');
  assert.deepEqual(result.teams[0].players.map((p) => p.name), ['Ravi Kumar', 'Player 1', 'Player 2', 'Player 3']);
});

test('bulk upload: a team name that would generate the reserved "admin"/"superadmin" login ID is rejected', () => {
  const rows = [
    ['Admin', 'Ravi', '9876543210'],
    ['Super Admin', 'Anita', '9123456780'], // spaces are dropped -> "superadmin", reserved too
    ['Administrator', 'Deepak', '9123456781'], // -> "administrator", NOT reserved
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('"Admin"') && e.includes('reserved')));
  assert.ok(result.errors.some((e) => e.includes('"Super Admin"') && e.includes('reserved')));
  assert.ok(!result.errors.some((e) => e.includes('"Administrator"')));
});

test('bulk upload: captain phone is normalized — spaces stripped, leading +91/91 stripped', () => {
  const rows = [
    ['Aces', 'Ravi', '+91 98765 43210'],
    ['Smashers', 'Anita', '91 91234 56780'], // no "+", same 91-prefix rule applies
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, true);
  assert.equal(result.teams[0].captainPhone, '9876543210');
  assert.equal(result.teams[1].captainPhone, '9123456780');
});

test('bulk upload: captain phone that isn\'t exactly 10 digits after normalization is rejected', () => {
  const rows = [
    ['Aces', 'Ravi', '98765'], // too short
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('captain phone') && e.includes('10-digit')));
});

test('bulk upload: duplicate team name across rows is caught', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210'],
    ['Aces', 'Deepak', '9123456780'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('duplicate team name')));
});

test('bulk upload: club name defaults to the team name\'s first word when the club column is blank', () => {
  const rows = [
    ['Aces Warriors', 'Ravi', '9876543210', ''], // no club given
    ['Smashers', 'Anita', '9123456780', 'City Sports Club'], // club given explicitly
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, true);
  assert.equal(result.teams[0].clubName, 'Aces'); // first word of "Aces Warriors", no trailing space
  assert.equal(result.teams[1].clubName, 'City Sports Club'); // explicit value untouched
});

test('generateLoginId: keeps only letters, concatenated with nothing between them, lowercased', () => {
  assert.equal(generateLoginId('Chennai Tennis Club!'), 'chennaitennisclub');
  assert.equal(generateLoginId('CMTA-A'), 'cmtaa');
  assert.equal(generateLoginId('KGR Sky Riders'), 'kgrskyriders');
  assert.equal(generateLoginId('Team 7 Aces'), 'teamaces'); // digits dropped too, not just spaces/hyphens
});

console.log('\n== phone.js ==');

test('normalizePhone: plain 10 digits pass through unchanged', () => {
  assert.deepEqual(normalizePhone('9876543210'), { ok: true, value: '9876543210' });
});

test('normalizePhone: spaces are stripped from anywhere in the number', () => {
  assert.deepEqual(normalizePhone('98765 43210'), { ok: true, value: '9876543210' });
  assert.deepEqual(normalizePhone('9 8 7 6 5 4 3 2 1 0'), { ok: true, value: '9876543210' });
});

test('normalizePhone: a leading +91 or 91 (with or without a space) is stripped', () => {
  assert.deepEqual(normalizePhone('+919876543210'), { ok: true, value: '9876543210' });
  assert.deepEqual(normalizePhone('+91 98765 43210'), { ok: true, value: '9876543210' });
  assert.deepEqual(normalizePhone('919876543210'), { ok: true, value: '9876543210' });
  assert.deepEqual(normalizePhone('91 9876543210'), { ok: true, value: '9876543210' });
});

test('normalizePhone: a 10-digit number that happens to start with 91 is left alone, not mistaken for a country code', () => {
  assert.deepEqual(normalizePhone('9187654321'), { ok: true, value: '9187654321' });
});

test('normalizePhone: anything other than exactly 10 digits after stripping is rejected', () => {
  assert.equal(normalizePhone('98765').ok, false); // too short
  assert.equal(normalizePhone('+1 9876543210').ok, false); // non-91 country code -> 11 digits after stripping "+"
  assert.equal(normalizePhone('987-654-3210').ok, false); // dashes aren't stripped, only spaces
  assert.equal(normalizePhone('').ok, false);
});

console.log('\n== age.js ==');

test('calculateAge: exact birthday on the cutoff date counts as having turned that age', () => {
  assert.equal(calculateAge('1986-10-01', '2026-10-01'), 40);
});

test('calculateAge: birthday is one day after the cutoff -> one year younger', () => {
  assert.equal(calculateAge('1986-10-02', '2026-10-01'), 39);
});

test('calculateAge: birthday already passed earlier in the cutoff year', () => {
  assert.equal(calculateAge('1986-01-15', '2026-10-01'), 40);
});

test('isAgeEligible: 40+ as of the season cutoff passes, under 40 fails', () => {
  assert.equal(MIN_AGE, 40);
  assert.equal(isAgeEligible('1986-10-01', '2026-10-01'), true); // exactly 40
  assert.equal(isAgeEligible('1986-10-02', '2026-10-01'), false); // turns 40 one day too late -> still 39
  assert.equal(isAgeEligible('1980-05-20', '2026-10-01'), true); // well over 40
});

console.log('\n== grouping.js ==');

test('seededShuffle: same seed always produces the same order', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(seededShuffle(items, 42), seededShuffle(items, 42));
});

test('seededShuffle: different seeds produce different orders, same elements', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];
  const shuffled42 = seededShuffle(items, 42);
  const shuffled7 = seededShuffle(items, 7);
  assert.notDeepEqual(shuffled42, shuffled7);
  assert.deepEqual([...shuffled42].sort(), [...items].sort());
  assert.deepEqual([...shuffled7].sort(), [...items].sort());
});

test('planAutoGroup: fills the highest division\'s remaining capacity first, in order', () => {
  const plan = planAutoGroup({
    poolIds: ['t1', 't2', 't3', 't4', 't5', 't6', 't7'],
    divisions: [{ id: 'divA', currentCount: 1 }, { id: 'divB', currentCount: 0 }], // divA is highest
    groupSize: 4,
    seed: 42,
  });
  assert.equal(plan.assignments.length, 2);
  assert.equal(plan.assignments[0].divisionId, 'divA');
  assert.equal(plan.assignments[0].teamIds.length, 3); // divA needed 3 more to reach 4
  assert.equal(plan.assignments[1].divisionId, 'divB');
  assert.equal(plan.assignments[1].teamIds.length, 4); // divB was empty, needed all 4
  assert.equal(plan.newGroups.length, 0); // pool exactly fit existing divisions
});

test('planAutoGroup: a division already at or above group size is skipped', () => {
  const plan = planAutoGroup({
    poolIds: ['t1', 't2'],
    divisions: [{ id: 'divA', currentCount: 4 }, { id: 'divB', currentCount: 0 }],
    groupSize: 4,
    seed: 1,
  });
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.assignments[0].divisionId, 'divB');
  assert.equal(plan.assignments[0].teamIds.length, 2);
});

test('planAutoGroup: overflow beyond existing divisions creates new groups, last one smaller', () => {
  const poolIds = Array.from({ length: 10 }, (_, i) => `t${i + 1}`);
  const plan = planAutoGroup({
    poolIds,
    divisions: [{ id: 'divA', currentCount: 2 }, { id: 'divB', currentCount: 4 }], // divB already full
    groupSize: 4,
    seed: 42,
  });
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.assignments[0].divisionId, 'divA');
  assert.equal(plan.assignments[0].teamIds.length, 2); // divA needed 2 more
  assert.equal(plan.newGroups.length, 2); // 8 leftover teams -> two new groups of 4
  assert.equal(plan.newGroups[0].length, 4);
  assert.equal(plan.newGroups[1].length, 4);

  // every pool id is accounted for exactly once
  const allAssigned = [...plan.assignments.flatMap((a) => a.teamIds), ...plan.newGroups.flat()];
  assert.deepEqual([...allAssigned].sort(), [...poolIds].sort());
});

test('planAutoGroup: no existing divisions -> everything becomes new groups, last one smaller', () => {
  const poolIds = Array.from({ length: 7 }, (_, i) => `t${i + 1}`);
  const plan = planAutoGroup({ poolIds, divisions: [], groupSize: 3, seed: 5 });
  assert.equal(plan.assignments.length, 0);
  assert.equal(plan.newGroups.length, 3);
  assert.equal(plan.newGroups[0].length, 3);
  assert.equal(plan.newGroups[1].length, 3);
  assert.equal(plan.newGroups[2].length, 1); // the last group is smaller
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
