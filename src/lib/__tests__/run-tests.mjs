// Zero-dependency test runner — `node src/lib/__tests__/run-tests.mjs`
// Exercises the pure logic modules against the actual requirement
// scenarios described in v6, so the algorithms are verified before
// they're wired into the UI.

import assert from 'node:assert/strict';
import {
  generateRoundRobin, assignHomeAway, homeAwayBalanceReport,
  buildPriorMeetingMap, buildFixtureRows, pairKey,
} from '../scheduler.js';
import {
  winnerFromSets, isValidSinglesSet, isValidDoublesRegularSet,
  isValidSuperTiebreakSet, applyWalkover, selectablePlayers,
  isValidTimePlayed, defaultWalkoverTime,
} from '../scoring.js';
import {
  computeTeamStandings, computeIndividualStandings, highlightBands,
} from '../standings.js';
import { validateBulkUpload, generateLoginId } from '../bulkUpload.js';
import { seededShuffle, planAutoGroup } from '../grouping.js';

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

console.log('\n== scoring.js ==');

test('singles set validation accepts 6-4, 7-5, 7-6; rejects 8-6, 6-5', () => {
  assert.equal(isValidSinglesSet(6, 4), true);
  assert.equal(isValidSinglesSet(7, 5), true);
  assert.equal(isValidSinglesSet(7, 6), true); // the 10-pt breaker, recorded as 7-6
  assert.equal(isValidSinglesSet(8, 6), false);
  assert.equal(isValidSinglesSet(6, 5), false);
});

test('super-tiebreak validation: 10-8 valid, 10-9 invalid (must win by 2 past 10), 12-10 valid', () => {
  assert.equal(isValidSuperTiebreakSet(10, 8), true);
  assert.equal(isValidSuperTiebreakSet(10, 9), false);
  assert.equal(isValidSuperTiebreakSet(11, 9), true);
  assert.equal(isValidSuperTiebreakSet(12, 10), true);
  assert.equal(isValidSuperTiebreakSet(12, 9), false);
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

console.log('\n== standings.js ==');

test('team standings: 2-team tiebreak uses head-to-head (Req 6.3)', () => {
  // A and B both finish 1-1 overall but A beat B head-to-head
  const teams = ['A', 'B', 'C'];
  const ties = [
    { homeTeamId: 'A', awayTeamId: 'B', winner: 'home', homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
    { homeTeamId: 'B', awayTeamId: 'C', winner: 'home', homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
    { homeTeamId: 'C', awayTeamId: 'A', winner: 'home', homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 4 },
  ];
  // all three teams are 1-1 (perfect 3-cycle) -> falls through to sets/games diff, all equal -> shared rank
  const standings = computeTeamStandings(teams, ties);
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 1);
  assert.equal(standings[2].rank, 1);
});

test('team standings: clear winner ranks above a tied pair correctly, tied pair shares rank 2', () => {
  const teams = ['A', 'B', 'C'];
  const ties = [
    { homeTeamId: 'A', awayTeamId: 'B', winner: 'home', homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 2 },
    { homeTeamId: 'A', awayTeamId: 'C', winner: 'home', homeSetsWon: 2, homeSetsLost: 0, homeGamesWon: 12, homeGamesLost: 2 },
    { homeTeamId: 'B', awayTeamId: 'C', winner: 'home', homeSetsWon: 2, homeSetsLost: 1, homeGamesWon: 12, homeGamesLost: 10 },
  ];
  const standings = computeTeamStandings(teams, ties);
  assert.equal(standings[0].teamId, 'A');
  assert.equal(standings[0].rank, 1);
  // B and C both have 1 win, 1 loss, identical sets/games diff by construction below
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

test('bulk upload: captain is added to the roster, so player_count of 3 meets the 4-player minimum (Req 1.5)', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 3],
    ['Sunil', 'Meena', 'Kumar'], // 3 OTHER players, not counting captain Ravi
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, true);
  assert.equal(result.teams.length, 1);
  assert.equal(result.teams[0].teamName, 'Aces');
  assert.equal(result.teams[0].players.length, 4); // 3 + captain
  assert.deepEqual(result.teams[0].players[0], { name: 'Ravi', gender: null }); // captain listed first
  assert.deepEqual(result.teams[0].players.slice(1).map((p) => p.name), ['Sunil', 'Meena', 'Kumar']);
});

test('bulk upload: multiple team blocks in one file all parse', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 3],
    ['Sunil', 'Meena', 'Kumar'],
    ['Smashers', 'Anita', '9123456780', 4],
    ['Rahul', 'Sneha', 'Vikram', 'Lakshmi'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, true);
  assert.equal(result.teams.length, 2);
  assert.equal(result.teams[0].players.length, 4); // 3 + captain Ravi
  assert.equal(result.teams[1].teamName, 'Smashers');
  assert.equal(result.teams[1].players.length, 5); // 4 + captain Anita
});

test('bulk upload: whole file rejected if ANY block has an error (all-or-nothing, Req 2.1)', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 3],
    ['Sunil', 'Meena', 'Kumar'],
    ['Smashers', 'Anita', 'not-a-phone', 3],
    ['Rahul', 'Sneha', 'Vikram'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('captain phone')));
  // all-or-nothing: even the valid "Aces" block is not returned
  assert.equal(result.teams, undefined);
});

test('bulk upload: team with fewer than 4 players including the captain is rejected (Req 1.5)', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 2], // 2 others + captain = 3 total, below the minimum of 4
    ['Sunil', 'Meena'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('minimum is 4')));
});

test('bulk upload: roster row with fewer names than the declared count is caught', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 4],
    ['Sunil', 'Meena'], // only 2 names, but row 1 says 4
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('expected 4 player name(s)') && e.includes('found 2')));
});

test('bulk upload: duplicate team name across blocks is caught', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 3],
    ['Sunil', 'Meena', 'Kumar'],
    ['Aces', 'Deepak', '9123456780', 3],
    ['Farah', 'Gita', 'Hari'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('duplicate team name')));
});

test('generateLoginId: team name -> lowercase dash-separated slug', () => {
  assert.equal(generateLoginId('Chennai Tennis Club!'), 'chennai-tennis-club');
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
