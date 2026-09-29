// src/pages/admin/LoginCredentialsPage.jsx
//
// Req 2.2 — admin-only list of every team's login ID and default
// password, across all bulk uploads (not scoped to one season, since
// teams are persistent entities — see 0001_init.sql). Passwords live in
// team_credentials, a table with no public RLS policy at all (unlike
// `teams`, which is publicly selectable for Req 10.5), so this page is
// the only place they're ever read back.
//
// "Normalize login IDs" (normalize-team-login-ids Edge Function)
// recomputes every login_id with the current letters-only rule
// (generateLoginId in bulkUpload.js) and updates the matching Auth
// email to match — safe to click repeatedly, since an already-correct
// team is left untouched.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { downloadCredentialsSheet } from '../../lib/bulkUpload.js';
import TeamLink from '../../components/TeamLink.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { extractFunctionErrorMessage } from '../../lib/functionsError.js';

export default function LoginCredentialsPage() {
  const [teams, setTeams] = useState([]);
  const [resetRequests, setResetRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [resettingId, setResettingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: requests }] = await Promise.all([
      supabase.from('teams').select('id, name, login_id, captain_name, team_credentials(default_password)').order('name'),
      supabase.from('password_reset_requests').select('*, teams(id, name)').eq('resolved', false).order('created_at', { ascending: false }),
    ]);
    if (error) { alert(error.message); setLoading(false); return; }
    setTeams(data || []);
    setResetRequests(requests || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const missingLogin = teams.filter((t) => !t.team_credentials);

  async function backfillMissing() {
    setBackfilling(true);
    const { data, error } = await supabase.functions.invoke('backfill-team-logins');
    setBackfilling(false);
    if (error) { alert(error.message); return; }
    alert(`Created ${data.updated.length} login(s).${data.failures.length > 0 ? ` ${data.failures.length} failed.` : ''}`);
    load();
  }

  /** Recomputes every team's login ID as letters-only (see generateLoginId), updating the Auth email to match — safe to run repeatedly, a team already correct is left alone. */
  async function normalizeLoginIds() {
    if (!confirm("Recompute every team's login ID as letters only (spaces, hyphens, and digits dropped), updating their login email to match? Passwords are unaffected — teams just sign in with the new ID next time.")) return;
    setNormalizing(true);
    const { data, error } = await supabase.functions.invoke('normalize-team-login-ids');
    setNormalizing(false);
    if (error) { alert(await extractFunctionErrorMessage(error)); return; }
    let msg = `${data.updated.length} login ID(s) updated.`;
    if (data.skippedCollisions?.length > 0) msg += `\n${data.skippedCollisions.length} skipped — these teams' names collide on the same login ID, rename one of each pair first: ${data.skippedCollisions.join(', ')}`;
    if (data.failures?.length > 0) msg += `\n${data.failures.length} failed: ${data.failures.map((f) => `${f.team} (${f.error})`).join('; ')}`;
    alert(msg);
    load();
  }

  /** Generates a fresh default password for the team and forces a change on next login — how a Forgot Password request actually gets resolved (team accounts have no real email to send a reset link to). */
  async function resetPassword(teamId, teamName, requestId) {
    if (!confirm(`Reset "${teamName}"'s password? They'll need the new one to log in and will be forced to change it.`)) return;
    setResettingId(teamId);
    const { data, error } = await supabase.functions.invoke('reset-team-password', { body: { teamId } });
    setResettingId(null);
    if (error) { alert(await extractFunctionErrorMessage(error)); return; }
    if (requestId) await supabase.from('password_reset_requests').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', requestId);
    alert(`New password for "${teamName}": ${data.newPassword}\n\nShare this with the team directly — it's also saved here on this page.`);
    load();
  }

  function downloadAll() {
    downloadCredentialsSheet(
      teams.map((t) => ({
        teamName: t.name,
        loginId: t.login_id,
        defaultPassword: t.team_credentials?.default_password ?? '',
      }))
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader
        title="Team Logins"
        subtitle="Every team's login ID and default password, across all bulk uploads. Circulate these to captains — each is forced to change their password on first login."
      />

      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <button
          onClick={downloadAll}
          disabled={teams.length === 0}
          className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm disabled:opacity-50"
        >
          Download login details (CSV)
        </button>
        {missingLogin.length > 0 && (
          <button
            onClick={backfillMissing}
            disabled={backfilling}
            className="text-sm text-teal-700 underline disabled:opacity-50"
          >
            {backfilling ? 'Generating…' : `Generate missing logins (${missingLogin.length})`}
          </button>
        )}
        <button
          onClick={normalizeLoginIds}
          disabled={normalizing}
          className="text-sm text-teal-700 underline disabled:opacity-50"
        >
          {normalizing ? 'Normalizing…' : 'Normalize login IDs (letters only)'}
        </button>
      </div>

      {resetRequests.length > 0 && (
        <div className="mb-6 border-2 border-amber-300 rounded p-3 bg-amber-50">
          <h2 className="font-semibold text-amber-800 mb-2">Forgot Password requests ({resetRequests.length})</h2>
          <ul className="divide-y border rounded bg-white">
            {resetRequests.map((r) => (
              <li key={r.id} className="p-2 flex items-center justify-between text-sm">
                <span>
                  <span className="font-mono">{r.login_id}</span>
                  {r.teams ? <> — <TeamLink teamId={r.teams.id}>{r.teams.name}</TeamLink></> : <span className="text-red-600 ml-1">(no matching team found)</span>}
                </span>
                {r.teams ? (
                  <button
                    onClick={() => resetPassword(r.teams.id, r.teams.name, r.id)}
                    disabled={resettingId === r.teams.id}
                    className="text-amber-700 text-xs underline disabled:opacity-50"
                  >
                    {resettingId === r.teams.id ? 'Resetting…' : 'Reset password'}
                  </button>
                ) : (
                  <button
                    onClick={() => supabase.from('password_reset_requests').update({ resolved: true }).eq('id', r.id).then(load)}
                    className="text-gray-500 text-xs underline"
                  >
                    Dismiss
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : teams.length === 0 ? (
        <p className="text-gray-500">No teams yet — use Bulk Upload to add some.</p>
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-teal-50">
            <tr>
              <th className="text-left p-2">Team</th>
              <th className="text-left p-2">Login ID</th>
              <th className="text-left p-2">Password</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2"><TeamLink teamId={t.id}>{t.name}</TeamLink></td>
                <td className="p-2 font-mono">{t.login_id}</td>
                <td className="p-2 font-mono">
                  {t.team_credentials?.default_password ?? <span className="text-gray-400 italic">no login yet</span>}
                </td>
                <td className="p-2 text-right">
                  {t.team_credentials && (
                    <button
                      onClick={() => resetPassword(t.id, t.name, null)}
                      disabled={resettingId === t.id}
                      className="text-teal-700 text-xs underline disabled:opacity-50"
                    >
                      {resettingId === t.id ? 'Resetting…' : 'Reset'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
