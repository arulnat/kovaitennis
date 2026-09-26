// src/pages/admin/MissingScoresReportPage.jsx
//
// Req 5.8, 12.8: admin manually runs this report (not automatic) to see
// which fixtures are fully scored, partially updated, or untouched, and
// follow up with the teams directly — this is what replaced the
// opposing-captain confirm/dispute step in v6.

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import TeamLink from '../../components/TeamLink.jsx';
import PageHeader from '../../components/PageHeader.jsx';

export default function MissingScoresReportPage({ seasonId }) {
  const [weekDate, setWeekDate] = useState('');
  const [rows, setRows] = useState(null);

  async function runReport() {
    let query = supabase
      .from('fixtures')
      .select('id, week_date, home_team_id, away_team_id, teams_home:teams!fixtures_home_team_id_fkey(name), teams_away:teams!fixtures_away_team_id_fkey(name), rubbers(rubber_type, winner_side, confirmed_at)')
      .eq('season_id', seasonId)
      .eq('is_bye', false);

    if (weekDate) query = query.eq('week_date', weekDate);

    const { data, error } = await query;
    if (error) { alert(error.message); return; }

    const withStatus = (data || []).map((f) => {
      const scored = f.rubbers?.filter((r) => r.winner_side && r.confirmed_at).length ?? 0;
      const status = scored === 3 ? 'complete' : scored === 0 ? 'nothing_entered' : 'partial';
      return { ...f, scoredCount: scored, status };
    });

    setRows(withStatus);
  }

  const statusLabel = { complete: 'Complete', partial: 'Partially updated', nothing_entered: 'Nothing entered' };
  const statusColor = { complete: 'text-green-700', partial: 'text-amber-700', nothing_entered: 'text-red-700' };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader
        title="Missing / Pending Scores Report"
        subtitle="Run manually — use this to follow up directly with teams whose scores are missing or incomplete. There is no automatic dispute mechanism; this report is it."
      />

      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm">Week:</label>
        <input type="date" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <button onClick={runReport} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm">Run report</button>
      </div>

      {rows && (
        <table className="w-full text-sm border">
          <thead className="bg-teal-50">
            <tr><th className="text-left p-2">Week</th><th className="text-left p-2">Fixture</th><th className="text-left p-2">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="p-2">{f.week_date}</td>
                <td className="p-2">
                  <TeamLink teamId={f.home_team_id}>{f.teams_home?.name}</TeamLink>
                  {' vs '}
                  <TeamLink teamId={f.away_team_id}>{f.teams_away?.name}</TeamLink>
                </td>
                <td className={`p-2 font-medium ${statusColor[f.status]}`}>
                  {statusLabel[f.status]} ({f.scoredCount}/3)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
