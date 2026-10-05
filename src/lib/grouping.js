// src/lib/grouping.js
//
// Pure logic for the Grouping admin screen's auto-generate feature — kept
// separate from Supabase/DOM so it's unit-testable with plain Node (same
// pattern as scheduler.js's assignHomeAway, which also takes an injectable
// source of randomness for deterministic tests).

/** Deterministic PRNG (mulberry32) — same seed always produces the same sequence. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle, seeded so the same seed always produces the same order. */
export function seededShuffle(items, seed) {
  const rng = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Plans how to distribute a pool of unassigned team_season ids into
 * divisions. Always fills from the highest division down (divisions[0] is
 * the highest): each existing division's remaining capacity
 * (groupSize - currentCount) is topped up, in order, before any new
 * division is planned. Whatever's left after every existing division is
 * full is chunked into brand-new groups of groupSize (the last one may be
 * smaller).
 *
 * When avoidSameClub is set, each slot prefers the first still-queued team
 * whose club isn't already present in that division/group — but if every
 * remaining team's club is already represented there (e.g. more teams from
 * one club than there are divisions to spread them across), it falls back
 * to just taking the next one in the shuffle; the constraint is a
 * best-effort preference, never a reason to leave a team unassigned.
 *
 * @param {object} opts
 * @param {string[]} opts.poolIds - unassigned team_season ids
 * @param {{id: string, currentCount: number, existingClubIds?: (string|null)[]}[]} opts.divisions - existing divisions, highest first
 * @param {number} opts.groupSize - target team count per division
 * @param {number} opts.seed - random seed for the shuffle
 * @param {boolean} [opts.avoidSameClub] - prefer spreading same-club teams across divisions
 * @param {Record<string, string|null>} [opts.clubIdByTeamId] - each pool team's club, for avoidSameClub
 * @returns {{
 *   assignments: {divisionId: string, teamIds: string[]}[],
 *   newGroups: string[][],
 * }}
 */
export function planAutoGroup({ poolIds, divisions, groupSize, seed, avoidSameClub = false, clubIdByTeamId = {} }) {
  const queue = seededShuffle(poolIds, seed);

  // Pulls one team out of the queue for a group that already contains
  // usedClubs. Prefers a team whose club isn't in usedClubs yet; falls
  // back to the front of the queue if no such team is left.
  function takeOne(usedClubs) {
    if (avoidSameClub) {
      for (let i = 0; i < queue.length; i++) {
        const clubId = clubIdByTeamId[queue[i]] ?? null;
        if (clubId == null || !usedClubs.has(clubId)) {
          const [teamId] = queue.splice(i, 1);
          if (clubId != null) usedClubs.add(clubId);
          return teamId;
        }
      }
    }
    const teamId = queue.shift();
    const clubId = clubIdByTeamId[teamId] ?? null;
    if (clubId != null) usedClubs.add(clubId);
    return teamId;
  }

  const assignments = [];
  for (const division of divisions) {
    if (queue.length === 0) break;
    const capacity = Math.max(0, groupSize - division.currentCount);
    if (capacity === 0) continue;
    const usedClubs = new Set(division.existingClubIds ?? []);
    const teamIds = [];
    for (let n = 0; n < capacity && queue.length > 0; n++) teamIds.push(takeOne(usedClubs));
    if (teamIds.length > 0) assignments.push({ divisionId: division.id, teamIds });
  }

  const newGroups = [];
  while (queue.length > 0) {
    const usedClubs = new Set();
    const chunk = [];
    for (let n = 0; n < groupSize && queue.length > 0; n++) chunk.push(takeOne(usedClubs));
    newGroups.push(chunk);
  }

  return { assignments, newGroups };
}
