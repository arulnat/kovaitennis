// src/pages/admin/GroupingPage.jsx
//
// Req 3.5.5 — one screen to take a season from "teams uploaded" to "ready
// for fixtures": a board of the unassigned-teams pool plus one column per
// division (divisions.order_index ranks divisions themselves highest-first
// — see DivisionsPage — NOT alphabetical), manual move/remove/rank per
// team, auto-grouping of whatever's left unassigned via a seeded random
// draw (see grouping.js), and a "Generate Fixtures" action per division
// once a tournament start date is set. Every action writes straight to
// Supabase (no local-only draft state) so the admin can leave and come
// back to exactly where they left off.
//
// Fixture generation lives here (not on the Fixtures page, which is a
// read-only viewer — see FixtureGenerationPage.jsx) because a division is
// "ready" the moment its grouping is settled; there's no separate preview
// step since assignHomeAway (scheduler.js) now guarantees the Req 4.6
// home/away balance algorithmically instead of needing a manual swap-to-
// fix-imbalance pass.
//
// Each division also has its own grouping_locked flag: once locked, its
// roster (which teams belong to it) and each team's order_index (rank
// within the division, e.g. for seeding) are frozen, and Generate
// Fixtures refuses to run — the intended flow is arrange teams, set
// ranking, generate fixtures, THEN lock to protect it all from further
// changes. Locking is always a manual toggle (never an automatic side
// effect of generating), consistent with every other lock in this app.
//
// Holiday weekends (season_holidays) are dates with no matches — set up
// front, or added later for a rain-out. Generate Fixtures always uses the
// current list (computeMatchWeekends, scheduler.js) to skip them.
// Whenever the list changes, every division that already has fixtures
// gets its week_dates recomputed from the same season start date and the
// new holiday list — round_number/pairings/scores are never touched,
// only which calendar weekend each round falls on shifts.

import { useEffect, useState, useCallback } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { planAutoGroup } from '../../lib/grouping.js';
import { buildFixtureRows, buildPriorMeetingMap, computeMatchWeekends } from '../../lib/scheduler.js';

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

