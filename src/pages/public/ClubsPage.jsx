// src/pages/public/ClubsPage.jsx
//
// Public directory of clubs — only shown once the season is published
// (same gate as Fixtures Calendar), since a club's own page is really
// about coordinating that published schedule, not something useful
// before there's a schedule to coordinate. Only clubs with at least one
// team registered this season are listed — a club is a standing
// real-world entity (not season-scoped in the schema), but an empty one
// isn't useful to show here.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';

export default function ClubsPage() {
  const { seasonId, activeSeason } = useSeason();
  const [clubs, setClubs] = useState(null); // null = loading

  useEffect(() => {
    if (!seasonId || !activeSeason?.published) { setClubs([]); return; }
    let cancelled = false;

    async function load() {
      setClubs(null);
      const { data } = await supabase
        .from('team_seasons')
        .select('teams(club_id, clubs(id, name))')
        .eq('season_id', seasonId);
      if (cancelled) return;

      const byId = new Map();
      for (const row of data || []) {
        const club = row.teams?.clubs;
        if (club) byId.set(club.id, club);
      }
      setClubs([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId, activeSeason?.published]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader title="Clubs" />

      {!activeSeason?.published ? (
        <p className="text-slate-500 text-sm">The season hasn't been published yet.</p>
      ) : clubs === null ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : clubs.length === 0 ? (
        <p className="text-gray-500 text-sm">No teams have a club on file yet this season.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {clubs.map((c) => (
            <Link
              key={c.id}
              to={`/club/${c.id}`}
              className="p-4 rounded-lg bg-white shadow border border-slate-100 hover:border-accent-500 transition-colors text-center font-semibold text-teal-900"
            >
              {c.name.toUpperCase()}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
