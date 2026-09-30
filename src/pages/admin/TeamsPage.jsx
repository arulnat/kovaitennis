// src/pages/admin/TeamsPage.jsx
//
// Req 3.5.5: lists every team registered for the currently selected
// season (created via Bulk Upload, or the "+ Add Team" form here) —
// read-only with respect to GROUPING; assigning/ranking teams within a
// division still lives entirely on the Grouping page. This page mirrors
// whatever Grouping currently shows: unassigned teams first, then each
// division highest-to-lowest (divisions.order_index — see DivisionsPage),
// and within a division, highest rank to lowest (team_seasons.order_index)
// — so a change made in Grouping (move a team, reorder it, reorder
// divisions) is reflected here automatically, since both pages read the
// same underlying order.
//
// Team name, captain name, phone, and club are all editable in place
// (EditableCell) — Save only appears once a field actually changes.
// Team/captain name and phone are required (blank never saves); club
// blank clears it. Renaming the team here does NOT touch its login_id
// (fixed at creation) or its Auth email, so an existing login keeps
// working after a rename.
//
// "+ Add Team" (AddTeamForm) creates a single team directly, without a
// CSV — same validation and creation path as Bulk Upload (captain plus 3
// placeholder players).
//
// The Roster column's player count links to /admin/teams/:teamId/roster
// (MyTeamPage.jsx in admin mode) — the same roster editor a captain uses
// on their own team, letting an admin edit/add/remove any player on any
// team's roster too.
//
// Delete (single, via the per-row button, or several at once via the
// checkboxes + "Delete selected") is only offered for a team unassigned
// in this season (matching what's visible right here) — the checkbox
// itself is disabled for an assigned team so it can't even be selected.
// The delete-team Edge Function re-checks server-side across every
// season before actually removing anything, and does the full teardown —
// login, players, roster, credentials — since deleting the underlying
// auth account needs the service_role key.

import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useSeason } from '../../lib/seasonContext.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { validateBulkUpload } from '../../lib/bulkUpload.js';
import { normalizePhone } from '../../lib/phone.js';
import TeamLink from '../../components/TeamLink.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { extractFunctionErrorMessage } from '../../lib/functionsError.js';

