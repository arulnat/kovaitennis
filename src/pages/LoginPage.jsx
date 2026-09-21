// src/pages/LoginPage.jsx
//
// Req 10.2/10.6: login by ID/password (team's login_id is not an email,
// so we map it to a synthetic email for Supabase Auth — see README for
// the recommended approach). Forces a password change on first login.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../lib/auth.jsx';

export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const { mustChangePassword, refreshProfile } = useAuth();
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    // login_id -> synthetic email convention: "<login_id>@teams.internal"
    // for team accounts; admin accounts use their real email directly.
    const email = loginId.includes('@') ? loginId : `${loginId}@teams.internal`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); return; }
    navigate('/standings');
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updateErr) { setError(updateErr.message); return; }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('app_users').update({ must_change_password: false }).eq('id', user.id);
    await refreshProfile();
    navigate('/standings');
  }

  if (mustChangePassword) {
    return (
      <form onSubmit={handlePasswordChange} className="max-w-sm mx-auto p-6">
        <h1 className="text-lg font-semibold mb-4">Set a new password</h1>
        <p className="text-sm text-gray-600 mb-4">Required on first login (Req 2.3/10.2).</p>
        <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mb-2" />
        <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mb-2" />
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <button type="submit" className="w-full py-2 rounded bg-teal-700 text-white text-sm font-medium">Set password</button>
      </form>
    );
  }

  return (
    <form onSubmit={handleLogin} className="max-w-sm mx-auto p-6">
      <h1 className="text-lg font-semibold mb-4">Login</h1>
      <input placeholder="Login ID (or admin email)" value={loginId} onChange={(e) => setLoginId(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mb-2" />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mb-2" />
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <button type="submit" className="w-full py-2 rounded bg-teal-700 text-white text-sm font-medium">Sign in</button>
    </form>
  );
}
