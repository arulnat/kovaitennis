// src/pages/admin/TestSeasonPage.jsx
//
// Req 17: a sandbox season, fully excluded from public/real data, where
// score entry is not date-restricted (17.7) so the whole pipeline can be
// exercised end-to-end. Purge permanently deletes everything under it.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';

export default function TestSeasonPage() {
  const [testSeasons, setTestSeasons] = useState([]);
  const [name, setName] = useState('Test Season');
  const [startWeekend, setStartWeekend] = useState('');

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const { data } = await supabase.from('seasons').select('*').eq('is_test', true).order('created_at', { ascending: false });
    setTestSeasons(data || []);
  }

  async function createTestSeason() {
    const { error } = await supabase.from('seasons').insert({
      name, start_weekend: startWeekend, is_test: true,
    });
    if (error) { alert(error.message); return; }
    refresh();
  }

  async function purge(seasonId) {
    if (!confirm('This permanently deletes every dummy team, player, fixture, score, and login under this Test Season. This cannot be undone. Continue?')) return;

    // Cascade deletes rely on FK ON DELETE CASCADE from fixtures/rubbers/
    // team_seasons/team_players back to seasons(id). Teams/players created
    // ONLY for this test season should also be cleaned up — in production,
    // tag dummy teams/players so this purge doesn't touch anything that
    // happens to be shared. This scaffold purges season-scoped rows only.
    await supabase.from('team_seasons').delete().eq('season_id', seasonId);
    await supabase.from('fixtures').delete().eq('season_id', seasonId); // rubbers cascade
    await supabase.from('team_players').delete().eq('season_id', seasonId);
    const { error } = await supabase.from('seasons').delete().eq('id', seasonId);
    if (error) { alert(error.message); return; }
    refresh();
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Test Season Sandbox</h1>
      <p className="text-sm text-gray-600 mb-4">
        Fully excluded from Hall of Fame, cross-season stats, and public pages (Req 17.5). Score entry has no
        date restriction here — you can score any round regardless of the calendar (Req 17.7).
      </p>

      <div className="border rounded p-4 mb-4">
        <h2 className="font-medium mb-2">Create a Test Season</h2>
        <div className="flex gap-2 mb-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-2 py-1 text-sm flex-1" />
          <input type="date" value={startWeekend} onChange={(e) => setStartWeekend(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <button onClick={createTestSeason} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm">Create</button>
      </div>

      <table className="w-full text-sm border">
        <thead className="bg-gray-50">
          <tr><th className="text-left p-2">Name</th><th className="text-left p-2">Start Weekend</th><th className="p-2"></th></tr>
        </thead>
        <tbody>
          {testSeasons.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="p-2">{s.name}</td>
              <td className="p-2">{s.start_weekend}</td>
              <td className="p-2 text-right">
                <button onClick={() => purge(s.id)} className="text-red-600 text-xs underline">Purge Data</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
