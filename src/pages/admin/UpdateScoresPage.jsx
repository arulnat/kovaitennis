// src/pages/admin/UpdateScoresPage.jsx
//
// Req 5.2 — admin can enter or edit any fixture's score, exactly like
// either captain can (see ScoreEntryPage.jsx, which already treats an
// admin viewer as exempt from the 7-day edit-window lock — Req 5.7).
// This page is just the missing piece: a way for an admin to find a
// fixture and jump into its score entry, the same way a captain would
// from their own team dashboard.
//
// The whole season must be published (Fixtures page) before anyone —
// captain or admin — can enter a score in it; ScoreEntryPage enforces
// this too (defense in depth for anyone linking straight to a fixture),
// but this page also disables the action up front so it's clear why.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import TeamLink from '../../components/TeamLink.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Dropdown from '../../components/Dropdown.jsx';

export default function UpdateScoresPage({ seasonId }) {
  const { divisions, activeSeason } = useSeason();
  const navigate = useNavigate();
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [fixtures, setFixtures] = useState(null); // null = loading

  useEffect(() => {
    if (!selectedDivisionId && divisions.length > 0) setSelectedDivisionId(divisions[0].id);
  }, [divisions, selectedDivisionId]);

  useEffect(() => {
    if (!selectedDivisionId) return;
    setFixtures(null);
    supabase
      .from('fixtures')
      .select(`
        id, round_number, week_date, home_team_id, away_team_id,
        teams_home:teams!fixtures_home_team_id_fkey(name),
        teams_away:teams!fixtures_away_team_id_fkey(name),
        rubbers(winner_side, confirmed_at)
      `)
      .eq('season_id', seasonId)
      .eq('division_id', selectedDivisionId)
      .eq('is_bye', false)
      .order('round_number')
      .then(({ data }) => setFixtures(data || []));
  }, [seasonId, selectedDivisionId]);

  const division = divisions.find((d) => d.id === selectedDivisionId) ?? null;
  const published = !!activeSeason?.published;

  if (divisions.length === 0) {
    return <p className="p-6 text-gray-500">This season has no divisions yet — create one under Divisions first.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader
        title="Update Scores"
        subtitle="Pick a fixture to enter or edit its score — same as either captain can, including after their normal 7-day edit window has locked it."
      />

      <label className="text-sm text-gray-700 block mb-4">
        Division
        <Dropdown
          value={selectedDivisionId}
          onChange={setSelectedDivisionId}
          options={divisions.map((d) => ({ value: d.id, label: d.name }))}
          className="ml-2 w-40"
        />
      </label>

      {division && !published && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
          This season isn't published yet — scores can't be entered until it is. Publish it on the Fixtures page
          once every division's fixtures are generated and no teams are left unassigned.
        </p>
      )}

      {fixtures === null && <p className="text-gray-500 text-sm">Loading…</p>}

      {fixtures !== null && fixtures.length === 0 && (
        <p className="text-gray-500 text-sm">No fixtures generated yet for this division — use Grouping to generate them.</p>
      )}

      {fixtures !== null && fixtures.length > 0 && (
        <table className="w-full text-sm border">
          <thead className="bg-teal-50">
            <tr>
              <th className="p-2">Round</th>
              <th className="text-left p-2">Week</th>
              <th className="text-left p-2">Fixture</th>
              <th className="text-left p-2">Status</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((f) => {
              const scored = f.rubbers?.filter((r) => r.winner_side && r.confirmed_at).length ?? 0;
              const status = scored === 3 ? 'Complete' : scored === 0 ? 'Nothing entered' : 'Partially updated';
              const statusColor = scored === 3 ? 'text-green-700' : scored === 0 ? 'text-red-700' : 'text-amber-700';
              return (
                <tr key={f.id} className="border-t">
                  <td className="p-2 text-center">{f.round_number}</td>
                  <td className="p-2">{f.week_date}</td>
                  <td className="p-2">
                    <TeamLink teamId={f.home_team_id}>{f.teams_home?.name}</TeamLink>
                    {' vs '}
                    <TeamLink teamId={f.away_team_id}>{f.teams_away?.name}</TeamLink>
                  </td>
                  <td className={`p-2 font-medium ${statusColor}`}>{status} ({scored}/3)</td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => navigate(`/score/${f.id}`)}
                      disabled={!published}
                      title={published ? undefined : 'Publish the season first'}
                      className="text-xs text-teal-700 underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      {scored === 0 ? 'Enter score' : 'Edit score'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
