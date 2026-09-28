// src/pages/ForgotPasswordPage.jsx
//
// Team accounts log in with a login ID, not a real email — Supabase
// Auth sees a synthetic "<login_id>@teams.internal" address behind the
// scenes (see LoginPage.jsx), so there's no real inbox to send a reset
// link to. This submits a request instead: an admin sees it on the Team
// Logins page and resets the password directly from there
// (reset-team-password Edge Function).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';

export default function ForgotPasswordPage() {
  const [loginId, setLoginId] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!loginId.trim()) { setError('Enter your login ID.'); return; }

    setSubmitting(true);
    // Best-effort match to a real team so the admin doesn't have to hunt
    // for it — the request is still recorded even if nothing matches
    // (e.g. a typo), so the admin can follow up either way.
    const { data: team } = await supabase.from('teams').select('id').eq('login_id', loginId.trim()).maybeSingle();
    const { error: insertErr } = await supabase.from('password_reset_requests').insert({
      login_id: loginId.trim(),
      team_id: team?.id ?? null,
    });
    setSubmitting(false);
    if (insertErr) { setError(insertErr.message); return; }
    setSent(true);
  }

  return (
    <div className="max-w-sm mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="bg-teal-900 px-6 py-4 border-b-4 border-accent-500">
          <h1 className="text-lg font-extrabold uppercase tracking-wide text-white">Forgot Password</h1>
        </div>
        <div className="p-6">
          {sent ? (
            <>
              <p className="text-sm text-gray-700 mb-4">
                Request sent — the tournament admin will reset your password and get in touch with a new one.
              </p>
              <Link to="/login" className="text-teal-700 text-sm underline">Back to Sign In</Link>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="text-sm text-gray-600 mb-4">
                Enter your login ID and we'll send a request to the tournament admin to reset it for you.
              </p>
              <input
                placeholder="Login ID"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-full mb-2"
              />
              {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded bg-teal-700 text-white text-sm font-bold uppercase tracking-wide hover:bg-teal-800 shadow disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send Details'}
              </button>
              <p className="text-xs text-gray-500 mt-3">
                Already remember it? <Link to="/login" className="text-teal-700 underline">Sign In</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
