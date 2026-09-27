// src/pages/public/ResultsPage.jsx
//
// Public results listing: pick a division (in-page tabs, same pattern as
// Standings), optionally narrow to one week, see every completed tie in
// that scope with a rubber-by-rubber breakdown (who played, set scores,
// walkover). Public — no login required, same as Standings/Fixtures
// Calendar/Rising Stars — so any login (or none at all) sees the same
// page.
//
// "Completed" means the same thing it does everywhere else in the app:
// all 3 rubbers confirmed (Score Entry's Update button), not merely
// saved as a draft — a draft-only tie simply doesn't show up here yet.

import { useEffect, useState } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import TeamLink from '../../components/TeamLink.jsx';
import RubberRow from '../../components/RubberRow.jsx';

const ALL_WEEKS = '__all__';
const RUBBER_ORDER = ['singles', 'doubles1', 'doubles2'];

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ResultsPage() {
  const { seasonId, divisions, divisionId, setDivisionId } = useSeason();
  const [weekDate, setWeekDate] = useState(ALL_WEEKS);
  const [fixtures, setFixtures] = useState(null); // null = loading

  useEffect(() => { setWeekDate(ALL_WEEKS); }, [divisionId]);

  useEffect(() => {
    if (!seasonId || !divisionId) { setFixtures([]); return; }
    let cancelled = false;

    async function load() {
      setFixtures(null);

      const { data: fixtureRows } = await supabase
        .from('fixtures')
        .select(`
          id, round_number, week_date, home_team_id, away_team_id,
          teams_home:teams!fixtures_home_team_id_fkey(id, name),
          teams_away:teams!fixtures_away_team_id_fkey(id, name),
          rubbers(*)
        `)
        .eq('season_id', seasonId)
        .eq('division_id', divisionId)
        .eq('is_bye', false)
        .order('week_date', { ascending: false });
      if (cancelled) return;

      const completed = (fixtureRows || [])
        .filter((f) => f.rubbers?.length === 3 && f.rubbers.every((r) => r.winner_side && r.confirmed_at));

      const playerIds = new Set();
      for (const f of completed) {
        for (const r of f.rubbers) {
          for (const pid of [r.home_player1_id, r.home_player2_id, r.away_player1_id, r.away_player2_id]) {
            if (pid) playerIds.add(pid);
          }
        }
      }
      const { data: playerRows } = playerIds.size > 0
        ? await supabase.from('players').select('id, name').in('id', [...playerIds])
        : { data: [] };
      if (cancelled) return;
      const nameOf = Object.fromEntries((playerRows || []).map((p) => [p.id, p.name]));

      if (!cancelled) setFixtures(completed.map((f) => ({ ...f, nameOf })));
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId, divisionId]);

  const weekOptions = [...new Set((fixtures || []).map((f) => f.week_date))].sort().reverse();
  const shownFixtures = weekDate === ALL_WEEKS ? fixtures : (fixtures || []).filter((f) => f.week_date === weekDate);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader title="Results" subtitle="Every completed tie, rubber by rubber." />

      {divisions.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {divisions.map((d) => (
            <button
              key={d.id}
              onClick={() => setDivisionId(d.id)}
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
                d.id === divisionId ? 'bg-teal-900 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4">
        <Dropdown
          value={weekDate}
          onChange={setWeekDate}
          options={[
            { value: ALL_WEEKS, label: 'All weeks' },
            ...weekOptions.map((w) => ({ value: w, label: formatWeekDate(w) })),
          ]}
          className="w-56"
        />
      </div>

      {fixtures === null ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : shownFixtures.length === 0 ? (
        <p className="text-gray-500 text-sm">No completed results yet.</p>
      ) : (
        shownFixtures.map((f) => <ResultCard key={f.id} fixture={f} />)
      )}
    </div>
  );
}

function ResultCard({ fixture: f }) {
  const homeWins = f.rubbers.filter((r) => r.winner_side === 'home').length;
  const awayWins = 3 - homeWins;
  const homeWonTie = homeWins > awayWins;

  return (
    <div className="rounded-lg overflow-hidden shadow-lg mb-5">
      <div className="bg-accent-500 text-teal-950 text-xs font-extrabold uppercase tracking-wide px-3 py-1.5">
        {formatWeekDate(f.week_date)} — Round {f.round_number}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-teal-950 text-white">
        <span className={`font-extrabold uppercase truncate ${homeWonTie ? 'text-accent-400' : ''}`}>
          <TeamLink teamId={f.home_team_id} className="hover:underline">{f.teams_home?.name}</TeamLink>
        </span>
        <span className="text-2xl font-extrabold shrink-0 px-3">{homeWins} – {awayWins}</span>
        <span className={`font-extrabold uppercase truncate text-right ${!homeWonTie ? 'text-accent-400' : ''}`}>
          <TeamLink teamId={f.away_team_id} className="hover:underline">{f.teams_away?.name}</TeamLink>
        </span>
      </div>
      <div className="divide-y">
        {RUBBER_ORDER.map((type) => {
          const r = f.rubbers.find((x) => x.rubber_type === type);
          if (!r) return null;
          return <RubberRow key={type} type={type} rubber={r} nameOf={f.nameOf} />;
        })}
      </div>
    </div>
  );
}