export default function GroupingPage({ seasonId }) {
  const { divisions, refreshDivisions, activeSeason, refresh: refreshSeasons } = useSeason();

  const [teamSeasons, setTeamSeasons] = useState([]);
  const [divisionsWithFixtures, setDivisionsWithFixtures] = useState(new Set());
  const [holidays, setHolidays] = useState([]); // [{id, holiday_date}]
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [groupSize, setGroupSize] = useState(4);
  const [seed, setSeed] = useState(randomSeed);
  const [startDateDraft, setStartDateDraft] = useState('');
  const [selectedPoolIds, setSelectedPoolIds] = useState(new Set());
  const [poolMoveTarget, setPoolMoveTarget] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: teamSeasonRows, error }, { data: fixtureRows }, { data: holidayRows }] = await Promise.all([
      supabase
        .from('team_seasons')
        .select('id, division_id, order_index, teams(id, name)')
        .eq('season_id', seasonId)
        .order('order_index', { ascending: true }),
      supabase.from('fixtures').select('division_id').eq('season_id', seasonId),
      supabase.from('season_holidays').select('id, holiday_date').eq('season_id', seasonId).order('holiday_date'),
    ]);
    if (error) { alert(error.message); setLoading(false); return; }
    setTeamSeasons(teamSeasonRows || []);
    setDivisionsWithFixtures(new Set((fixtureRows || []).map((f) => f.division_id)));
    setHolidays(holidayRows || []);
    setSelectedPoolIds(new Set());
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setStartDateDraft(activeSeason?.start_weekend || ''); }, [activeSeason?.start_weekend]);

  const findDivision = (id) => divisions.find((d) => d.id === id) ?? null;

  async function assignDivision(teamSeasonId, newDivisionId) {
    const ts = teamSeasons.find((t) => t.id === teamSeasonId);
    const currentDivision = ts?.division_id ? findDivision(ts.division_id) : null;
    if (currentDivision?.grouping_locked) {
      alert(`"${currentDivision.name}" is locked. Unlock it first to move teams out of it.`);
      return;
    }

    const targetDivisionId = newDivisionId || null;
    const targetDivision = targetDivisionId ? findDivision(targetDivisionId) : null;
    if (targetDivision?.grouping_locked) {
      alert(`"${targetDivision.name}" is locked. Unlock it first to move teams into it.`);
      return;
    }

    // append at the end of the destination's current ranking
    const nextOrder = targetDivisionId ? teamSeasons.filter((t) => t.division_id === targetDivisionId).length : 0;
    const { error } = await supabase
      .from('team_seasons')
      .update({ division_id: targetDivisionId, order_index: nextOrder })
      .eq('id', teamSeasonId);
    if (error) { alert(error.message); return; }
    load();
  }

  function togglePoolSelect(teamSeasonId) {
    setSelectedPoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamSeasonId)) next.delete(teamSeasonId); else next.add(teamSeasonId);
      return next;
    });
  }

  async function moveSelectedPoolTeams() {
    if (selectedPoolIds.size === 0) { alert('Select at least one team from the unassigned pool first.'); return; }
    if (!poolMoveTarget) { alert('Choose a division to move them to.'); return; }

    const targetDivision = findDivision(poolMoveTarget);
    if (targetDivision?.grouping_locked) {
      alert(`"${targetDivision.name}" is locked. Unlock it first to move teams into it.`);
      return;
    }

    const targets = teamSeasons.filter((ts) => selectedPoolIds.has(ts.id));
    let nextOrder = teamSeasons.filter((t) => t.division_id === poolMoveTarget).length;
    for (const ts of targets) {
      const { error } = await supabase
        .from('team_seasons')
        .update({ division_id: poolMoveTarget, order_index: nextOrder })
        .eq('id', ts.id);
      if (error) { alert(error.message); return; }
      nextOrder++;
    }

    setPoolMoveTarget('');
    load();
  }

  async function moveTeamRank(teamSeasonId, direction) {
    const ts = teamSeasons.find((t) => t.id === teamSeasonId);
    if (!ts?.division_id) return;
    const division = findDivision(ts.division_id);
    if (division?.grouping_locked) {
      alert(`"${division.name}" is locked. Unlock it first to change team ranking.`);
      return;
    }

    const siblings = teamSeasons.filter((t) => t.division_id === ts.division_id).sort((a, b) => a.order_index - b.order_index);
    const index = siblings.findIndex((t) => t.id === teamSeasonId);
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= siblings.length) return;

    const a = siblings[index], b = siblings[otherIndex];
    const { error } = await supabase.from('team_seasons').update({ order_index: b.order_index }).eq('id', a.id);
    if (error) { alert(error.message); return; }
    const { error: error2 } = await supabase.from('team_seasons').update({ order_index: a.order_index }).eq('id', b.id);
    if (error2) { alert(error2.message); return; }
    load();
  }

  async function toggleGroupingLock(division) {
    const { error } = await supabase.from('divisions').update({ grouping_locked: !division.grouping_locked }).eq('id', division.id);
    if (error) { alert(error.message); return; }
    refreshDivisions();
  }

  async function autoGenerate() {
    const size = Number(groupSize);
    if (!Number.isInteger(size) || size < 1) { alert('Enter a positive whole number for teams per group.'); return; }

    const seedValue = Number(seed);
    if (!Number.isFinite(seedValue)) { alert('Enter a numeric random seed.'); return; }

    const pool = teamSeasons.filter((ts) => !ts.division_id);
    if (pool.length === 0) { alert('No unassigned teams to group.'); return; }

    // divisions is already ordered highest-first (order_index) — fill it
    // top-down before creating anything new (Req: "always start from
    // higher division to allocate"). Locked divisions are frozen, so
    // they're excluded entirely rather than topped up.
    const divisionsWithCounts = divisions
      .filter((d) => !d.grouping_locked)
      .map((d) => ({
        id: d.id,
        currentCount: teamSeasons.filter((ts) => ts.division_id === d.id).length,
      }));

    const plan = planAutoGroup({
      poolIds: pool.map((ts) => ts.id),
      divisions: divisionsWithCounts,
      groupSize: size,
      seed: seedValue,
    });

    if (!confirm(
      `Randomly draw ${pool.length} unassigned team(s) into groups of ${size} (seed ${seedValue}), filling the ` +
      `highest unlocked division down first${plan.newGroups.length > 0 ? `, creating ${plan.newGroups.length} new division(s) for the rest` : ''}?`
    )) return;

    for (const { divisionId, teamIds } of plan.assignments) {
      // append each drawn team after whatever's already ranked in that division
      const baseOrder = teamSeasons.filter((ts) => ts.division_id === divisionId).length;
      for (let i = 0; i < teamIds.length; i++) {
        const { error } = await supabase
          .from('team_seasons')
          .update({ division_id: divisionId, order_index: baseOrder + i })
          .eq('id', teamIds[i]);
        if (error) { alert(error.message); return; }
      }
    }

    const existingNames = new Set(divisions.map((d) => d.name));
    let letterIndex = 0;
    const nextName = () => {
      let name;
      do {
        const letter = String.fromCharCode(65 + (letterIndex % 26));
        const cycle = Math.floor(letterIndex / 26);
        name = `Division ${letter}${cycle > 0 ? cycle + 1 : ''}`;
        letterIndex++;
      } while (existingNames.has(name));
      existingNames.add(name);
      return name;
    };
    // New divisions rank below every existing one — they're only created
    // once all existing (unlocked) divisions are already full.
    let nextOrderIndex = divisions.length > 0 ? Math.max(...divisions.map((d) => d.order_index)) + 1 : 0;

    for (const chunk of plan.newGroups) {
      const { data: newDivision, error: divErr } = await supabase
        .from('divisions')
        .insert({ season_id: seasonId, name: nextName(), order_index: nextOrderIndex })
        .select()
        .single();
      if (divErr) { alert(divErr.message); return; }
      nextOrderIndex++;

      for (let i = 0; i < chunk.length; i++) {
        const { error: assignErr } = await supabase
          .from('team_seasons')
          .update({ division_id: newDivision.id, order_index: i })
          .eq('id', chunk[i]);
        if (assignErr) { alert(assignErr.message); return; }
      }
    }

    await Promise.all([load(), refreshDivisions()]);
    setSeed(randomSeed()); // fresh seed ready for the next draw
  }

  async function saveStartDate() {
    if (!startDateDraft) { alert('Pick a date first.'); return; }
    const { error } = await supabase.from('seasons').update({ start_weekend: startDateDraft }).eq('id', seasonId);
    if (error) { alert(error.message); return; }
    refreshSeasons();
  }

  /**
   * Recomputes week_date for every already-generated fixture in the
   * season from the current holiday list — round_number, pairings, and
   * scores are never touched, only which weekend each round falls on.
   * Safe to call after any holiday add/remove: a round already scheduled
   * before a later holiday it doesn't overlap keeps its date; only the
   * affected round onward shifts.
   */
  async function rescheduleAroundHolidays(holidayDates) {
    if (!activeSeason?.start_weekend) return;

    const { data: allFixtures, error } = await supabase
      .from('fixtures')
      .select('id, division_id, round_number, week_date')
      .eq('season_id', seasonId);
    if (error) { alert(error.message); return; }
    if (!allFixtures || allFixtures.length === 0) return;

    const byDivision = new Map();
    for (const f of allFixtures) {
      if (!byDivision.has(f.division_id)) byDivision.set(f.division_id, []);
      byDivision.get(f.division_id).push(f);
    }

    let updated = 0;
    for (const rows of byDivision.values()) {
      const numRounds = Math.max(...rows.map((r) => r.round_number));
      const weekends = computeMatchWeekends(activeSeason.start_weekend, numRounds, holidayDates);
      for (const r of rows) {
        const newDate = weekends[r.round_number - 1];
        if (newDate === r.week_date) continue;
        const { error: updateErr } = await supabase.from('fixtures').update({ week_date: newDate }).eq('id', r.id);
        if (updateErr) { alert(updateErr.message); return; }
        updated++;
      }
    }
    if (updated > 0) alert(`${updated} fixture date(s) rescheduled around the holiday change.`);
  }

  async function addHoliday() {
    if (!newHolidayDate) { alert('Pick a date first.'); return; }
    const { error } = await supabase.from('season_holidays').insert({ season_id: seasonId, holiday_date: newHolidayDate });
    if (error) { alert(error.message); return; }
    setNewHolidayDate('');
    const { data: holidayRows } = await supabase.from('season_holidays').select('id, holiday_date').eq('season_id', seasonId).order('holiday_date');
    setHolidays(holidayRows || []);
    await rescheduleAroundHolidays((holidayRows || []).map((h) => h.holiday_date));
  }

  async function removeHoliday(holiday) {
    if (!confirm(`Remove ${holiday.holiday_date} as a holiday? Already-generated fixtures will be rescheduled back accordingly.`)) return;
    const { error } = await supabase.from('season_holidays').delete().eq('id', holiday.id);
    if (error) { alert(error.message); return; }
    const remaining = holidays.filter((h) => h.id !== holiday.id);
    setHolidays(remaining);
    await rescheduleAroundHolidays(remaining.map((h) => h.holiday_date));
  }

  async function generateFixtures(division) {
    if (division.grouping_locked) { alert(`"${division.name}" is locked. Unlock it first to generate fixtures.`); return; }
    if (!activeSeason?.start_weekend) { alert('Set the tournament start date above first.'); return; }
    const teamIds = teamSeasons
      .filter((ts) => ts.division_id === division.id)
      .sort((a, b) => a.order_index - b.order_index)
      .map((ts) => ts.teams.id);
    if (teamIds.length < 2) { alert('This division needs at least 2 teams first.'); return; }
    if (divisionsWithFixtures.has(division.id)) { alert('Fixtures were already generated for this division.'); return; }

    if (!confirm(`Generate fixtures for "${division.name}" (${teamIds.length} teams)? Home/away is automatically balanced (Req 4.6).`)) return;

    // Req 4.9: pull last season's fixtures (any division) to detect
    // rematches and auto-swap home/away.
    const { data: priorFixtures } = await supabase
      .from('fixtures')
      .select('home_team_id, away_team_id')
      .in('home_team_id', teamIds)
      .in('away_team_id', teamIds); // simplified — production query should scope to "prior season" explicitly

    const rows = buildFixtureRows({
      seasonId,
      divisionId: division.id,
      teamIds,
      startWeekend: activeSeason.start_weekend,
      holidays: holidays.map((h) => h.holiday_date),
      priorMeetingHomeTeam: buildPriorMeetingMap(priorFixtures || []),
    });

    const { error } = await supabase.from('fixtures').insert(rows);
    if (error) { alert(error.message); return; }
    load();
  }

  const unassigned = teamSeasons.filter((ts) => !ts.division_id);

  if (loading) return <p className="p-6 text-gray-500">Loading…</p>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Grouping</h1>
      <p className="text-sm text-gray-600 mb-4">
        Move teams into divisions and rank them within it — manually, or auto-generate groups for whatever's
        left unassigned. Every change saves immediately, so you can come back and pick up where you left off.
      </p>

      <div className="border rounded p-4 mb-6 bg-gray-50">
        <h2 className="font-medium mb-2">Auto-generate groups</h2>
        <p className="text-sm text-gray-600 mb-2">
          Randomly draws the {unassigned.length} unassigned team(s) into groups of this size, filling the
          highest unlocked division's remaining spots first and working down, before creating any new
          (lower-ranked) division for what's left — the last group may have fewer.
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <label className="text-xs text-gray-600">
            Teams per group
            <input
              type="number"
              min="1"
              value={groupSize}
              onChange={(e) => setGroupSize(e.target.value)}
              className="border rounded px-2 py-1 text-sm w-20 ml-1"
            />
          </label>
          <label className="text-xs text-gray-600">
            Random seed
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="border rounded px-2 py-1 text-sm w-32 ml-1"
            />
          </label>
          <button
            onClick={() => setSeed(randomSeed())}
            title="Pick a new random seed"
            className="text-xs text-teal-700 underline"
          >
            New seed
          </button>
          <button
            onClick={autoGenerate}
            disabled={unassigned.length === 0}
            className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm disabled:opacity-50"
          >
            Auto-generate
          </button>
        </div>
      </div>

      <div className="border rounded p-4 mb-6 bg-gray-50">
        <h2 className="font-medium mb-2">Tournament start date</h2>
        <p className="text-sm text-gray-600 mb-2">
          Required before fixtures can be generated (rounds are scheduled 7 days apart from this date).
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={startDateDraft}
            onChange={(e) => setStartDateDraft(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <button onClick={saveStartDate} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm">
            Save date
          </button>
          {activeSeason?.start_weekend && (
            <span className="text-xs text-gray-500">Currently set to {activeSeason.start_weekend}</span>
          )}
        </div>
      </div>

      <div className="border rounded p-4 mb-6 bg-gray-50">
        <h2 className="font-medium mb-2">Holiday weekends</h2>
        <p className="text-sm text-gray-600 mb-2">
          No matches on these weekends — fixture generation skips them and moves that round (and everything
          after it) to the next weekend. Usually set up front, but can be added later too (e.g. a rain-out) —
          any division that already has fixtures gets its dates pushed automatically, with no change to
          pairings or scores.
        </p>
        {holidays.length > 0 && (
          <ul className="mb-2 space-y-1">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-sm">
                <span>{h.holiday_date}</span>
                <button onClick={() => removeHoliday(h)} className="text-red-600 text-xs underline">Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={newHolidayDate}
            onChange={(e) => setNewHolidayDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <button onClick={addHoliday} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm">
            Add holiday
          </button>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${divisions.length + 1}, minmax(220px, 1fr))` }}>
        <GroupColumn
          title="Unassigned pool"
          teams={unassigned}
          divisions={divisions}
          onMove={assignDivision}
          selectable
          selectedIds={selectedPoolIds}
          onToggleSelect={togglePoolSelect}
          bulkMoveTarget={poolMoveTarget}
          onBulkMoveTargetChange={setPoolMoveTarget}
          onBulkMove={moveSelectedPoolTeams}
        />
        {divisions.map((d) => (
          <GroupColumn
            key={d.id}
            title={d.name}
            teams={teamSeasons.filter((ts) => ts.division_id === d.id).sort((a, b) => a.order_index - b.order_index)}
            divisions={divisions}
            currentDivisionId={d.id}
            onMove={assignDivision}
            onMoveRank={moveTeamRank}
            locked={d.grouping_locked}
            onToggleLock={() => toggleGroupingLock(d)}
            hasFixtures={divisionsWithFixtures.has(d.id)}
            onGenerateFixtures={() => generateFixtures(d)}
          />
        ))}
      </div>
    </div>
  );
}

function GroupColumn({
  title, teams, divisions, currentDivisionId, onMove, onMoveRank,
  locked, onToggleLock, hasFixtures, onGenerateFixtures,
  selectable, selectedIds, onToggleSelect, bulkMoveTarget, onBulkMoveTargetChange, onBulkMove,
}) {
  const isDivision = currentDivisionId != null;

  return (
    <div className="border rounded overflow-hidden">
      <div className="bg-gray-100 px-3 py-2 flex items-center justify-between">
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs text-gray-500">{teams.length}</span>
      </div>

      {selectable && (
        <div className="flex items-center gap-1 px-2 py-1 border-b bg-gray-50">
          <select
            value={bulkMoveTarget}
            onChange={(e) => onBulkMoveTargetChange(e.target.value)}
            className="border rounded px-1 py-0.5 text-xs flex-1 min-w-0"
          >
            <option value="">Move {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'selected'} to…</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button
            onClick={onBulkMove}
            disabled={selectedIds.size === 0 || !bulkMoveTarget}
            className="text-xs text-teal-700 underline disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            Move
          </button>
        </div>
      )}

      {isDivision && (
        <div className="flex items-center justify-between gap-2 px-2 py-1 border-b bg-gray-50">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${locked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {locked ? 'Locked' : 'Unlocked'}
          </span>
          <button onClick={onToggleLock} className="text-xs text-teal-700 underline">
            {locked ? 'Unlock' : 'Lock'}
          </button>
        </div>
      )}

      {onGenerateFixtures && (
        hasFixtures ? (
          <p className="w-full text-xs text-gray-500 text-center py-1 border-b bg-gray-50">Fixtures generated ✓</p>
        ) : (
          <button
            onClick={onGenerateFixtures}
            disabled={locked}
            title={locked ? 'Unlock this division first' : undefined}
            className="w-full text-xs text-teal-700 underline py-1 border-b disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
          >
            Generate Fixtures
          </button>
        )
      )}

      <div className="divide-y">
        {teams.length === 0 && <p className="p-2 text-xs text-gray-400">No teams</p>}
        {teams.map((ts, i) => (
          <div key={ts.id} className="p-2 text-sm flex items-center gap-2">
            {selectable && (
              <input
                type="checkbox"
                checked={selectedIds.has(ts.id)}
                onChange={() => onToggleSelect(ts.id)}
                className="shrink-0"
              />
            )}
            {isDivision && (
              <div className="flex flex-col leading-none shrink-0">
                <button
                  onClick={() => onMoveRank(ts.id, -1)}
                  disabled={i === 0}
                  title="Move up (higher rank)"
                  className="text-[10px] text-gray-500 disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  ▲
                </button>
                <button
                  onClick={() => onMoveRank(ts.id, 1)}
                  disabled={i === teams.length - 1}
                  title="Move down (lower rank)"
                  className="text-[10px] text-gray-500 disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  ▼
                </button>
              </div>
            )}
            <p className="font-medium truncate min-w-0 flex-1">{ts.teams?.name}</p>
            <div className="flex items-center gap-1 shrink-0">
              <select
                value={currentDivisionId ?? ''}
                onChange={(e) => onMove(ts.id, e.target.value)}
                className="border rounded px-1 py-0.5 text-xs"
              >
                <option value="">Pool</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {currentDivisionId && (
                <button
                  onClick={() => onMove(ts.id, null)}
                  title="Remove from division — back to the unassigned pool"
                  className="text-red-600 text-xs"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
