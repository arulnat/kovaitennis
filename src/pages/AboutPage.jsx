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
// for fixing data issues no normal admin page has a path for.

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

/** One-time self-service migration to the admin/superadmin login-ID scheme (see migrate-admin-login Edge Function) — safe to run more than once. */
function LoginIdMigration() {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('migrate-admin-login');
    setBusy(false);
    if (error) { alert(await extractFunctionErrorMessage(error)); return; }
    if (data.alreadyDone) {
      alert(`Already using the new scheme — log in with "${data.loginId}" from now on.`);
    } else {
      alert(`Done. Your login ID is now "${data.loginId}" — use that (not your old email) next time you sign in.`);
    }
  }

  return (
    <div className="rounded-lg overflow-hidden shadow-lg mb-6">
      <div className="bg-teal-900 text-teal-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wide">Login ID</div>
      <div className="bg-white p-4 text-sm">
        <p className="text-gray-600 mb-3">
          Admin accounts now sign in with a short login ID ("admin" / "superadmin") instead of an
          email — same as a team login. Run this once to switch your account over.
        </p>
        <button onClick={run} disabled={busy} className="px-4 py-2 rounded bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60">
          {busy ? 'Switching…' : 'Switch my login to the new ID'}
        </button>
      </div>
    </div>
  );
}

export default function AboutPage() {
  const { role } = useAuth();

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

      <LoginIdMigration />

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
