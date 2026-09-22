// src/lib/scheduler.js
//
// Fixture scheduling engine (Req 4.1–4.12).
// Pure functions — no I/O — so they're trivially unit-testable and can be
// called from either the client (preview before release) or an edge
// function (actual generation).

/**
 * Generate a single round-robin schedule for a group of teams using the
 * standard "circle method": fix one team, rotate the rest.
 * Handles an odd team count by inserting a placeholder "BYE" team, which
 * naturally gives one real team a bye each round (Req 4.5).
 *
 * @param {string[]} teamIds
 * @returns {{round: number, pairs: [string, string][], bye: string|null}[]}
 *   pairs are [teamA, teamB] with NO home/away decided yet — that's a
 *   separate step (assignHomeAway) so scheduling and fairness can be
 *   reasoned about independently. bye is the resting team's id for that
 *   round (Req 4.5), or null when the team count is even.
 */
export function generateRoundRobin(teamIds) {
  if (teamIds.length < 2) {
    throw new Error('Need at least 2 teams to schedule a round robin');
  }

  const BYE = null;
  const ids = [...teamIds];
  if (ids.length % 2 !== 0) ids.push(BYE); // odd count -> add a bye slot

  const n = ids.length;
  const numRounds = n - 1;
  const half = n / 2;

  // Circle method: index 0 stays fixed, the rest rotate clockwise each round.
  const rotating = ids.slice(1);
  const rounds = [];

  for (let round = 0; round < numRounds; round++) {
    const roundTeams = [ids[0], ...rotating];
    const pairs = [];
    let bye = null;
    for (let i = 0; i < half; i++) {
      const a = roundTeams[i];
      const b = roundTeams[n - 1 - i];
      if (a === BYE || b === BYE) { bye = a === BYE ? b : a; continue; } // the bye team sits this round out
      pairs.push([a, b]);
    }
    rounds.push({ round: round + 1, pairs, bye });

    // rotate: keep first fixed, rotate the remaining n-1 elements by one
    rotating.unshift(rotating.pop());
  }

  return rounds;
}

/**
 * Assign home/away for a round-robin's pairs, respecting:
 *   - Req 4.9: if two teams played last season, home/away auto-swaps
 *     from whoever hosted last time.
 *   - Req 4.10: otherwise assign randomly, subject to...
 *   - Req 4.6: each team's home vs away count differs by at most 1
 *     across the season.
 *
 * @param {{round:number, pairs:[string,string][], bye?:string|null}[]} rounds
 * @param {Map<string,string>} priorMeetingHomeTeam
 *   Map keyed by a stable pair-key (see pairKey) -> the team ID that was
 *   HOME last time these two teams met (any division), if they met.
 * @param {() => number} [rng] - injectable RNG for deterministic tests
 * @returns {{round:number, ties:{home:string, away:string, swapped:boolean}[], bye:string|null}[]}
 */
export function assignHomeAway(rounds, priorMeetingHomeTeam = new Map(), rng = Math.random) {
  const homeCount = new Map();
  const awayCount = new Map();
  const bump = (map, id) => map.set(id, (map.get(id) || 0) + 1);

  const result = rounds.map(({ round, pairs, bye = null }) => {
    const ties = pairs.map(([a, b]) => {
      const key = pairKey(a, b);
      const priorHome = priorMeetingHomeTeam.get(key);

      let home, away, swapped = false;
      if (priorHome) {
        // swap: whoever was NOT home last time is home now
        home = priorHome === a ? b : a;
        away = priorHome === a ? a : b;
        swapped = true;
      } else {
        // random assignment, tie-broken toward whichever team currently
        // has fewer home games, to help the fairness constraint (4.6)
        const aHome = homeCount.get(a) || 0;
        const bHome = homeCount.get(b) || 0;
        if (aHome < bHome) {
          home = a; away = b;
        } else if (bHome < aHome) {
          home = b; away = a;
        } else {
          [home, away] = rng() < 0.5 ? [a, b] : [b, a];
        }
      }

      bump(homeCount, home);
      bump(awayCount, away);
      return { home, away, swapped };
    });
    return { round, ties, bye };
  });

  return result;
}

/** Stable, order-independent key for a pair of team IDs. */
export function pairKey(a, b) {
  return [a, b].sort().join('::');
}

/**
 * Check the fairness constraint (Req 4.6, verified via 4.12): every
 * team's |home - away| <= 1 across the season.
 * @returns {{teamId:string, home:number, away:number, balanced:boolean}[]}
 */
export function homeAwayBalanceReport(scheduledRounds) {
  const home = new Map();
  const away = new Map();
  for (const { ties } of scheduledRounds) {
    for (const { home: h, away: a } of ties) {
      home.set(h, (home.get(h) || 0) + 1);
      away.set(a, (away.get(a) || 0) + 1);
    }
  }
  const teamIds = new Set([...home.keys(), ...away.keys()]);
  return [...teamIds].map((teamId) => {
    const h = home.get(teamId) || 0;
    const a = away.get(teamId) || 0;
    return { teamId, home: h, away: a, balanced: Math.abs(h - a) <= 1 };
  });
}

/**
 * Convenience: build the priorMeetingHomeTeam map from last season's
 * completed fixtures (any division — Req 4.9 applies "regardless of
 * which group that was in").
 * @param {{home_team_id:string, away_team_id:string}[]} lastSeasonFixtures
 */
export function buildPriorMeetingMap(lastSeasonFixtures) {
  const map = new Map();
  for (const f of lastSeasonFixtures) {
    if (!f.home_team_id || !f.away_team_id) continue;
    map.set(pairKey(f.home_team_id, f.away_team_id), f.home_team_id);
  }
  return map;
}
