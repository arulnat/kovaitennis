// src/pages/admin/SeasonsPage.jsx
//
// Req 3/4 (season setup) — an admin creates real seasons here (no more
// separate is_test sandbox; every season created on this page is a real
// one, is_test: false). Purge Data permanently deletes everything under a
// season, so it's guarded by a lock that defaults LOCKED (opposite of
// divisions' order lock) — an admin must deliberately unlock a season
// before Purge Data will run, so a mis-click can't nuke real fixtures,
// scores, or team placements.
import { useSeason } from '../../lib/seasonContext.jsx';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';

export default function SeasonsPage() {
  const { refresh: refreshGlobalSeasons } = useSeason(); // keeps the nav bar's dropdown in sync
  const [seasons, setSeasons] = useState([]);
  const [name, setName] = useState('');
  const [startWeekend, setStartWeekend] = useState('');

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const { data } = await supabase.from('seasons').select('*').order('created_at', { ascending: false });
    setSeasons(data || []);
    refreshGlobalSeasons(); // keeps the nav bar's season/division picker in sync too
  }

  async function createSeason() {
    if (!name.trim() || !startWeekend) { alert('Enter a name and start date.'); return; }
    const { error } = await supabase.from('seasons').insert({
      name: name.trim(), start_weekend: startWeekend, is_test: false,
    });
    if (error) { alert(error.message); return; }
    setName('');
    setStartWeekend('');
    refresh();
  }

  async function toggleLock(season) {
    const { error } = await supabase.from('seasons').update({ purge_locked: !season.purge_locked }).eq('id', season.id);
    if (error) { alert(error.message); return; }
    refresh();
  }

  async function purge(season) {
    if (season.purge_locked) {
      alert('This season is locked. Unlock it first before purging.');
      return;
    }
    if (!confirm(`This permanently deletes every team, player, fixture, and score under "${season.name}". This cannot be undone. Continue?`)) return;

    // Cascade deletes rely on FK ON DELETE CASCADE from fixtures/rubbers/
    // team_seasons/team_players back to seasons(id). Teams/players created
    // ONLY for this season should also be cleaned up — in production, tag
    // dummy teams/players so this purge doesn't touch anything shared.
    // This scaffold purges season-scoped rows only.
    await supabase.from('team_seasons').delete().eq('season_id', season.id);
    await supabase.from('fixtures').delete().eq('season_id', season.id); // rubbers cascade
    await supabase.from('team_players').delete().eq('season_id', season.id);
    const { error } = await supabase.from('seasons').delete().eq('id', season.id);
    if (error) { alert(error.message); return; }
    refresh();
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Seasons</h1>
      <p className="text-sm text-gray-600 mb-4">
        Create and manage seasons. Purge Data permanently deletes a season and everything under it — locked by
        default, so you must deliberately unlock a season before it can be purged.
      </p>

      <div className="border rounded p-4 mb-4">
        <h2 className="font-medium mb-2">Create a Season</h2>
        <div className="flex gap-2 mb-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="2026 Summer League"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
          <input type="date" value={startWeekend} onChange={(e) => setStartWeekend(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <button onClick={createSeason} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm">Create</button>
      </div>

      <table className="w-full text-sm border">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-2">Name</th>
            <th className="text-left p-2">Start Weekend</th>
            <th className="p-2">Purge Lock</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="p-2">{s.name}{s.is_test ? ' (test)' : ''}</td>
              <td className="p-2">{s.start_weekend}</td>
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
