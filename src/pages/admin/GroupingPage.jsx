// src/pages/admin/GroupingPage.jsx
//
// Req 3.5.5 — one screen to take a season from "teams uploaded" to "ready
// for fixtures": a board of the unassigned-teams pool plus one column per
// division, manual move/remove per team, auto-grouping of whatever's left
// unassigned (chunked by a chosen group size — the last group may be
// smaller), and a jump into Fixture Generation once a tournament start
// date is set. Every action writes straight to Supabase (no local-only
// draft state) so the admin can leave and come back to exactly where they
// left off.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';

export default function GroupingPage({ seasonId }) {
  const { divisions, refreshDivisions, activeSeason, refresh: refreshSeasons, setDivisionId } = useSeason();
  const navigate = useNavigate();

  const [teamSeasons, setTeamSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupSize, setGroupSize] = useState(4);
  const [startDateDraft, setStartDateDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('team_seasons')
      .select('id, division_id, teams(id, name, captain_name)')
      .eq('season_id', seasonId)
      .order('created_at', { ascending: true });
    if (error) { alert(error.message); setLoading(false); return; }
    setTeamSeasons(data || []);
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

    const pool = teamSeasons.filter((ts) => !ts.division_id);
    if (pool.length === 0) { alert('No unassigned teams to group.'); return; }

    const groupCount = Math.ceil(pool.length / size);
    if (!confirm(`Create ${groupCount} new division(s) for ${pool.length} unassigned team(s), ${size} per group (last group may have fewer)?`)) return;

    const chunks = [];
    for (let i = 0; i < pool.length; i += size) chunks.push(pool.slice(i, i + size));

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

    for (const chunk of chunks) {
      const { data: newDivision, error: divErr } = await supabase
        .from('divisions')
        .insert({ season_id: seasonId, name: nextName() })
        .select()
        .single();
      if (divErr) { alert(divErr.message); return; }

      const { error: assignErr } = await supabase
        .from('team_seasons')
        .update({ division_id: newDivision.id })
        .in('id', chunk.map((ts) => ts.id));
      if (assignErr) { alert(assignErr.message); return; }
    }

    await Promise.all([load(), refreshDivisions()]);
  }

  async function saveStartDate() {
    if (!startDateDraft) { alert('Pick a date first.'); return; }
    const { error } = await supabase.from('seasons').update({ start_weekend: startDateDraft }).eq('id', seasonId);
    if (error) { alert(error.message); return; }
    refreshSeasons();
  }

  function goGenerateFixtures(divisionId) {
    if (!activeSeason?.start_weekend) { alert('Set the tournament start date above first.'); return; }
    setDivisionId(divisionId);
    navigate('/admin/fixtures');
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
          Splits the {unassigned.length} unassigned team(s) into new divisions of this size (the last group may
          have fewer):
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min="1"
            value={groupSize}
            onChange={(e) => setGroupSize(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-24"
          />
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
            onGenerateFixtures={() => goGenerateFixtures(d.id)}
          />
        ))}
      </div>
    </div>
  );
}

function GroupColumn({ title, teams, divisions, currentDivisionId, onMove, onGenerateFixtures }) {
  return (
    <div className="border rounded overflow-hidden">
      <div className="bg-gray-100 px-3 py-2 flex items-center justify-between">
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs text-gray-500">{teams.length}</span>
      </div>
      {onGenerateFixtures && (
        <button onClick={onGenerateFixtures} className="w-full text-xs text-teal-700 underline py-1 border-b">
          Generate Fixtures
        </button>
      )}
      <div className="divide-y">
        {teams.length === 0 && <p className="p-2 text-xs text-gray-400">No teams</p>}
        {teams.map((ts) => (
          <div key={ts.id} className="p-2 text-sm flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium truncate">{ts.teams?.name}</p>
              <p className="text-xs text-gray-500 truncate">{ts.teams?.captain_name}</p>
            </div>
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
