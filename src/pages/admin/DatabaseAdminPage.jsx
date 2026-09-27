// src/pages/admin/DatabaseAdminPage.jsx
//
// Raw table browser + editor covering every table in the schema —
// direct Retrieve/Update/Delete/Insert access for fixing data issues
// that don't have a path through the normal admin pages (e.g. the
// orphaned-teams cleanup this was built right after). Restricted to
// super_admin only (see the route in App.jsx) — tournament_admin never
// gets this, on purpose, even though most tables' RLS itself grants
// both roles the same access; this is an app-level guardrail on top.
//
// A row's edit/insert form is raw JSON rather than a generated form
// per table — the schemas are different enough (uuid, text, boolean,
// timestamptz, enums...) that a real per-column form for all ~15 tables
// would be a lot of bespoke code for a tool meant to be reached for
// rarely. Whatever's typed is sent to Supabase as-is; a bad value fails
// with that table's own constraint/RLS error, same as it would anywhere
// else in the app.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';
import Dropdown from '../../components/Dropdown.jsx';

const TABLES = [
  'seasons', 'divisions', 'season_holidays', 'clubs', 'teams', 'players',
  'team_seasons', 'team_players', 'fixtures', 'rubbers', 'tie_player_ratings',
  'content_pages', 'app_users', 'team_credentials', 'audit_log',
];

// Every table uses `id` as its primary key except these.
const PRIMARY_KEY = { team_credentials: 'team_id' };
const pkOf = (table) => PRIMARY_KEY[table] ?? 'id';

const PAGE_SIZE = 25;

export default function DatabaseAdminPage() {
  const [table, setTable] = useState(TABLES[0]);
  const [rows, setRows] = useState(null); // null = loading
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newDraft, setNewDraft] = useState('{\n\n}');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPage(0);
    setEditingKey(null);
    setShowNew(false);
  }, [table]);

  useEffect(() => { load(); }, [table, page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setRows(null);
    const pk = pkOf(table);
    const { data, count: total, error } = await supabase
      .from(table)
      .select('*', { count: 'exact' })
      .order(pk, { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) { alert(error.message); setRows([]); return; }
    setRows(data || []);
    setCount(total ?? 0);
  }

  function startEdit(row) {
    setEditingKey(row[pkOf(table)]);
    setDraft(JSON.stringify(row, null, 2));
  }

  async function saveEdit(row) {
    let parsed;
    try { parsed = JSON.parse(draft); } catch (e) { alert(`Invalid JSON: ${e.message}`); return; }
    setBusy(true);
    const { error } = await supabase.from(table).update(parsed).eq(pkOf(table), row[pkOf(table)]);
    setBusy(false);
    if (error) { alert(error.message); return; }
    setEditingKey(null);
    load();
  }

  async function deleteRow(row) {
    const pk = pkOf(table);
    if (!confirm(`Permanently delete this row from "${table}" (${pk} = ${row[pk]})? This cannot be undone.`)) return;
    setBusy(true);
    const { error } = await supabase.from(table).delete().eq(pk, row[pk]);
    setBusy(false);
    if (error) { alert(error.message); return; }
    load();
  }

  async function insertRow() {
    let parsed;
    try { parsed = JSON.parse(newDraft); } catch (e) { alert(`Invalid JSON: ${e.message}`); return; }
    setBusy(true);
    const { error } = await supabase.from(table).insert(parsed);
    setBusy(false);
    if (error) { alert(error.message); return; }
    setShowNew(false);
    setNewDraft('{\n\n}');
    load();
  }

  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="max-w-6xl mx-auto p-6">
      <PageHeader
        title="Database Admin"
        subtitle="Raw table access, bypassing every normal safeguard — use the regular admin pages whenever they cover what you need; this is for what they can't."
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Dropdown value={table} onChange={setTable} options={TABLES.map((t) => ({ value: t, label: t }))} className="w-56" />
        <span className="text-sm text-gray-500">{count} row(s)</span>
        <button onClick={() => setShowNew((v) => !v)} className="ml-auto px-3 py-1.5 rounded bg-teal-700 text-white text-sm">
          {showNew ? 'Cancel new row' : '+ New row'}
        </button>
      </div>

      {showNew && (
        <div className="border rounded p-3 mb-4 bg-teal-50">
          <p className="text-xs text-gray-600 mb-2">New row as JSON — omit auto-generated columns like id/created_at unless you need a specific value.</p>
          <textarea
            value={newDraft}
            onChange={(e) => setNewDraft(e.target.value)}
            rows={6}
            className="w-full border rounded p-2 font-mono text-xs"
          />
          <button onClick={insertRow} disabled={busy} className="mt-2 px-3 py-1.5 rounded bg-teal-700 text-white text-sm disabled:opacity-50">
            Insert
          </button>
        </div>
      )}

      {rows === null ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 text-sm">No rows.</p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="text-xs w-full">
            <thead className="bg-teal-900 text-teal-50">
              <tr>
                {columns.map((c) => <th key={c} className="p-2 text-left font-bold whitespace-nowrap">{c}</th>)}
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const pk = pkOf(table);
                const isEditing = editingKey === row[pk];
                return isEditing ? (
                  <tr key={row[pk]} className="border-t bg-amber-50">
                    <td colSpan={columns.length + 1} className="p-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={Math.min(20, columns.length + 2)}
                        className="w-full border rounded p-2 font-mono text-xs"
                      />
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => saveEdit(row)} disabled={busy} className="px-3 py-1 rounded bg-teal-700 text-white text-xs disabled:opacity-50">
                          Save
                        </button>
                        <button onClick={() => setEditingKey(null)} className="px-3 py-1 rounded border text-xs">
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={row[pk]} className="border-t hover:bg-slate-50">
                    {columns.map((c) => (
                      <td key={c} className="p-2 whitespace-nowrap max-w-xs truncate" title={row[c] == null ? '' : String(row[c])}>
                        {row[c] === null ? (
                          <span className="text-gray-300">null</span>
                        ) : typeof row[c] === 'object' ? (
                          JSON.stringify(row[c])
                        ) : (
                          String(row[c])
                        )}
                      </td>
                    ))}
                    <td className="p-2 whitespace-nowrap">
                      <button onClick={() => startEdit(row)} className="text-teal-700 text-xs underline mr-2">Edit</button>
                      <button onClick={() => deleteRow(row)} className="text-red-600 text-xs underline">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3">
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 border rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          Prev
        </button>
        <span className="text-sm text-gray-600">Page {page + 1} of {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 border rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          Next
        </button>
      </div>
    </div>
  );
}
