// src/pages/admin/GroupingPage.jsx
//
// Req 3.5.5 — one screen to take a season from "teams uploaded" to "ready
// for fixtures": a board of the unassigned-teams pool plus one column per
// division (divisions.order_index ranks them highest-first — see
// DivisionsPage — NOT alphabetical), manual move/remove per team,
// auto-grouping of whatever's left unassigned via a seeded random draw
// (see grouping.js), and a "Generate Fixtures" action per division once a
// tournament start date is set. Every action writes straight to Supabase
// (no local-only draft state) so the admin can leave and come back to
// exactly where they left off.
//
// Fixture generation lives here (not on the Fixtures page, which is a
// read-only viewer — see FixtureGenerationPage.jsx) because a division is
// "ready" the moment its grouping is settled; there's no separate preview
// step since assignHomeAway (scheduler.js) now guarantees the Req 4.6
// home/away balance algorithmically instead of needing a manual swap-to-
// fix-imbalance pass.

import { useEffect, useState, useCallback } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { planAutoGroup } from '../../lib/grouping.js';
import { buildFixtureRows, buildPriorMeetingMap } from '../../lib/scheduler.js';

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

export default function GroupingPage({ seasonId }) {
  const { divisions, refreshDivisions, activeSeason, refresh: refreshSeasons } = useSeason();

  const [teamSeasons, setTeamSeasons] = useState([]);
  const [divisionsWithFixtures, setDivisionsWithFixtures] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [groupSize, setGroupSize] = useState(4);
  const [seed, setSeed] = useState(randomSeed);
  const [startDateDraft, setStartDateDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: teamSeasonRows, error }, { data: fixtureRows }] = await Promise.all([
      supabase
        .from('team_seasons')
        .select('id, division_id, teams(id, name)')
        .eq('season_id', seasonId)
        .order('created_at', { ascending: true }),
      supabase.from('fixtures').select('division_id').eq('season_id', seasonId),
    ]);
    if (error) { alert(error.message); setLoading(false); return; }
    setTeamSeasons(teamSeasonRows || []);
    setDivisionsWithFixtures(new Set((fixtureRows || []).map((f) => f.division_id)));
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setStartDateDraft(activeSeason?.start_weekend || ''); }, [activeSeason?.start_weekend]);

  async function assignDivision(teamSeasonId, divisionId) {
    const { error } = await supabase.from('team_seasons').update({ division_id: divisionId || null }).eq('id', teamSeasonId);
    if (error) { alert(error.message); return; }
    load();
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
    // higher division to allocate").
    const divisionsWithCounts = divisions.map((d) => ({
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
      `highest division down first${plan.newGroups.length > 0 ? `, creating ${plan.newGroups.length} new division(s) for the rest` : ''}?`
    )) return;

    for (const { divisionId, teamIds } of plan.assignments) {
      const { error } = await supabase.from('team_seasons').update({ division_id: divisionId }).in('id', teamIds);
      if (error) { alert(error.message); return; }
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
    // once all existing divisions (highest down) are already full.
    let nextOrderIndex = divisions.length > 0 ? Math.max(...divisions.map((d) => d.order_index)) + 1 : 0;

    for (const chunk of plan.newGroups) {
      const { data: newDivision, error: divErr } = await supabase
        .from('divisions')
        .insert({ season_id: seasonId, name: nextName(), order_index: nextOrderIndex })
        .select()
        .single();
      if (divErr) { alert(divErr.message); return; }
      nextOrderIndex++;

      const { error: assignErr } = await supabase
        .from('team_seasons')
        .update({ division_id: newDivision.id })
        .in('id', chunk);
      if (assignErr) { alert(assignErr.message); return; }
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

  async function generateFixtures(division) {
    if (!activeSeason?.start_weekend) { alert('Set the tournament start date above first.'); return; }
    const teamIds = teamSeasons.filter((ts) => ts.division_id === division.id).map((ts) => ts.teams.id);
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
        Move teams into divisions — manually, or auto-generate groups for whatever's left unassigned. Every
        change saves immediately, so you can come back and pick up where you left off.
      </p>

      <div className="border rounded p-4 mb-6 bg-gray-50">
        <h2 className="font-medium mb-2">Auto-generate groups</h2>
        <p className="text-sm text-gray-600 mb-2">
          Randomly draws the {unassigned.length} unassigned team(s) into groups of this size, filling the
          highest division's remaining spots first and working down, before creating any new (lower-ranked)
          division for what's left — the last group may have fewer.
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

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${divisions.length + 1}, minmax(220px, 1fr))` }}>
        <GroupColumn
          title="Unassigned pool"
          teams={unassigned}
          divisions={divisions}
          onMove={assignDivision}
        />
        {divisions.map((d) => (
          <GroupColumn
            key={d.id}
            title={d.name}
            teams={teamSeasons.filter((ts) => ts.division_id === d.id)}
            divisions={divisions}
            currentDivisionId={d.id}
            onMove={assignDivision}
            hasFixtures={divisionsWithFixtures.has(d.id)}
            onGenerateFixtures={() => generateFixtures(d)}
          />
        ))}
      </div>
    </div>
  );
}

function GroupColumn({ title, teams, divisions, currentDivisionId, onMove, hasFixtures, onGenerateFixtures }) {
  return (
    <div className="border rounded overflow-hidden">
      <div className="bg-gray-100 px-3 py-2 flex items-center justify-between">
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs text-gray-500">{teams.length}</span>
      </div>
      {onGenerateFixtures && (
        hasFixtures ? (
          <p className="w-full text-xs text-gray-500 text-center py-1 border-b bg-gray-50">Fixtures generated ✓</p>
        ) : (
          <button onClick={onGenerateFixtures} className="w-full text-xs text-teal-700 underline py-1 border-b">
            Generate Fixtures
          </button>
        )
      )}
      <div className="divide-y">
        {teams.length === 0 && <p className="p-2 text-xs text-gray-400">No teams</p>}
        {teams.map((ts) => (
          <div key={ts.id} className="p-2 text-sm flex items-center justify-between gap-2">
            <p className="font-medium truncate min-w-0">{ts.teams?.name}</p>
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
