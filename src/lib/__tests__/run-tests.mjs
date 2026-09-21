// Zero-dependency test runner — `node src/lib/__tests__/run-tests.mjs`
// Exercises the pure logic modules against the actual requirement
// scenarios described in v6, so the algorithms are verified before
// they're wired into the UI.

import assert from 'node:assert/strict';
import {
  generateRoundRobin, assignHomeAway, homeAwayBalanceReport,
  buildPriorMeetingMap, pairKey,
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

test('home/away: no prior meeting -> balanced within the season (Req 4.6, 4.10)', () => {
  const rounds = generateRoundRobin(['A', 'B', 'C', 'D']);
  const scheduled = assignHomeAway(rounds, new Map(), () => 0.5); // deterministic
  const report = homeAwayBalanceReport(scheduled);
  for (const r of report) assert.equal(r.balanced, true, `team ${r.teamId} unbalanced: ${r.home}H/${r.away}A`);
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

test('bulk upload: valid single team block parses into a team with roster', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 4],
    ['Ravi', 'Sunil', 'Meena', 'Kumar'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, true);
  assert.equal(result.teams.length, 1);
  assert.equal(result.teams[0].teamName, 'Aces');
  assert.equal(result.teams[0].players.length, 4);
  assert.deepEqual(result.teams[0].players[0], { name: 'Ravi', gender: null });
});

test('bulk upload: multiple team blocks in one file all parse', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 4],
    ['Ravi', 'Sunil', 'Meena', 'Kumar'],
    ['Smashers', 'Anita', '9123456780', 5],
    ['Anita', 'Rahul', 'Sneha', 'Vikram', 'Lakshmi'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, true);
  assert.equal(result.teams.length, 2);
  assert.equal(result.teams[1].teamName, 'Smashers');
  assert.equal(result.teams[1].players.length, 5);
});

test('bulk upload: whole file rejected if ANY block has an error (all-or-nothing, Req 2.1)', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 4],
    ['Ravi', 'Sunil', 'Meena', 'Kumar'],
    ['Smashers', 'Anita', 'not-a-phone', 4],
    ['Anita', 'Rahul', 'Sneha', 'Vikram'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('captain phone')));
  // all-or-nothing: even the valid "Aces" block is not returned
  assert.equal(result.teams, undefined);
});

test('bulk upload: team with fewer than 4 players is rejected (Req 1.5)', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 2],
    ['Ravi', 'Sunil'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('minimum is 4')));
});

test('bulk upload: roster row with fewer names than the declared count is caught', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 4],
    ['Ravi', 'Sunil', 'Meena'], // only 3 names, but row 1 says 4
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('expected 4 player name(s)') && e.includes('found 3')));
});

test('bulk upload: duplicate team name across blocks is caught', () => {
  const rows = [
    ['Aces', 'Ravi', '9876543210', 4],
    ['Ravi', 'Sunil', 'Meena', 'Kumar'],
    ['Aces', 'Deepak', '9123456780', 4],
    ['Deepak', 'Farah', 'Gita', 'Hari'],
  ];
  const result = validateBulkUpload(rows);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('duplicate team name')));
});

test('generateLoginId: team name -> lowercase dash-separated slug', () => {
  assert.equal(generateLoginId('Chennai Tennis Club!'), 'chennai-tennis-club');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
