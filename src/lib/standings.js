// src/lib/standings.js
//
// Standings & rankings (Req 6.1–6.12). Pure functions computing team and
// individual standings from raw completed-rubber facts, so a correction
// made during the 7-day edit window (Req 5.7) is reflected the next time
// these are called — no cached/stored standings anywhere (see v6 Design
// Summary: "computed at query time from the rubbers table").

/**
 * @typedef {object} TieRecord
 * @property {string} homeTeamId
 * @property {string} awayTeamId
 * @property {'home'|'away'} winner
 * @property {number} homeRubbersWon - out of 3; the away side's is assumed 3 - this
 * @property {number} homeSetsWon
 * @property {number} homeSetsLost
 * @property {number} homeGamesWon
 * @property {number} homeGamesLost
 */

/**
 * Compute team standings for one group from its completed ties.
 * Req 6.1 (played/wins/losses/sets/games) plus the published Tie-Break
 * Rules for League Standings, applied in order to each group of teams
 * level on points:
 *   1. Exactly 2 tied -> head-to-head result between them decides it.
 *   2. 3+ tied -> a "mini-league" using only the matches played among
 *      those tied teams: whoever won the most rubbers in just those
 *      matches ranks higher (same Points definition, just scoped to the
 *      subset). This can fully order the group, or leave smaller
 *      sub-groups still level — each sub-group is resolved the same way
 *      recursively (a sub-pair falls to head-to-head, a sub-trio-plus
 *      gets its own even-narrower mini-league).
 *   3. If exactly 2 remain level after the mini-league, their direct
 *      head-to-head result (not restricted to the mini-league) decides.
 *   4. Anything still level after that falls back to sets diff, then
 *      games diff (not part of the published rules, but the simplest
 *      stand-in for a real "draw/lot", which software can't perform).
 *      Teams that reach this and are STILL level even on sets/games
 *      share the same rank — an actual draw decides the real order.
 *
 * Played/Won/Lost/Points all count individual RUBBERS, not ties — a
 * single completed tie always adds 3 to Played, split between the two
 * sides' Won/Lost by however many rubbers each took (3-0, 2-1, etc.),
 * and Points is just that same Won count (a rubber win is worth exactly
 * 1 point, so a team's points and rubbers-won total are always equal).
 * `winner` is only used for the head-to-head tiebreak, not for
 * Won/Lost/Points directly.
 *
 * @param {string[]} teamIds - all teams in the group (incl. those with 0 played)
 * @param {TieRecord[]} ties
 * @returns {{teamId:string, played:number, wins:number, losses:number,
 *   points:number, setsWon:number, setsLost:number, gamesWon:number,
 *   gamesLost:number, setsDiff:number, gamesDiff:number, rank:number}[]}
 *   sorted by rank ascending; tied teams share the same rank number.
 */
export function computeTeamStandings(teamIds, ties) {
  const base = new Map(
    teamIds.map((id) => [id, {
      teamId: id, played: 0, wins: 0, losses: 0,
      setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0,
    }])
  );

  for (const t of ties) {
    const home = base.get(t.homeTeamId);
    const away = base.get(t.awayTeamId);
    if (!home || !away) continue; // ignore ties referencing unknown teams

    const homeRubbersLost = 3 - t.homeRubbersWon;
    home.played += 3; away.played += 3;
    home.wins += t.homeRubbersWon; home.losses += homeRubbersLost;
    away.wins += homeRubbersLost; away.losses += t.homeRubbersWon;

    home.setsWon += t.homeSetsWon; home.setsLost += t.homeSetsLost;
    away.setsWon += t.homeSetsLost; away.setsLost += t.homeSetsWon;
    home.gamesWon += t.homeGamesWon; home.gamesLost += t.homeGamesLost;
    away.gamesWon += t.homeGamesLost; away.gamesLost += t.homeGamesWon;
  }

  const rows = [...base.values()].map((r) => ({
    ...r,
    points: r.wins, // rubber wins and points are the same number by definition
    setsDiff: r.setsWon - r.setsLost,
    gamesDiff: r.gamesWon - r.gamesLost,
  }));

  const h2hWinner = buildHeadToHeadMap(ties);

  // Group by points, highest first; resolve each group's internal order
  // via the tie-break cascade, then concatenate.
  const byPoints = new Map();
  for (const r of rows) {
    if (!byPoints.has(r.points)) byPoints.set(r.points, []);
    byPoints.get(r.points).push(r);
  }
  const pointsDesc = [...byPoints.keys()].sort((a, b) => b - a);

  const ordered = [];
  for (const points of pointsDesc) {
    const resolved = resolveTieGroup(byPoints.get(points), ties, h2hWinner);
    resolved[resolved.length - 1]._tiedWithNext = false; // a different points total is always a hard break
    ordered.push(...resolved);
  }

  let rank = 1;
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0 && !ordered[i - 1]._tiedWithNext) rank = i + 1;
    ordered[i].rank = rank;
  }
  for (const r of ordered) delete r._tiedWithNext;

  return ordered;
}

/**
 * Resolves one group of teams level on points into a final order, per
 * the cascade documented on computeTeamStandings. Returns the group
 * re-ordered, each row tagged with an internal `_tiedWithNext` flag
 * (true = genuinely still level with the next row — e.g. an unresolved
 * Step 4 "draw/lot" case — false = a real, decided gap).
 */
