// src/pages/public/TeamsDirectoryPage.jsx
//
// Public directory of teams — every team registered for the season,
// regardless of whether its captain has clicked Submit on My Team
// (team_seasons.roster_submitted, migration 0026): once fixtures are
// out, the team names/matchups are already public via Standings/
// Results/Fixtures Calendar, so there's nothing left to gain by hiding
// a team here just because its roster isn't fully filled in yet.
// Clicking a team goes to its existing public profile
// (TeamProfilePage.jsx, /team/:teamId), which already shows whatever
// roster exists (name, photo, gender) and season statistics.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';
import Avatar from '../../components/Avatar.jsx';

export default function TeamsDirectoryPage({ seasonId }) {
  const [teams, setTeams] = useState(null); // null = loading

  useEffect(() => {
    if (!seasonId) { setTeams([]); return; }
    let cancelled = false;

    async function load() {
      setTeams(null);
      const { data } = await supabase
        .from('team_seasons')
        .select('teams(id, name)')
        .eq('season_id', seasonId);
      if (cancelled) return;
      setTeams(
        (data || [])
          .map((r) => r.teams)
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader title="Teams" />

      {teams === null ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : teams.length === 0 ? (
        <p className="text-gray-500 text-sm">No teams registered this season yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {teams.map((t) => (
            <Link
              key={t.id}
              to={`/team/${t.id}`}
              className="flex flex-col items-center text-center gap-2 p-4 rounded-lg bg-white shadow border border-slate-100 hover:border-accent-500 transition-colors"
            >
              <Avatar name={t.name} />
              <span className="font-semibold text-teal-900 text-sm">{t.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
