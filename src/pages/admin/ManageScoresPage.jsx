// src/pages/admin/ManageScoresPage.jsx
//
// By default (migration 0029), a team captain can no longer enter or
// edit a rubber's score, or give an opposing-player rating, for a
// fixture whose week hasn't arrived yet (its week_date is after
// today) — admin is unaffected, as always. This page is the one place
// to lift that for a specific week: one row per distinct week_date
// across every division in the season (a week is a shared calendar
// date, not a per-division thing), each with a toggle. Off is the
// default for every week — enabling one re-opens it for every
// fixture that falls on it, in any division, irrespective of how far
// ahead of today it is.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';
import ToggleSwitch from '../../components/ToggleSwitch.jsx';

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ManageScoresPage({ seasonId }) {
  const [weeks, setWeeks] = useState(null); // null = loading
  const [overrides, setOverrides] = useState(new Set()); // week_date strings with an override row

  const load = useCallback(async () => {
    setWeeks(null);
    const [{ data: fixtureRows, error }, { data: overrideRows }] = await Promise.all([
      supabase.from('fixtures').select('week_date').eq('season_id', seasonId).order('week_date'),
      supabase.from('score_entry_week_overrides').select('week_date').eq('season_id', seasonId),
    ]);
    if (error) { alert(error.message); setWeeks([]); return; }
    setWeeks([...new Set((fixtureRows || []).map((f) => f.week_date))].sort());
    setOverrides(new Set((overrideRows || []).map((o) => o.week_date)));
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  async function toggleWeek(weekDate, enable) {
    const { error } = enable
      ? await supabase.from('score_entry_week_overrides').insert({ season_id: seasonId, week_date: weekDate })
      : await supabase.from('score_entry_week_overrides').delete().eq('season_id', seasonId).eq('week_date', weekDate);
    if (error) { alert(error.message); return; }
    await load();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <PageHeader
        title="Manage Scores"
        subtitle={'A captain can only enter or edit a score (or an opposing-player rating) for a week that has already arrived — enabling a week here lets captains score it early, no matter how far ahead of today it is. Off by default for every week. Admin can always enter or edit any score, any week, regardless of this setting.'}
      />

      {weeks === null && <p className="text-gray-500 text-sm">Loading…</p>}

      {weeks !== null && weeks.length === 0 && (
        <p className="text-gray-500 text-sm">No fixtures generated yet this season — use Grouping to generate them first.</p>
      )}

      {weeks !== null && weeks.length > 0 && (
        <div className="border rounded divide-y">
          {weeks.map((weekDate) => {
            const isFuture = weekDate > today;
            const enabled = overrides.has(weekDate);
            return (
              <div key={weekDate} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <span className="font-medium text-sm">{formatWeekDate(weekDate)}</span>
                  {!isFuture && <span className="ml-2 text-xs text-gray-400">(already arrived — nothing to lift)</span>}
                </div>
                {isFuture ? (
                  <ToggleSwitch
                    checked={enabled}
                    onChange={(next) => toggleWeek(weekDate, next)}
                    label={enabled ? 'Open for early scoring' : 'Locked until its week arrives'}
                  />
                ) : (
                  <span className="text-xs text-gray-400">Open</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
