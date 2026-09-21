// src/pages/admin/DivisionsPage.jsx
//
// Req 4.1 — an admin needs at least one division under a season before
// fixtures/standings can be generated. This lets them create, rename, and
// remove divisions and see what already exists for the currently selected
// season.
import { useSeason } from '../../lib/seasonContext.jsx';
import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';

export default function DivisionsPage() {
  const { seasonId, divisions, refresh } = useSeason();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  async function createDivision() {
    if (!name.trim()) return;
    const { error } = await supabase.from('divisions').insert({
      season_id: seasonId, name: name.trim(),
    });
    if (error) { alert(error.message); return; }
    setName('');
    refresh();
  }

  function startEdit(division) {
    setEditingId(division.id);
    setEditingName(division.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName('');
  }

  async function saveEdit(divisionId) {
    if (!editingName.trim()) return;
    const { error } = await supabase.from('divisions').update({ name: editingName.trim() }).eq('id', divisionId);
    if (error) { alert(error.message); return; }
    cancelEdit();
    refresh();
  }

  async function deleteDivision(divisionId) {
    const { count, error: countError } = await supabase
      .from('team_seasons')
      .select('id', { count: 'exact', head: true })
      .eq('division_id', divisionId);
    if (countError) { alert(countError.message); return; }
    if (count > 0) {
      alert(`This division has ${count} team${count === 1 ? '' : 's'} placed in it. Remove or reassign them first.`);
      return;
    }

    if (!confirm('Delete this division? This cannot be undone.')) return;
    const { error } = await supabase.from('divisions').delete().eq('id', divisionId);
    if (error) { alert(error.message); return; }
    refresh();
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Divisions</h1>
      <p className="text-sm text-gray-600 mb-4">
        Divisions for the currently selected season. Create one (e.g. "Division A") before setting up fixtures.
      </p>

      <div className="border rounded p-4 mb-4">
        <h2 className="font-medium mb-2">Create a Division</h2>
        <div className="flex gap-2 mb-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Division A"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
        </div>
        <button onClick={createDivision} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm">Create</button>
      </div>

      <table className="w-full text-sm border">
        <thead className="bg-gray-50">
          <tr><th className="text-left p-2">Name</th><th className="p-2"></th></tr>
        </thead>
        <tbody>
          {divisions.map((d) => (
            <tr key={d.id} className="border-t">
              <td className="p-2">
                {editingId === d.id ? (
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-full"
                    autoFocus
                  />
                ) : (
                  d.name
                )}
              </td>
              <td className="p-2 text-right whitespace-nowrap">
                {editingId === d.id ? (
                  <>
                    <button onClick={() => saveEdit(d.id)} className="text-teal-700 text-xs underline mr-3">Save</button>
                    <button onClick={cancelEdit} className="text-gray-500 text-xs underline">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(d)} className="text-teal-700 text-xs underline mr-3">Edit</button>
                    <button onClick={() => deleteDivision(d.id)} className="text-red-600 text-xs underline">Delete</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
