// src/lib/seasonContext.jsx
//
// Replaces the window.__ACTIVE_SEASON_ID__ / window.__ACTIVE_DIVISION_ID__
// placeholders flagged in the README. Loads real seasons/divisions from
// Supabase and lets the person pick one — this is what every admin page
// (Bulk Upload, Fixtures, Missing Scores, Content, Standings) reads from
// instead of an undefined global.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { useAuth } from './auth.jsx';
import Dropdown from '../components/Dropdown.jsx';

const SeasonContext = createContext(null);

export function SeasonProvider({ children }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [seasons, setSeasons] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [seasonId, setSeasonId] = useState(null);
  const [divisionId, setDivisionId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSeasons = useCallback(async () => {
    const { data, error } = await supabase.from('seasons').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Failed to load seasons', error); setLoading(false); return; }
    setSeasons(data || []);
    setSeasonId((current) => (data?.some((s) => s.id === current) ? current : (data?.[0]?.id ?? null)));
    setLoading(false);
  }, []);

  // Re-fetch whenever the auth session changes (login/logout), not just once
  // on initial mount — otherwise a season list fetched before login (as an
  // unauthenticated visitor, before RLS grants admin visibility) never picks
  // up test seasons or anything else gated by is_admin() after signing in.
  useEffect(() => { loadSeasons(); }, [loadSeasons, userId]);

  const loadDivisions = useCallback(async () => {
    if (!seasonId) { setDivisions([]); setDivisionId(null); return; }
    // order_index ranks divisions highest-first (Req 3.5.5) — NOT alphabetical.
    const { data } = await supabase.from('divisions').select('*').eq('season_id', seasonId).order('order_index');
    setDivisions(data || []);
    setDivisionId((current) =>
      data?.some((d) => d.id === current) ? current : (data?.[0]?.id ?? null)
    );
  }, [seasonId]);

  useEffect(() => { loadDivisions(); }, [loadDivisions]);

  const refresh = useCallback(async () => {
    await loadSeasons();
    await loadDivisions();
  }, [loadSeasons, loadDivisions]);

  const value = {
    seasons, divisions, seasonId, divisionId,
    setSeasonId, setDivisionId, loading,
    refresh,
    refreshDivisions: loadDivisions,
    activeSeason: seasons.find((s) => s.id === seasonId) ?? null,
  };

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
}

export function useSeason() {
  const ctx = useContext(SeasonContext);
  if (!ctx) throw new Error('useSeason must be used within SeasonProvider');
  return ctx;
}

/**
 * Season picker for the nav bar. Division is no longer picked here —
 * every page that cares which division is showing (Standings) has its
 * own in-page division tabs now, reading/writing the same divisionId
 * this provider holds, so there's no separate "current division" left
 * for a nav-bar control to need to expose.
 */
export function SeasonSelector() {
  const { seasons, seasonId, setSeasonId, loading } = useSeason();
  const { role } = useAuth();
  const isAdmin = role === 'tournament_admin' || role === 'super_admin';

  if (loading) return <span className="text-xs text-gray-400">Loading seasons…</span>;
  if (seasons.length === 0) {
    // Signed-out/team visitors only ever see non-test seasons (RLS), so an
    // empty list here doesn't necessarily mean none exist at all — and
    // they couldn't create one anyway, so "create one" is only shown to
    // admins, who see every season and can actually act on it.
    return (
      <span className="text-xs text-gray-400">
        {isAdmin ? 'No seasons yet — create one' : 'No seasons available yet'}
      </span>
    );
  }

  return (
    <Dropdown
      value={seasonId ?? ''}
      onChange={setSeasonId}
      options={seasons.map((s) => ({ value: s.id, label: `${s.name}${s.is_test ? ' (test)' : ''}` }))}
      className="text-xs w-40"
    />
  );
}