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
 * Req 6.1 (played/wins/losses/sets/games), 6.3 (2-team tiebreak =
 * head-to-head), 6.4 (3+-team tiebreak = sets diff -> games diff,
 * residual ties share rank).
 *
 * Played/Won/Lost/Points all count individual RUBBERS, not ties — a
 * single completed tie always adds 3 to Played, split between the two
 * sides' Won/Lost by however many rubbers each took (3-0, 2-1, etc.),
 * and Points is just that same Won count (a rubber win is worth exactly
 * 1 point, so a team's points and rubbers-won total are always equal).
 * `winner` is only used for the head-to-head tiebreak below, not for
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

  // Build a head-to-head lookup for the 2-team tiebreak (Req 6.3)
  const h2hWinner = buildHeadToHeadMap(ties);

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    // tied on points: figure out how many teams share this points total
    const tiedGroupSize = rows.filter((r) => r.points === a.points).length;
    if (tiedGroupSize === 2) {
      const h2h = h2hWinner(a.teamId, b.teamId);
      if (h2h) return h2h === a.teamId ? -1 : 1;
    }
    if (b.setsDiff !== a.setsDiff) return b.setsDiff - a.setsDiff;
    if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
    return 0; // fully tied -> shared rank, assigned below
  });

  assignSharedRanks(rows, (a, b) =>
    a.points === b.points && a.setsDiff === b.setsDiff && a.gamesDiff === b.gamesDiff
  );

  return rows;
}

/**
 * Individual standings (Req 6.6, 6.8): ranked by wins -> sets diff ->
 * games diff, with residual ties sharing rank. Used both for a single
 * group's singles/doubles list (6.6) and the combined cross-group singles
 * leaderboard (6.8) — just pass the right slice of `records` for each.
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
  }));

  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.setsDiff !== a.setsDiff) return b.setsDiff - a.setsDiff;
    if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
    return 0;
  });

  assignSharedRanks(rows, (a, b) =>
    a.wins === b.wins && a.setsDiff === b.setsDiff && a.gamesDiff === b.gamesDiff
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
