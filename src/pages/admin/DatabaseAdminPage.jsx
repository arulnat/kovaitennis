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

// Hand-maintained from the migrations (not queried live — PostgREST
// doesn't expose information_schema through the same client) — every
// column, its type/constraints, and a plain note where the name alone
// doesn't say enough. Shown next to the row browser so an empty table
// (e.g. right after a purge) still tells you what belongs in it, and so
// a New row/Edit JSON has something to go by.
const TABLE_SCHEMAS = {
  seasons: [
    'id: uuid, PK',
    'name: text, NOT NULL',
    "is_test: boolean, NOT NULL, default false — retired concept, always false now",
    'start_weekend: date, NOT NULL — Saturday date of week 1',
    'age_cutoff_date: date, NOT NULL — players must be 40+ as of this date to be on a roster this season (My Team / manage-team-roster, src/lib/age.js)',
    'registration_fee: numeric, NOT NULL, default 1000 — deferred feature',
    'player_fee: numeric, NOT NULL, default 500 — deferred feature',
    'final_results_approved: boolean, NOT NULL, default false',
    'champion_singles_winner_id: uuid, FK → players.id',
    'champion_singles_runnerup_id: uuid, FK → players.id',
    'champion_doubles_winner_ids: uuid[]',
    'champion_doubles_runnerup_ids: uuid[]',
    'created_at: timestamptz, NOT NULL, default now()',
    'divisions_locked: boolean, NOT NULL, default false',
    'purge_locked: boolean, NOT NULL, default true — Purge Data is blocked until unlocked',
    'published: boolean, NOT NULL, default false — opens score entry for every division',
  ],
  divisions: [
    'id: uuid, PK',
    'season_id: uuid, NOT NULL, FK → seasons.id ON DELETE CASCADE',
    'name: text, NOT NULL',
    'created_at: timestamptz, NOT NULL, default now()',
    'order_index: integer, NOT NULL, default 0 — rank; lowest value is the highest division',
    'grouping_locked: boolean, NOT NULL, default false — freezes roster + ranking, blocks Generate Fixtures',
    'fixtures_locked: boolean, NOT NULL, default false — home/away swaps allowed only while unlocked',
    'UNIQUE (season_id, name)',
  ],
  season_holidays: [
    'id: uuid, PK',
    'season_id: uuid, NOT NULL, FK → seasons.id ON DELETE CASCADE',
    'holiday_date: date, NOT NULL — a weekend with no matches',
    'created_at: timestamptz, NOT NULL, default now()',
    'UNIQUE (season_id, holiday_date)',
  ],
  clubs: [
    'id: uuid, PK',
    'name: text, NOT NULL',
    'created_at: timestamptz, NOT NULL, default now()',
    'UNIQUE INDEX on lower(name) — names unique case-insensitively',
  ],
  teams: [
    'id: uuid, PK',
    'name: text, NOT NULL, UNIQUE',
    'login_id: text, NOT NULL, UNIQUE — generated from the team name',
    'club_id: uuid, FK → clubs.id',
    'photo_url / address / gps_lat / gps_lng / court_type / num_courts: deferred fields (court_type CHECK in clay/synthetic/both)',
    'captain_name: text, NOT NULL',
    'captain_phone: text, NOT NULL',
    'alternate_contact_phone: text',
    'created_at / updated_at: timestamptz, NOT NULL, default now()',
  ],
  players: [
    'id: uuid, PK',
    'team_id: uuid, NOT NULL, FK → teams.id ON DELETE CASCADE — permanent team, not tied to a season',
    'name: text, NOT NULL',
    "gender: text, CHECK in ('male','female','other') — My Roster only ever sets male/female",
    'date_of_birth: date — age is always computed from this, never stored',
    'is_captain: boolean, NOT NULL, default false — at most one true per team_id (partial unique index); the captain\'s "player" row, used by My Roster to also offer editing teams.captain_phone',
    'is_coach: boolean, NOT NULL, default false — at most one true per team_id (partial unique index); My Roster auto-clears the previous coach when a new one is set',
    "photo_url / id_proof_type / id_proof_number / id_proof_image_url: id_proof_* are deferred fields (id_proof_type CHECK in aadhaar/driving_licence/pan_card); photo_url is used by My Roster (player-photos Storage bucket, capped at 100KB)",
    'age_flagged_under_40: boolean, NOT NULL, default false',
    'created_at / updated_at: timestamptz, NOT NULL, default now()',
  ],
  team_seasons: [
    'id: uuid, PK',
    'season_id: uuid, NOT NULL, FK → seasons.id ON DELETE CASCADE',
    'team_id: uuid, NOT NULL, FK → teams.id ON DELETE CASCADE',
    'division_id: uuid, FK → divisions.id — null means not yet placed',
    "status: enum, NOT NULL, default 'new' — placed|withdrawn|promoted|relegated|new",
    'approved / fee_paid / payment_proof_url: deferred fields',
    'created_at: timestamptz, NOT NULL, default now()',
    "order_index: integer, NOT NULL, default 0 — team's rank within its division",
    'roster_submitted: boolean, NOT NULL, default false — set via My Team\'s Submit button (manage-team-roster Edge Function); gates the public Teams directory',
    'roster_submitted_at: timestamptz — when roster_submitted was last set true',
    'UNIQUE (season_id, team_id)',
  ],
  team_players: [
    'id: uuid, PK',
    'season_id: uuid, NOT NULL, FK → seasons.id ON DELETE CASCADE',
    'team_id: uuid, NOT NULL, FK → teams.id ON DELETE CASCADE',
    'player_id: uuid, NOT NULL, FK → players.id ON DELETE CASCADE',
    'added_by_admin_after_lock: boolean, NOT NULL, default false',
    'created_at: timestamptz, NOT NULL, default now()',
    'UNIQUE (season_id, player_id)',
  ],
  fixtures: [
    'id: uuid, PK',
    'season_id: uuid, NOT NULL, FK → seasons.id ON DELETE CASCADE',
    'division_id: uuid, NOT NULL, FK → divisions.id ON DELETE CASCADE',
    'round_number: integer, NOT NULL — week number, starting at 1',
    'week_date: date, NOT NULL — the Saturday of that round',
    'home_team_id: uuid, FK → teams.id — null when the row is a bye',
    'away_team_id: uuid, FK → teams.id',
    'is_bye: boolean, NOT NULL, default false',
    "status: enum, NOT NULL, default 'scheduled' — scheduled|released|in_progress|complete|locked",
    'released_at: timestamptz',
    'deadline_extended_to: date — a rain extension for the whole week',
    'created_at: timestamptz, NOT NULL, default now()',
    'finalized_at: timestamptz — set once all 3 rubbers have confirmed_at; captains can no longer edit after, admin still can',
  ],
  rubbers: [
    'id: uuid, PK',
    'fixture_id: uuid, NOT NULL, FK → fixtures.id ON DELETE CASCADE',
    "rubber_type: enum, NOT NULL — singles|doubles1|doubles2",
    'home_player1_id / home_player2_id: uuid, FK → players.id — player2 null for singles',
    'away_player1_id / away_player2_id: uuid, FK → players.id — player2 null for singles',
    'set1_home / set1_away: integer — singles uses only set 1 (the whole rubber)',
    'set2_home / set2_away: integer — doubles only',
    'set3_home / set3_away: integer — doubles only, the 10-pt super-tiebreak decider when 1-1',
    'is_walkover: boolean, NOT NULL, default false',
    "walkover_winner_side: text, CHECK in ('home','away')",
    'time_played_minutes: integer, CHECK null or 0..180',
    "winner_side: text, CHECK in ('home','away') — derived, stored for query speed",
    'entered_by: uuid, FK → app_users.id',
    'completed_at: timestamptz — set once the rubber has a full score',
    'locked_at: timestamptz — set once all 3 rubbers are entered (7-day window concept)',
    'created_at / updated_at: timestamptz, NOT NULL, default now()',
    'confirmed_at: timestamptz — null until Update confirms the score (Save alone leaves it null); only confirmed rubbers count toward the tally/standings/Rising Stars',
    'set1_tiebreak_home / set1_tiebreak_away: integer — the 6-6 breaker\'s own points when set 1 finished 7-6/6-7, null otherwise',
    'UNIQUE (fixture_id, rubber_type)',
  ],
  tie_player_ratings: [
    'id: uuid, PK',
    'fixture_id: uuid, NOT NULL, FK → fixtures.id ON DELETE CASCADE',
    'rated_player_id: uuid, NOT NULL, FK → players.id ON DELETE CASCADE',
    'rated_by_team_id: uuid, NOT NULL, FK → teams.id — the opposing team whose captain rated',
    'overall_rating: smallint, NOT NULL, CHECK 5..10',
    "serve / forehand / backhand / volley: text, CHECK in ('strong','weak')",
    'created_at / updated_at: timestamptz, NOT NULL, default now()',
    'UNIQUE (fixture_id, rated_player_id)',
    'Not publicly readable; admin has no write access — optional, never affects finalization',
  ],
  content_pages: [
    'id: uuid, PK',
    'season_id: uuid, FK → seasons.id — null for content not tied to a season (e.g. Rules)',
    "page_type: text, NOT NULL, CHECK in ('rules_and_regulations','welcome_note')",
    'title: text, NOT NULL',
    'body_html: text, NOT NULL',
    'source_file_url: text',
    'published: boolean, NOT NULL, default false',
    'created_at / updated_at: timestamptz, NOT NULL, default now()',
    'season_key: uuid, GENERATED — stands in for a null season_id in the unique constraint',
    'UNIQUE (page_type, season_key)',
  ],
  app_users: [
    'id: uuid, PK, FK → auth.users.id ON DELETE CASCADE — no default, must match a real auth user',
    "role: enum, NOT NULL — super_admin|tournament_admin|team",
    "team_id: uuid — set only when role='team'; has NO foreign key, nothing enforces it points at a real team",
    'must_change_password: boolean, NOT NULL, default true',
    'created_at: timestamptz, NOT NULL, default now()',
  ],
  team_credentials: [
    'team_id: uuid, PK, FK → teams.id ON DELETE CASCADE — one row per team, no default',
    'default_password: text, NOT NULL — stored in plaintext, hence no public read access',
    'created_at: timestamptz, NOT NULL, default now()',
  ],
  audit_log: [
    'id: uuid, PK',
    'actor_id: uuid, FK → app_users.id',
    "action: text, NOT NULL — e.g. 'rubber.edit', 'fixture.release'",
    'entity_type: text, NOT NULL',
    'entity_id: uuid, NOT NULL — points at a row in whichever table entity_type names, no FK',
    'detail: jsonb',
    'created_at: timestamptz, NOT NULL, default now()',
  ],
};

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
  const [showSchema, setShowSchema] = useState(true);

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
        <button onClick={() => setShowSchema((v) => !v)} className="text-teal-700 text-sm underline">
          {showSchema ? 'Hide fields' : 'Show fields'}
        </button>
        <button onClick={() => setShowNew((v) => !v)} className="ml-auto px-3 py-1.5 rounded bg-teal-700 text-white text-sm">
          {showNew ? 'Cancel new row' : '+ New row'}
        </button>
      </div>

      {showSchema && (
        <div className="border rounded p-3 mb-4 bg-slate-50">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
            {table} — fields
          </p>
          <ul className="text-xs font-mono space-y-1 text-slate-700">
            {(TABLE_SCHEMAS[table] || ['No schema notes for this table.']).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

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
        <p className="text-gray-500 text-sm">This table has 0 rows right now — see "{table}" fields above for what a row would contain.</p>
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