function resolveTieGroup(group, ties, h2hWinner) {
  if (group.length === 1) {
    return [{ ...group[0], _tiedWithNext: false }];
  }
  if (group.length === 2) {
    return resolvePairByHeadToHead(group[0], group[1], h2hWinner);
  }

  // 3+ tied: a mini-league using only matches played among this group.
  const groupIds = new Set(group.map((r) => r.teamId));
  const miniPoints = new Map(group.map((r) => [r.teamId, 0]));
  for (const t of ties) {
    if (!groupIds.has(t.homeTeamId) || !groupIds.has(t.awayTeamId)) continue;
    miniPoints.set(t.homeTeamId, miniPoints.get(t.homeTeamId) + t.homeRubbersWon);
    miniPoints.set(t.awayTeamId, miniPoints.get(t.awayTeamId) + (3 - t.homeRubbersWon));
  }
  const withMini = group.map((r) => ({ ...r, _miniPoints: miniPoints.get(r.teamId) }));

  const byMini = new Map();
  for (const r of withMini) {
    if (!byMini.has(r._miniPoints)) byMini.set(r._miniPoints, []);
    byMini.get(r._miniPoints).push(r);
  }
  const miniDesc = [...byMini.keys()].sort((a, b) => b - a);

  const resolved = [];
  for (const miniValue of miniDesc) {
    const subgroup = byMini.get(miniValue).map(({ _miniPoints, ...r }) => r);
    const resolvedSub = subgroup.length <= 2
      ? resolveTieGroup(subgroup, ties, h2hWinner) // singleton, or exactly 2 -> head-to-head (Step 3)
      : resolveBySetsGames(subgroup); // mini-league still didn't separate 3+ -> Step 4's fallback
    resolvedSub[resolvedSub.length - 1]._tiedWithNext = false; // different mini-league points -> always a hard break
    resolved.push(...resolvedSub);
  }
  return resolved;
}

/** Exactly 2 teams level on points: head-to-head decides (Step 1/3). No head-to-head on record (shouldn't normally happen) falls back to sets/games. */
function resolvePairByHeadToHead(a, b, h2hWinner) {
  const winnerId = h2hWinner(a.teamId, b.teamId);
  if (!winnerId) return resolveBySetsGames([a, b]);
  const [first, second] = winnerId === a.teamId ? [a, b] : [b, a];
  return [{ ...first, _tiedWithNext: false }, { ...second, _tiedWithNext: false }];
}

/** Final fallback (Step 4, before an actual draw/lot): sets diff, then games diff. Still-equal rows share rank. */
function resolveBySetsGames(group) {
  const sorted = [...group].sort((a, b) => (b.setsDiff - a.setsDiff) || (b.gamesDiff - a.gamesDiff));
  return sorted.map((r, i) => {
    const next = sorted[i + 1];
    const stillTied = !!next && r.setsDiff === next.setsDiff && r.gamesDiff === next.gamesDiff;
    return { ...r, _tiedWithNext: stillTied };
  });
}

/**
 * Individual standings (Req 6.6, 6.8): ranked by wins -> sets diff ->
 * games diff -> rubbers played, with residual ties sharing rank. Used
 * both for a single group's singles/doubles list (6.6) and the combined
 * cross-group singles leaderboard (6.8) — just pass the right slice of
 * `records` for each.
 *
 * The final "played" level means a player with more rubbers played
 * outranks one with fewer, even if the one with fewer has a better
 * win/loss record — e.g. 3 played/3 won ranks below 7 played/3 won/4
 * lost once wins, sets diff and games diff all come out equal, since
 * the one who played more is considered the more active/tested player.
 *
 * @param {{playerId:string, wins:number, losses:number, setsWon:number,
 *   setsLost:number, gamesWon:number, gamesLost:number}[]} records
 *   one row per player, already aggregated by the caller from rubbers
 *   (doubles credits each individual player, not the pair — Req 6.6)
 */
export function computeIndividualStandings(records) {
  const rows = records.map((r) => ({
    ...r,
    setsDiff: r.setsWon - r.setsLost,
    gamesDiff: r.gamesWon - r.gamesLost,
    played: r.wins + r.losses,
  }));

  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.setsDiff !== a.setsDiff) return b.setsDiff - a.setsDiff;
    if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
    if (b.played !== a.played) return b.played - a.played;
    return 0;
  });

  assignSharedRanks(rows, (a, b) =>
    a.wins === b.wins && a.setsDiff === b.setsDiff && a.gamesDiff === b.gamesDiff && a.played === b.played
  );

  return rows;
}

/** Build a (teamA, teamB) -> winningTeamId lookup from tie records, for the 2-team tiebreak. */
function buildHeadToHeadMap(ties) {
  const map = new Map();
  for (const t of ties) {
    const key = [t.homeTeamId, t.awayTeamId].sort().join('::');
    const winnerId = t.winner === 'home' ? t.homeTeamId : t.awayTeamId;
    map.set(key, winnerId);
  }
  return (a, b) => map.get([a, b].sort().join('::')) ?? null;
}

/**
 * Mutates `sortedRows` in place, adding a `rank` field. Rows already
 * sorted best-first; `isTiedWithPrev(a,b)` decides whether two adjacent
 * rows share a rank (Req 6.4/6.6/6.8: residual ties after every
 * tiebreak level share the same rank/position).
 */
function assignSharedRanks(sortedRows, isTiedWithPrev) {
  let rank = 1;
  for (let i = 0; i < sortedRows.length; i++) {
    if (i > 0 && !isTiedWithPrev(sortedRows[i], sortedRows[i - 1])) {
      rank = i + 1; // standard competition ranking (1,1,3,4,...)
    }
    sortedRows[i].rank = rank;
  }
}

/** Req 6.5/6.7: which ranks get which highlight color. Top 2 / bottom 2. */
export function highlightBands(rankedRows, totalTeams = rankedRows.length) {
  return rankedRows.map((row) => ({
    ...row,
    highlight:
      row.rank <= 2 ? 'top' :
      row.rank > totalTeams - 2 ? 'bottom' :
      null,
  }));
}