export default function TeamsPage({ seasonId }) {
  const { divisions } = useSeason();
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [orphanTeams, setOrphanTeams] = useState([]); // teams in NO season at all — invisible otherwise, e.g. after a purge
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set()); // team_seasons row ids

  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    // No season selected (or none exist at all) — nothing season-scoped
    // to show, but orphaned teams below still need to be reachable.
    if (!seasonId) {
      setRows([]);
      setSelected(new Set());
    } else {
      const { data: teamSeasons, error } = await supabase
        .from('team_seasons')
        .select('id, team_id, division_id, order_index, status, teams(id, name, captain_name, captain_phone, club_id, clubs(id, name))')
        .eq('season_id', seasonId);

      if (error) { alert(error.message); setLoading(false); return; }

      const teamIds = (teamSeasons || []).map((ts) => ts.team_id);
      const playerCounts = {};
      if (teamIds.length > 0) {
        const { data: teamPlayers } = await supabase
          .from('team_players')
          .select('team_id')
          .eq('season_id', seasonId)
          .in('team_id', teamIds);
        for (const tp of teamPlayers || []) {
          playerCounts[tp.team_id] = (playerCounts[tp.team_id] || 0) + 1;
        }
      }

      setRows((teamSeasons || []).map((ts) => ({ ...ts, playerCount: playerCounts[ts.team_id] || 0 })));
      setSelected(new Set());
    }

    // Teams with no team_seasons row in ANY season — e.g. left behind by
    // an old Purge Data that only cleared season-scoped rows. Invisible
    // in the season-scoped query above no matter which season is
    // selected, so this is the only way to ever surface (and delete)
    // them again.
    const [{ data: allTeams }, { data: allTeamSeasons }] = await Promise.all([
      supabase.from('teams').select('id, name, captain_name, captain_phone, club_id, clubs(id, name)'),
      supabase.from('team_seasons').select('team_id'),
    ]);
    const teamIdsWithAnySeason = new Set((allTeamSeasons || []).map((r) => r.team_id));
    setOrphanTeams((allTeams || []).filter((t) => !teamIdsWithAnySeason.has(t.id)));

    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  // Unassigned first, then each division highest-to-lowest (divisions is
  // already ordered that way — see DivisionsPage), and within a division,
  // by team_seasons.order_index (the same rank Grouping shows/edits).
  const sections = useMemo(() => {
    const byOrder = (a, b) => a.order_index - b.order_index;
    const list = [];
    const unassigned = rows.filter((r) => !r.division_id).sort(byOrder);
    if (unassigned.length > 0) list.push({ key: 'unassigned', label: 'Unassigned', teams: unassigned });
    for (const d of divisions) {
      const teams = rows.filter((r) => r.division_id === d.id).sort(byOrder);
      if (teams.length > 0) list.push({ key: d.id, label: d.name, teams });
    }
    return list;
  }, [rows, divisions]);

  function toggleRow(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const deletableRows = rows.filter((r) => !r.division_id);
  const allDeletableSelected = deletableRows.length > 0 && deletableRows.every((r) => selected.has(r.id));

  function toggleSelectAll() {
    setSelected(allDeletableSelected ? new Set() : new Set(deletableRows.map((r) => r.id)));
  }

  /** Find-or-create a club by name (case-insensitive) and point the team at it — same matching the bulk-create-teams Edge Function does, so a typo fix here never creates a duplicate club. Blank clears the team's club. */
  async function updateClub(teamId, clubName) {
    const trimmed = clubName.trim();
    let clubId = null;
    if (trimmed) {
      const { data: existing } = await supabase.from('clubs').select('id').ilike('name', trimmed).maybeSingle();
      if (existing) {
        clubId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase.from('clubs').insert({ name: trimmed }).select().single();
        if (createErr) { alert(createErr.message); return; }
        clubId = created.id;
      }
    }
    const { error } = await supabase.from('teams').update({ club_id: clubId }).eq('id', teamId);
    if (error) { alert(error.message); return; }
    load();
  }

  async function updateTeamField(teamId, field, value) {
    const { error } = await supabase.from('teams').update({ [field]: value }).eq('id', teamId);
    if (error) { alert(error.message); return; }
    load();
  }

  async function updateTeamName(teamId, name) {
    if (!name) { alert('Team name is required.'); return; }
    await updateTeamField(teamId, 'name', name);
  }

  async function updateCaptainName(teamId, name) {
    if (!name) { alert('Captain name is required.'); return; }
    await updateTeamField(teamId, 'captain_name', name);
  }

  async function updateCaptainPhone(teamId, phone) {
    const result = normalizePhone(phone);
    if (!result.ok) {
      alert('Phone number must be a 10-digit number (spaces are fine; a leading +91 or 91 is fine).');
      return;
    }
    await updateTeamField(teamId, 'captain_phone', result.value);
  }

  async function deleteTeams(targets) {
    if (targets.length === 0) return;
    const names = targets.map((r) => r.teams?.name).join(', ');
    const label = targets.length === 1 ? `"${names}"` : `${targets.length} teams (${names})`;
    if (!confirm(`Permanently delete ${label}? This removes their players, roster, and login. This cannot be undone.`)) return;

    setDeleting(true);
    const failures = [];
    for (const row of targets) {
      const { error } = await supabase.functions.invoke('delete-team', { body: { teamId: row.team_id } });
      if (error) failures.push(`${row.teams?.name}: ${await extractFunctionErrorMessage(error)}`);
    }
    setDeleting(false);

    if (failures.length > 0) alert(`Some deletions failed:\n${failures.join('\n')}`);
    load();
  }

  const columnCount = 7 + (isAdmin ? 1 : 0); // checkbox, team, captain, phone, club, players, delete [+ status]

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PageHeader
        title="Teams"
        subtitle={'Teams registered for the currently selected season (via Bulk Upload, or added directly below). Grouping into divisions and ranking happens on the Grouping page — this list mirrors it: unassigned first, then each division highest to lowest, ranked within it. Only an unassigned team can be deleted.'}
      />

      {seasonId && <AddTeamForm seasonId={seasonId} onCreated={load} />}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
      <>
        {orphanTeams.length > 0 && (
          <div className="mb-6 border-2 border-red-300 rounded p-3 bg-red-50">
            <h2 className="font-semibold text-red-800 mb-1">Orphaned teams — not in any season ({orphanTeams.length})</h2>
            <p className="text-xs text-red-700 mb-2">
              Not part of any season, usually left behind by an old Purge Data — invisible above no matter which
              season is selected. Their login still works until deleted here.
            </p>
            <ul className="divide-y border rounded bg-white">
              {orphanTeams.map((t) => (
                <li key={t.id} className="p-2 flex items-center justify-between text-sm">
                  <span><TeamLink teamId={t.id}>{t.name}</TeamLink> — captain {t.captain_name}</span>
                  <button
                    onClick={() => deleteTeams([{ team_id: t.id, teams: t }])}
                    disabled={deleting}
                    className="text-red-600 text-xs underline disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

      {!seasonId ? (
        <p className="text-gray-500">No season selected — create one under Seasons to see teams placed in one.</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">No teams yet — use Bulk Upload to add some.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => deleteTeams(rows.filter((r) => selected.has(r.id)))}
              disabled={selected.size === 0 || deleting}
              className="px-3 py-1.5 rounded bg-red-600 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
          </div>

          <table className="w-full text-sm border">
            <thead className="bg-teal-50">
              <tr>
                <th className="p-2 w-8">
                  <input
                    type="checkbox"
                    checked={allDeletableSelected}
                    onChange={toggleSelectAll}
                    disabled={deletableRows.length === 0}
                    title="Select all deletable teams"
                  />
                </th>
                <th className="text-left p-2">Team</th>
                <th className="text-left p-2">Captain</th>
                <th className="text-left p-2">Phone</th>
                <th className="text-left p-2">Club</th>
                <th className="p-2">Roster</th>
                {isAdmin && <th className="text-left p-2">Status</th>}
                <th className="p-2">Delete</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <Fragment key={section.key}>
                  <tr className="border-t">
                    <td colSpan={columnCount} className="p-2 font-semibold text-teal-900 bg-slate-100">
                      {section.label}
                    </td>
                  </tr>
                  {section.teams.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                          disabled={!!r.division_id}
                          title={r.division_id ? 'Unassign from its division first (Grouping)' : undefined}
                        />
                      </td>
                      <td className="p-2 font-medium">
                        <div className="flex items-center gap-2">
                          <EditableCell teamId={r.team_id} initialValue={r.teams?.name ?? ''} onSave={updateTeamName} placeholder="Team name" />
                          <TeamLink teamId={r.team_id} className="text-xs text-gray-400 underline shrink-0">View</TeamLink>
                        </div>
                      </td>
                      <td className="p-2">
                        <EditableCell teamId={r.team_id} initialValue={r.teams?.captain_name ?? ''} onSave={updateCaptainName} placeholder="Captain name" />
                      </td>
                      <td className="p-2">
                        <EditableCell teamId={r.team_id} initialValue={r.teams?.captain_phone ?? ''} onSave={updateCaptainPhone} placeholder="Phone" />
                      </td>
                      <td className="p-2">
                        <EditableCell teamId={r.team_id} initialValue={r.teams?.clubs?.name ?? ''} onSave={updateClub} placeholder="No club" className="border rounded px-1.5 py-0.5 text-xs w-32 uppercase" allowBlank />
                      </td>
                      <td className="p-2 text-center">
                        <Link to={`/admin/teams/${r.team_id}/roster`} className="text-teal-700 underline">
                          {r.playerCount}
                        </Link>
                      </td>
                      {isAdmin && (
                        <td className="p-2">
                          {r.division_id ? (
                            <span className="text-green-700">Assigned</span>
                          ) : (
                            <span className="text-amber-700">Unassigned</span>
                          )}
                        </td>
                      )}
                      <td className="p-2 text-right">
                        <button
                          onClick={() => deleteTeams([r])}
                          disabled={!!r.division_id || deleting}
                          title={r.division_id ? 'Unassign from its division first (Grouping)' : undefined}
                          className="text-red-600 text-xs underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
      </>
      )}
    </div>
  );
}

/**
 * Add a single team directly from this page, without a CSV — reuses the
 * exact same validation (validateBulkUpload, wrapped around a one-row
 * "file") and creation path (bulk-create-teams Edge Function) as Bulk
 * Upload, so a directly-added team gets the same captain + 3 placeholder
 * players ("Player 1"/"Player 2"/"Player 3") and is just as deletable/
 * editable afterward.
 */
function AddTeamForm({ seasonId, onCreated }) {
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [captainName, setCaptainName] = useState('');
  const [phone, setPhone] = useState('');
  const [clubName, setClubName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setTeamName(''); setCaptainName(''); setPhone(''); setClubName(''); setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const result = validateBulkUpload([[teamName, captainName, phone, clubName]]);
    if (!result.ok) { setError(result.errors.join(' ')); return; }

    setSaving(true);
    const { data, error: invokeErr } = await supabase.functions.invoke('bulk-create-teams', {
      body: { seasonId, teams: result.teams },
    });
    setSaving(false);
    if (invokeErr) { setError(await extractFunctionErrorMessage(invokeErr)); return; }
    if (data.failures?.length > 0) { setError(data.failures[0].error); return; }

    reset();
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mb-4 px-3 py-1.5 rounded bg-teal-700 text-white text-sm font-medium hover:bg-teal-800">
        + Add Team
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mb-4 p-3 border rounded bg-teal-50 flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs text-gray-600 mb-0.5">Team name</label>
        <input value={teamName} onChange={(e) => setTeamName(e.target.value)} className="border rounded px-2 py-1 text-sm w-36" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-0.5">Captain name</label>
        <input value={captainName} onChange={(e) => setCaptainName(e.target.value)} className="border rounded px-2 py-1 text-sm w-36" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-0.5">Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-0.5">Club (optional)</label>
        <input value={clubName} onChange={(e) => setClubName(e.target.value)} className="border rounded px-2 py-1 text-sm w-36" />
      </div>
      <button type="submit" disabled={saving} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50">
        {saving ? 'Adding…' : 'Add'}
      </button>
      <button type="button" onClick={() => { reset(); setOpen(false); }} className="px-3 py-1.5 rounded border text-sm text-gray-600 hover:bg-gray-50">
        Cancel
      </button>
      {error && <p className="w-full text-red-600 text-xs mt-1">{error}</p>}
    </form>
  );
}

/**
 * Generic inline text editor for one team-row field (team name, captain
 * name, phone, club) — Save only appears once the text actually changes,
 * so nothing writes on every keystroke. Blank counts as "changed" only
 * when allowBlank is set (club: blank clears it; team/captain name and
 * phone are required, so blank is never saveable there).
 */
function EditableCell({ teamId, initialValue, onSave, placeholder, className, allowBlank = false }) {
  const [draft, setDraft] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const trimmed = draft.trim();
  const dirty = trimmed !== initialValue && (allowBlank || trimmed !== '');

  async function save() {
    setSaving(true);
    await onSave(teamId, trimmed);
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className={className ?? 'border rounded px-1.5 py-0.5 text-xs w-32'}
      />
      {dirty && (
        <button onClick={save} disabled={saving} className="text-xs text-teal-700 underline shrink-0 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  );
}
