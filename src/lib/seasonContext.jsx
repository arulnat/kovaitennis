// src/lib/seasonContext.jsx
//
// Replaces the window.__ACTIVE_SEASON_ID__ / window.__ACTIVE_DIVISION_ID__
// placeholders flagged in the README. Loads real seasons/divisions from
// Supabase and lets the person pick one — this is what every admin page
// (Bulk Upload, Fixtures, Missing Scores, Content, Standings) reads from
// instead of an undefined global.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient.js';

const SeasonContext = createContext(null);

export function SeasonProvider({ children }) {
  const [seasons, setSeasons] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [seasonId, setSeasonId] = useState(null);
  const [divisionId, setDivisionId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSeasons = useCallback(async () => {
    const { data, error } = await supabase.from('seasons').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Failed to load seasons', error); setLoading(false); return; }
    setSeasons(data || []);
    setSeasonId((current) => current ?? data?.[0]?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { loadSeasons(); }, [loadSeasons]);

  useEffect(() => {
    if (!seasonId) { setDivisions([]); setDivisionId(null); return; }
    supabase.from('divisions').select('*').eq('season_id', seasonId).order('name').then(({ data }) => {
      setDivisions(data || []);
      setDivisionId((current) =>
        data?.some((d) => d.id === current) ? current : (data?.[0]?.id ?? null)
      );
    });
  }, [seasonId]);

  const value = {
    seasons, divisions, seasonId, divisionId,
    setSeasonId, setDivisionId, loading,
    refresh: loadSeasons,
    activeSeason: seasons.find((s) => s.id === seasonId) ?? null,
  };

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
}

export function useSeason() {
  const ctx = useContext(SeasonContext);
  if (!ctx) throw new Error('useSeason must be used within SeasonProvider');
  return ctx;
}

/** Small dropdown pair for the nav bar — season, then division within it. */
export function SeasonSelector() {
  const { seasons, divisions, seasonId, divisionId, setSeasonId, setDivisionId, loading } = useSeason();

  if (loading) return <span className="text-xs text-gray-400">Loading seasons…</span>;
  if (seasons.length === 0) return <span className="text-xs text-gray-400">No seasons yet — create one</span>;

  return (
    <div className="flex items-center gap-2 text-sm">
      <select
        value={seasonId ?? ''}
        onChange={(e) => setSeasonId(e.target.value)}
        className="border rounded px-2 py-1 text-xs"
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.is_test ? ' (test)' : ''}</option>
        ))}
      </select>
      {divisions.length > 0 && (
        <select
          value={divisionId ?? ''}
          onChange={(e) => setDivisionId(e.target.value)}
          className="border rounded px-2 py-1 text-xs"
        >
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}