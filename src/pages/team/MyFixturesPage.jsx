// src/pages/team/MyFixturesPage.jsx
//
// "Update Scores" for a team login — the piece that was missing: a
// captain had no in-app way to reach their own fixture's Score Entry
// page at all (ScoreEntryPage.jsx itself has always supported it, but
// nothing ever linked to it). Every one of the team's own fixtures
// this season, in week order, each with a status and a link straight
// into /score/:fixtureId — same page, same rules (including the
// future-week lock from Manage Scores) as admin's own Update Scores.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import TeamLink from '../../components/TeamLink.jsx';
import PageHeader from '../../components/PageHeader.jsx';

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MyFixturesPage() {
  const { teamId } = useAuth();
  const { seasonId, activeSeason } = useSeason();
  const navigate = useNavigate();
  const [fixtures, setFixtures] = useState(null); // null = loading
  const [overrideWeeks, setOverrideWeeks] = useState(new Set());

  const load = useCallback(async () => {
    if (!teamId || !seasonId) { setFixtures([]); return; }
    setFixtures(null);
    const [{ data: fixtureRows, error }, { data: overrideRows }] = await Promise.all([
      supabase
        .from('fixtures')
        .select(`
          id, week_date, home_team_id, away_team_id,
          teams_home:teams!fixtures_home_team_id_fkey(id, name),
          teams_away:teams!fixtures_away_team_id_fkey(id, name),
          rubbers(winner_side, confirmed_at)
        `)
        .eq('season_id', seasonId)
        .eq('is_bye', false)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order('week_date'),
      supabase.from('score_entry_week_overrides').select('week_date').eq('season_id', seasonId),
    ]);
    if (error) { alert(error.message); setFixtures([]); return; }
    setFixtures(fixtureRows || []);
    setOverrideWeeks(new Set((overrideRows || []).map((o) => o.week_date)));
  }, [teamId, seasonId]);

  useEffect(() => { load(); }, [load]);

  const published = !!activeSeason?.published;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader
        title="Update Scores"
        subtitle="Every one of your team's fixtures this season — enter or edit a score, or rate the opposing players who played, until the tie finalizes."
      />

      {!published && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
          This season isn't published yet — scores can't be entered until an admin publishes it.
        </p>
      )}

      {fixtures === null && <p className="text-gray-500 text-sm">Loading…</p>}

      {fixtures !== null && fixtures.length === 0 && (
        <p className="text-gray-500 text-sm">No fixtures for your team yet this season.</p>
      )}

      {fixtures !== null && fixtures.length > 0 && (
        <div className="overflow-x-auto rounded shadow">
        <table className="w-full text-sm border">
          <thead className="bg-teal-900 text-teal-50">
            <tr>
              <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Week</th>
              <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Opponent</th>
              <th className="p-2 font-bold uppercase text-xs tracking-wide">Status</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((f) => {
              const isHome = f.home_team_id === teamId;
              const opponent = isHome ? f.teams_away : f.teams_home;
              const scored = f.rubbers?.filter((r) => r.winner_side && r.confirmed_at).length ?? 0;
              const status = scored === 3 ? 'Complete' : scored === 0 ? 'Nothing entered' : 'Partially updated';
              const statusColor = scored === 3 ? 'text-green-700' : scored === 0 ? 'text-red-700' : 'text-amber-700';
              const isFutureWeek = f.week_date > today;
              const weekOpen = !isFutureWeek || overrideWeeks.has(f.week_date);
              return (
                <tr key={f.id} className="border-t">
                  <td className="p-2">{formatWeekDate(f.week_date)}</td>
                  <td className="p-2">
                    {isHome ? 'vs ' : '@ '}
                    <TeamLink teamId={opponent?.id}>{opponent?.name}</TeamLink>
                  </td>
                  <td className={`p-2 font-medium ${statusColor}`}>{status} ({scored}/3)</td>
                  <td className="p-2 text-right">
                    {!published ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : !weekOpen ? (
                      <span className="text-xs text-gray-400" title="Ask an admin to open this week early on Manage Scores">Not yet — {formatWeekDate(f.week_date)}</span>
                    ) : (
                      <button
                        onClick={() => navigate(`/score/${f.id}`)}
                        className="text-xs text-teal-700 underline"
                      >
                        {scored === 0 ? 'Enter score' : 'Edit score'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
