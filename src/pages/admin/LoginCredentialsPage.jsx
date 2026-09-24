// src/pages/admin/LoginCredentialsPage.jsx
//
// Req 2.2 — admin-only list of every team's login ID and default
// password, across all bulk uploads (not scoped to one season, since
// teams are persistent entities — see 0001_init.sql). Passwords live in
// team_credentials, a table with no public RLS policy at all (unlike
// `teams`, which is publicly selectable for Req 10.5), so this page is
// the only place they're ever read back.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { downloadCredentialsSheet } from '../../lib/bulkUpload.js';
import TeamLink from '../../components/TeamLink.jsx';

export default function LoginCredentialsPage() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, login_id, captain_name, team_credentials(default_password)')
      .order('name');
    if (error) { alert(error.message); setLoading(false); return; }
    setTeams(data || []);
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
      <h1 className="text-xl font-semibold mb-1">Login Credentials</h1>
      <p className="text-sm text-gray-600 mb-4">
        Every team's login ID and default password, across all bulk uploads. Circulate these to captains
        (Req 2.2, 10.2) — each is forced to change their password on first login.
      </p>

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
      </div>

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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
