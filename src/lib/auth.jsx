// src/lib/auth.jsx
//
// Auth & access control (Req 10). Wraps Supabase Auth's session with the
// app_users row (role, team_id, must_change_password) and enforces the
// 10-minute inactivity session timeout (Req 10.7) client-side (the JWT's
// own expiry is the hard backstop server-side).

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabaseClient.js';

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // Req 10.7

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // app_users row
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef(null);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    const { data, error } = await supabase.from('app_users').select('*').eq('id', userId).single();
    if (error) { console.error('Failed to load app_users profile', error); setProfile(null); return; }
    setProfile(data);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      signOut(); // Req 10.7 — 10 minutes of inactivity logs the session out
    }, SESSION_TIMEOUT_MS);
  }, [signOut]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      loadProfile(session?.user?.id).finally(() => setLoading(false));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      loadProfile(session?.user?.id);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  useEffect(() => {
    if (!session) return undefined;
    resetInactivityTimer();
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetInactivityTimer));
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetInactivityTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [session, resetInactivityTimer]);

  const value = {
    session,
    profile,
    loading,
    role: profile?.role ?? null,
    teamId: profile?.team_id ?? null,
    mustChangePassword: profile?.must_change_password ?? false,
    isAdmin: profile?.role === 'tournament_admin' || profile?.role === 'super_admin',
    isSuperAdmin: profile?.role === 'super_admin',
    signOut,
    refreshProfile: () => loadProfile(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Route guard: redirect/deny unless the role check passes. Use as a wrapper component. */
export function RequireRole({ roles, children, fallback = <p>You don't have access to this page.</p> }) {
  const { role, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!role || !roles.includes(role)) return fallback;
  return children;
}
