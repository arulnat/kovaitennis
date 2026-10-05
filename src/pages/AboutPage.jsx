// src/pages/AboutPage.jsx
//
// Shows which build is actually running — the commit hash and its date
// are baked in at build time (see vite.config.js) from whatever the
// build environment cloned, so this can never drift out of sync with
// what's really deployed the way a hand-maintained version number
// could. Exists because of a real incident: a "rebuild" silently
// redeployed a build from days earlier, and there was no way to tell
// from inside the app.
//
// Also links to Database Admin (super_admin only) — raw table access
// for fixing data issues no normal admin page has a path for — and
// lets super_admin reset the tournament admin's password (reset-admin-
// password Edge Function) if they ever get locked out, since there's
// no "Forgot Password" flow for the admin/superadmin logins the way
// there is for a team (see LoginCredentialsPage.jsx). One-directional
// only — the tournament admin can't reset super_admin's password here.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { extractFunctionErrorMessage } from '../lib/functionsError.js';
import PageHeader from '../components/PageHeader.jsx';

function formatVersionDate(iso) {
  if (!iso || iso === 'unknown') return 'unknown';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AboutPage() {
  const { role } = useAuth();
  const [resetting, setResetting] = useState(false);

  async function resetAdminPassword() {
    if (!confirm('Reset the tournament admin ("admin") login\'s password? They\'ll need the new one to sign in and will be forced to change it.')) return;
    setResetting(true);
    const { data, error } = await supabase.functions.invoke('reset-admin-password');
    setResetting(false);
    if (error) { alert(await extractFunctionErrorMessage(error)); return; }
    alert(`New password for "admin": ${data.newPassword}\n\nShare this with them directly — it won't be shown again.`);
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <PageHeader title="About" subtitle="Which build is currently live." />

      <div className="rounded-lg overflow-hidden shadow-lg mb-6">
        <div className="bg-teal-900 text-teal-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wide">Version</div>
        <div className="bg-white p-4 text-sm space-y-2">
          <p>
            <span className="font-semibold">Commit:</span>{' '}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded">{__APP_VERSION__}</code>
          </p>
          <p>
            <span className="font-semibold">Committed:</span> {formatVersionDate(__APP_VERSION_DATE__)}
          </p>
        </div>
      </div>

      {role === 'super_admin' && (
        <div className="rounded-lg overflow-hidden shadow-lg mb-6">
          <div className="bg-teal-900 text-teal-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wide">Admin Account</div>
          <div className="bg-white p-4 text-sm">
            <p className="text-gray-600 mb-3">
              Reset the tournament admin's ("admin") password if they're locked out — they'll be forced to
              change it on their next login.
            </p>
            <button
              onClick={resetAdminPassword}
              disabled={resetting}
              className="px-4 py-2 rounded bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-50"
            >
              {resetting ? 'Resetting…' : 'Reset admin\'s password'}
            </button>
          </div>
        </div>
      )}

      {role === 'super_admin' && (
        <div className="rounded-lg overflow-hidden shadow-lg">
          <div className="bg-red-700 text-white px-4 py-2 text-xs font-extrabold uppercase tracking-wide">Database</div>
          <div className="bg-white p-4 text-sm">
            <p className="text-gray-600 mb-3">
              Direct read/update/delete access to every table, for fixing data issues the regular admin pages
              don't have a path for — not for everyday use, and it bypasses the app's usual safeguards.
            </p>
            <Link to="/admin/database" className="inline-block px-4 py-2 rounded bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
              Open Database Admin
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
