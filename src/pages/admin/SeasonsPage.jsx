// src/pages/admin/SeasonsPage.jsx
//
// Req 3/4 (season setup) — an admin creates real seasons here (no more
// separate is_test sandbox; every season created on this page is a real
// one, is_test: false). Purge Data permanently deletes everything under a
// season, so it's guarded by a lock that defaults LOCKED (opposite of
// divisions' order lock) — an admin must deliberately unlock a season
// before Purge Data will run, so a mis-click can't nuke real fixtures,
// scores, or team placements.
//
// Age Cutoff is the fixed date My Team / manage-team-roster uses to
// decide whether a player is old enough (40+) to be on a team's roster
// this season — a per-season reference date, not "today", so a player's
// eligibility never silently shifts mid-season (src/lib/age.js). Next
// season just gets its own cutoff when it's created.
import { useSeason } from '../../lib/seasonContext.jsx';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';
import ToggleSwitch from '../../components/ToggleSwitch.jsx';
import { extractFunctionErrorMessage } from '../../lib/functionsError.js';

export default function SeasonsPage() {
  const { refresh: refreshGlobalSeasons } = useSeason(); // keeps the nav bar's dropdown in sync
  const [seasons, setSeasons] = useState([]);
  const [name, setName] = useState('');
  const [startWeekend, setStartWeekend] = useState('');
  const [ageCutoffDate, setAgeCutoffDate] = useState('');

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const { data } = await supabase.from('seasons').select('*').order('created_at', { ascending: false });
    setSeasons(data || []);
    refreshGlobalSeasons(); // keeps the nav bar's season/division picker in sync too
  }

  async function createSeason() {
    if (!name.trim() || !startWeekend || !ageCutoffDate) { alert('Enter a name, start date, and age-eligibility cutoff date.'); return; }
    const { error } = await supabase.from('seasons').insert({
      name: name.trim(), start_weekend: startWeekend, age_cutoff_date: ageCutoffDate, is_test: false,
    });
    if (error) { alert(error.message); return; }
    setName('');
    setStartWeekend('');
    setAgeCutoffDate('');
    refresh();
  }

  /** Players must be 40+ as of this date to be added/kept on a team's roster this season (My Team / manage-team-roster). */
  async function updateAgeCutoff(season, date) {
    if (!date) return;
    const { error } = await supabase.from('seasons').update({ age_cutoff_date: date }).eq('id', season.id);
    if (error) { alert(error.message); return; }
    refresh();
  }

  async function toggleLock(season) {
    const { error } = await supabase.from('seasons').update({ purge_locked: !season.purge_locked }).eq('id', season.id);
    if (error) { alert(error.message); return; }
    refresh();
  }

  /** Freezes every team's roster size for this season — a captain can no longer add or delete a player (editing an existing one is unaffected); admin always can. Default off. */
  async function toggleRosterAdditions(season) {
    const { error } = await supabase.from('seasons').update({ roster_additions_disabled: !season.roster_additions_disabled }).eq('id', season.id);
    if (error) { alert(error.message); return; }
    refresh();
  }

  async function purge(season) {
    if (season.purge_locked) {
      alert('This season is locked. Unlock it first before purging.');
      return;
    }
    if (!confirm(`This permanently deletes every team, player, login, fixture, and score under "${season.name}". This cannot be undone. Continue?`)) return;

    // Which teams were in this season, captured BEFORE the team_seasons
    // rows below are removed — used afterward to fully tear down each
    // team's login/players/credentials via delete-team, which is also
    // the real gate against wiping a team that's still placed in some
    // OTHER season: it refuses (and we keep it) if so.
    const { data: teamSeasonRows } = await supabase.from('team_seasons').select('team_id').eq('season_id', season.id);
    const teamIds = [...new Set((teamSeasonRows || []).map((r) => r.team_id))];

    // Cascade deletes rely on FK ON DELETE CASCADE from fixtures/rubbers
    // back to seasons(id).
    await supabase.from('team_seasons').delete().eq('season_id', season.id);
    await supabase.from('fixtures').delete().eq('season_id', season.id); // rubbers cascade
    await supabase.from('team_players').delete().eq('season_id', season.id);

    const kept = [];
    for (const teamId of teamIds) {
      const { error } = await supabase.functions.invoke('delete-team', { body: { teamId } });
      if (error) kept.push(await extractFunctionErrorMessage(error));
    }

    const { error } = await supabase.from('seasons').delete().eq('id', season.id);
    if (error) { alert(error.message); return; }
    if (kept.length > 0) {
      alert(`Season purged. ${kept.length} team(s) could not be fully removed (login kept) — usually because they're still placed in another season:\n${kept.join('\n')}`);
    }
    refresh();
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader
        title="Seasons"
        subtitle="Create and manage seasons. Purge Data permanently deletes a season and everything under it — including its teams' logins, unless a team is also placed in another season — locked by default, so you must deliberately unlock a season before it can be purged. Add Player controls whether a captain can add or delete a player on their own roster this season — enabled by default."
      />

      <div className="border rounded p-4 mb-4">
        <h2 className="font-medium mb-2">Create a Season</h2>
        <div className="flex gap-2 mb-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="2026 Summer League"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
          <div>
            <label className="block text-[10px] text-gray-500">Start weekend</label>
            <input type="date" value={startWeekend} onChange={(e) => setStartWeekend(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500">Age cutoff (40+ as of)</label>
            <input type="date" value={ageCutoffDate} onChange={(e) => setAgeCutoffDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
        </div>
        <button onClick={createSeason} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm">Create</button>
      </div>

      <table className="w-full text-sm border">
        <thead className="bg-teal-50">
          <tr>
            <th className="text-left p-2">Name</th>
            <th className="text-left p-2">Start Weekend</th>
            <th className="text-left p-2">Age Cutoff (40+ as of)</th>
            <th className="p-2">Purge Lock</th>
            <th className="p-2">Add Player</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="p-2">{s.name}{s.is_test ? ' (test)' : ''}</td>
              <td className="p-2">{s.start_weekend}</td>
              <td className="p-2">
                <input
                  type="date"
                  defaultValue={s.age_cutoff_date ?? ''}
                  onBlur={(e) => { if (e.target.value !== s.age_cutoff_date) updateAgeCutoff(s, e.target.value); }}
                  className="border rounded px-1.5 py-0.5 text-xs"
                />
              </td>
              <td className="p-2 text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${s.purge_locked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {s.purge_locked ? 'Locked' : 'Unlocked'}
                  </span>
                  <button onClick={() => toggleLock(s)} className="text-xs text-teal-700 underline">
                    {s.purge_locked ? 'Unlock' : 'Lock'}
                  </button>
                </div>
              </td>
              <td className="p-2 text-center">
                <ToggleSwitch
                  checked={!s.roster_additions_disabled}
                  onChange={() => toggleRosterAdditions(s)}
                  label={s.roster_additions_disabled ? 'Disabled' : 'Enabled'}
                />
              </td>
              <td className="p-2 text-right">
                <button
                  onClick={() => purge(s)}
                  disabled={s.purge_locked}
                  title={s.purge_locked ? 'Unlock this season first' : undefined}
                  className="text-red-600 text-xs underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                >
                  Purge Data
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
