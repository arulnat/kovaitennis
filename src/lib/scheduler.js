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
 *   - Req 4.6: each team's home vs away count differs by at most 1
 *     across the season — GUARANTEED whenever there are no Req 4.9
 *     constraints (the overwhelmingly common case — a brand new season,
 *     or a division not repeating last season's exact pairings), via an
 *     Eulerian-circuit orientation (see below) rather than a running
 *     greedy pick, which a stress test showed violates the ≤1 constraint
 *     35-90% of the time for odd team counts. With Req 4.9 constraints
 *     present, a repair pass (also below) resolves the vast majority of
 *     cases too; only pathologically high rates of forced rematches
 *     (rare in practice — it needs the same teams to keep meeting inside
 *     the same division season after season) can leave a team over by
 *     more than 1. A forced swap itself is never violated, ever.
 *
 * How the balance is actually achieved: home/away for a fixed set of
 * pairings doesn't depend on which round each pairing falls in — it's
 * just "does an edge in the round-robin's complete graph point from A to
 * B, or B to A". Orienting a graph's edges so every vertex's out-degree
 * and in-degree differ by at most 1 is a classic result: add a virtual
 * "hub" vertex connected to every odd-degree vertex (there's always an
 * even number of them), which makes every degree even; an Eulerian
 * circuit then exists, and orienting edges along that circuit gives each
 * real vertex out-degree == in-degree (or off by exactly 1, from the one
 * dropped hub edge, when the team count is even and each team plays an
 * odd number of games). Req 4.9-forced pairs are pre-oriented and
 * excluded from this construction (their bias may knock the totals for
 * the two teams involved out of range), so a follow-up repair pass walks
 * alternating directed paths through the *unforced* edges — cascading
 * the excess from an over-home team to an under-home team by flipping
 * every edge along the path — until nothing's left to fix or no more
 * paths can be found (unaffected teams net to zero, since each hop's
 * gain and loss cancel).
 *
 * @param {{round:number, pairs:[string,string][], bye?:string|null}[]} rounds
 * @param {Map<string,string>} priorMeetingHomeTeam
 *   Map keyed by a stable pair-key (see pairKey) -> the team ID that was
 *   HOME last time these two teams met (any division), if they met.
 * @returns {{round:number, ties:{home:string, away:string, swapped:boolean}[], bye:string|null}[]}
 */
export function assignHomeAway(rounds, priorMeetingHomeTeam = new Map()) {
  const located = [];
  const teamSet = new Set();
  for (const { pairs } of rounds) {
    for (const [a, b] of pairs) {
      located.push({ a, b });
      teamSet.add(a);
      teamSet.add(b);
    }
  }
  const vertices = [...teamSet];

  // Req 4.9: pre-orient any pair with a prior meeting; everyone else is
  // "unforced" and up for grabs by the balancing construction below.
  const forced = new Map(); // pairKey -> {home, away}
  for (const { a, b } of located) {
    const key = pairKey(a, b);
    if (forced.has(key)) continue;
    const priorHome = priorMeetingHomeTeam.get(key);
    if (priorHome) {
      const home = priorHome === a ? b : a; // whoever was NOT home last time hosts now
      const away = priorHome === a ? a : b;
      forced.set(key, { home, away });
    }
  }

  const diff = new Map(vertices.map((v) => [v, 0])); // running home-count minus away-count
  for (const { home, away } of forced.values()) {
    diff.set(home, diff.get(home) + 1);
    diff.set(away, diff.get(away) - 1);
  }

  const unforcedEdges = [];
  const seenUnforced = new Set();
  for (const { a, b } of located) {
    const key = pairKey(a, b);
    if (forced.has(key) || seenUnforced.has(key)) continue;
    seenUnforced.add(key);
    unforcedEdges.push({ a, b });
  }

  const orientation = balancedOrientation(vertices, unforcedEdges);
  const finalOrientation = new Map(forced);
  for (const { a, b } of unforcedEdges) {
    const key = pairKey(a, b);
    const { from: home, to: away } = orientation.get(key);
    finalOrientation.set(key, { home, away });
    diff.set(home, diff.get(home) + 1);
    diff.set(away, diff.get(away) - 1);
  }

  repairForcedBias(vertices, unforcedEdges, finalOrientation, diff);

  return rounds.map(({ round, pairs, bye = null }) => ({
    round,
    bye,
    ties: pairs.map(([a, b]) => {
      const key = pairKey(a, b);
      const { home, away } = finalOrientation.get(key);
      return { home, away, swapped: forced.has(key) };
    }),
  }));
}

/**
 * Orients `edges` (undirected {a,b} pairs) so every vertex's out-degree
 * and in-degree differ by at most 1, via a per-component Eulerian
 * circuit (odd-degree vertices get one edge to a shared virtual hub,
 * which is dropped from the result afterward — see assignHomeAway's
 * doc comment for why this works).
 * @returns {Map<string, {from:string, to:string}>} keyed by pairKey(a,b)
 */
function balancedOrientation(vertices, edges) {
  const orientation = new Map();
  let hubCounter = 0;

  for (const component of connectedComponents(vertices, edges)) {
    const componentVertices = new Set(component);
    const componentEdges = edges.filter((e) => componentVertices.has(e.a));
    if (componentEdges.length === 0) continue;

    const degree = new Map(component.map((v) => [v, 0]));
    for (const { a, b } of componentEdges) {
      degree.set(a, degree.get(a) + 1);
      degree.set(b, degree.get(b) + 1);
    }
    const oddVertices = component.filter((v) => degree.get(v) % 2 !== 0);

    let workingEdges = componentEdges;
    let workingVertices = component;
    let hub = null;
    if (oddVertices.length > 0) {
      hub = `__hub_${hubCounter++}__`;
      workingEdges = [...componentEdges, ...oddVertices.map((v) => ({ a: hub, b: v }))];
      workingVertices = [...component, hub];
    }

    const circuit = buildEulerCircuit(workingVertices, workingEdges);
    for (let i = 0; i < circuit.length - 1; i++) {
      const from = circuit[i];
      const to = circuit[i + 1];
      if (from === hub || to === hub) continue; // virtual edge — not a real game
      orientation.set(pairKey(from, to), { from, to });
    }
  }

  return orientation;
}

/** Groups vertices into connected components given a set of {a,b} edges. */
function connectedComponents(vertices, edges) {
  const parent = new Map(vertices.map((v) => [v, v]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  for (const { a, b } of edges) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map();
  for (const v of vertices) {
    const root = find(v);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(v);
  }
  return [...groups.values()];
}

/**
 * Hierholzer's algorithm: finds an Eulerian circuit through `edges`,
 * assuming the graph (or this connected component of it) has every
 * vertex at even degree. Returns the visited-vertex sequence; consecutive
 * pairs are the oriented edges.
 */
function buildEulerCircuit(vertices, edges) {
  const adjacency = new Map(vertices.map((v) => [v, []]));
  for (const e of edges) {
    const edge = { a: e.a, b: e.b, used: false };
    adjacency.get(e.a).push(edge);
    adjacency.get(e.b).push(edge);
  }

  const start = edges.length > 0 ? edges[0].a : vertices[0];
  const stack = [start];
  const circuit = [];

  while (stack.length > 0) {
    const v = stack[stack.length - 1];
    const list = adjacency.get(v);
    let nextEdge = null;
    while (list.length > 0) {
      const candidate = list.pop();
      if (candidate.used) continue;
      nextEdge = candidate;
      break;
    }
    if (nextEdge) {
      nextEdge.used = true;
      stack.push(nextEdge.a === v ? nextEdge.b : nextEdge.a);
    } else {
      circuit.push(stack.pop());
    }
  }

  return circuit.reverse();
}

/**
 * Fixes up any team left outside the ±1 window by forced (Req 4.9) edges,
 * by cascading the excess along a directed alternating path of unforced
 * edges to a team that can absorb it — see assignHomeAway's doc comment.
 * Mutates `orientation` and `diff` in place.
 */
function repairForcedBias(vertices, unforcedEdges, orientation, diff) {
  let guard = 0;
  const maxIterations = vertices.length * unforcedEdges.length + 10;

  while (guard++ < maxIterations) {
    const violator = vertices.find((v) => diff.get(v) > 1 || diff.get(v) < -1);
    if (!violator) return;
    if (!repairOnce(violator)) return; // no path found — leave as-is (rare, high-forced-rate edge case)
  }

  function repairOnce(violator) {
    const outAdjacency = new Map(vertices.map((v) => [v, []])); // home -> away
    const inAdjacency = new Map(vertices.map((v) => [v, []])); // away -> home
    for (const { a, b } of unforcedEdges) {
      const key = pairKey(a, b);
      const { home, away } = orientation.get(key);
      outAdjacency.get(home).push({ to: away, key });
      inAdjacency.get(away).push({ to: home, key });
    }

    const excessHome = diff.get(violator) > 1;
    const adjacency = excessHome ? outAdjacency : inAdjacency;
    const canAbsorb = (v) => (excessHome ? diff.get(v) <= -1 : diff.get(v) >= 1);

    const parent = new Map([[violator, null]]);
    const queue = [violator];
    let target = null;
    while (queue.length > 0) {
      const v = queue.shift();
      if (v !== violator && canAbsorb(v)) { target = v; break; }
      for (const { to, key } of adjacency.get(v)) {
        if (parent.has(to)) continue;
        parent.set(to, { from: v, key });
        queue.push(to);
      }
    }
    if (!target) return false;

    let cur = target;
    while (parent.get(cur)) {
      const { from, key } = parent.get(cur);
      const { home, away } = orientation.get(key);
      orientation.set(key, { home: away, away: home }); // flip
      diff.set(home, diff.get(home) - 2);
      diff.set(away, diff.get(away) + 2);
      cur = from;
    }
    return true;
  }
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

/**
 * Composes generateRoundRobin + assignHomeAway into ready-to-insert
 * `fixtures` table rows for one division, including a bye row per round
 * that has one (Req 4.5: home_team_id null, away_team_id the resting
 * team, is_bye true). Pure — no I/O — so the whole generate-a-division
 * pipeline is unit-testable without a database.
 *
 * @param {object} opts
 * @param {string} opts.seasonId
 * @param {string} opts.divisionId
 * @param {string[]} opts.teamIds
 * @param {string} opts.startWeekend - ISO date; round 1 is this week (Req 4.2)
 * @param {Map<string,string>} [opts.priorMeetingHomeTeam]
 * @param {string} [opts.releasedAt] - ISO timestamp, defaults to now
 * @returns {object[]} rows shaped for `fixtures` table insert
 */
export function buildFixtureRows({
  seasonId, divisionId, teamIds, startWeekend,
  priorMeetingHomeTeam = new Map(), releasedAt = new Date().toISOString(),
}) {
  const rounds = generateRoundRobin(teamIds);
  const scheduled = assignHomeAway(rounds, priorMeetingHomeTeam);

  const weekOf = (roundNumber) => {
    const d = new Date(startWeekend);
    d.setDate(d.getDate() + (roundNumber - 1) * 7); // Req 4.2 — 7-day intervals
    return d.toISOString().slice(0, 10);
  };

  return scheduled.flatMap(({ round, ties, bye }) => {
    const rows = ties.map(({ home, away }) => ({
      season_id: seasonId,
      division_id: divisionId,
      round_number: round,
      week_date: weekOf(round),
      home_team_id: home,
      away_team_id: away,
      is_bye: false,
      status: 'released',
      released_at: releasedAt,
    }));
    if (bye) {
      rows.push({
        season_id: seasonId,
        division_id: divisionId,
        round_number: round,
        week_date: weekOf(round),
        home_team_id: null,
        away_team_id: bye,
        is_bye: true,
        status: 'released',
        released_at: releasedAt,
      });
    }
    return rows;
  });
}
