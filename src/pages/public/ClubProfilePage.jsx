// src/pages/public/ClubProfilePage.jsx
//
// A club's own page: every one of its teams (across divisions), and a
// week-by-week view of every fixture involving any of them — which side
// is home (needs the shared court), which is away, and who the
// opponent is. Several teams from the same club playing in the same
// week is exactly the scheduling clash this page exists to surface, so
// club officials can coordinate court time before match day, not after.
//
// Public, gated on the season being published — same as the Clubs
// directory and Fixtures Calendar — since there's nothing to coordinate
// before a schedule exists.

import { useEffect, useState } from 'react';
import { useSeason } from '../../lib/seasonContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import TeamLink from '../../components/TeamLink.jsx';

const ALL_WEEKS = '__all__';
const COURT_TYPE_LABEL = { synthetic: 'Synthetic', clay: 'Clay', both: 'Synthetic and Clay' };

function formatWeekDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ClubProfilePage({ clubId }) {
  const { seasonId, activeSeason } = useSeason();
  const [club, setClub] = useState(null); // null = loading, false = not found
  const [teams, setTeams] = useState([]);
  const [fixtures, setFixtures] = useState(null); // null = loading
  const [weekDate, setWeekDate] = useState(ALL_WEEKS);

  useEffect(() => { setWeekDate(ALL_WEEKS); }, [clubId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: clubRow } = await supabase.from('clubs').select('id, name, location, address, number_of_courts, court_type').eq('id', clubId).maybeSingle();
      if (cancelled) return;
      if (!clubRow) { setClub(false); return; }
      setClub(clubRow);

      if (!seasonId || !activeSeason?.published) { setFixtures([]); return; }

      const { data: teamRows } = await supabase
        .from('team_seasons')
        .select('team_id, teams!inner(id, name, club_id), divisions(name)')
        .eq('season_id', seasonId)
        .eq('teams.club_id', clubId);
      if (cancelled) return;
      const teamList = (teamRows || []).map((r) => ({ id: r.team_id, name: r.teams.name, divisionName: r.divisions?.name ?? '—' }));
      setTeams(teamList);

      const teamIds = teamList.map((t) => t.id);
      if (teamIds.length === 0) { setFixtures([]); return; }

      const orFilter = teamIds.map((id) => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(',');
      const { data: fixtureRows } = await supabase
        .from('fixtures')
        .select(`
          id, week_date, is_bye, home_team_id, away_team_id,
          divisions(name),
          teams_home:teams!fixtures_home_team_id_fkey(id, name),
          teams_away:teams!fixtures_away_team_id_fkey(id, name)
        `)
        .eq('season_id', seasonId)
        .or(orFilter)
        .order('week_date');
      if (cancelled) return;

      const teamIdSet = new Set(teamIds);
      setFixtures((fixtureRows || []).map((f) => ({
        ...f,
        homeIsClub: teamIdSet.has(f.home_team_id),
        awayIsClub: teamIdSet.has(f.away_team_id),
      })));
    }
    load();
    return () => { cancelled = true; };
  }, [seasonId, activeSeason?.published, clubId]);

  if (club === null) return <p className="p-6 text-gray-500">Loading…</p>;
  if (club === false) return <p className="p-6 text-gray-500">Club not found.</p>;

  const weekOptions = [...new Set((fixtures || []).map((f) => f.week_date))].sort();
  const shownFixtures = weekDate === ALL_WEEKS ? fixtures : (fixtures || []).filter((f) => f.week_date === weekDate);

  const weeks = new Map();
  for (const f of shownFixtures || []) {
    if (!weeks.has(f.week_date)) weeks.set(f.week_date, []);
    weeks.get(f.week_date).push(f);
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader title={club.name} subtitle="This club's teams and their matches, week by week — home matches are the ones needing the shared court." />

      {(club.location || club.address || club.number_of_courts || club.court_type) && (
        <div className="mb-4 rounded-lg overflow-hidden shadow-lg">
          {[
            ...(club.location ? [{ label: 'Location', value: club.location }] : []),
            ...(club.address ? [{ label: 'Address', value: club.address }] : []),
            ...(club.number_of_courts ? [{ label: 'Courts', value: club.number_of_courts }] : []),
            ...(club.court_type ? [{ label: 'Court Type', value: COURT_TYPE_LABEL[club.court_type] ?? club.court_type }] : []),
          ].map((r, i) => (
            <div key={r.label} className={`flex items-center justify-between px-4 py-2.5 ${i % 2 === 0 ? 'bg-teal-900 text-teal-50' : 'bg-teal-800 text-teal-50'}`}>
              <span className="text-xs font-bold uppercase tracking-wider">{r.label}</span>
              <span className="text-base font-extrabold text-right">{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {teams.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 border-b-2 border-accent-500 pb-1 mb-2">
            Teams ({teams.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <TeamLink key={t.id} teamId={t.id} className="px-3 py-1.5 rounded bg-teal-50 text-teal-900 text-sm font-semibold hover:bg-teal-100">
                {t.name} <span className="text-teal-600 font-normal">— {t.divisionName}</span>
              </TeamLink>
            ))}
          </div>
        </div>
      )}

      {!activeSeason?.published ? (
        <p className="text-slate-500 text-sm">The season hasn't been published yet.</p>
      ) : fixtures === null ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : teams.length === 0 ? (
        <p className="text-gray-500 text-sm">No teams from this club are registered this season.</p>
      ) : (
        <>
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

          {shownFixtures.length === 0 ? (
            <p className="text-gray-500 text-sm">No matches found.</p>
          ) : (
            [...weeks.entries()].map(([week, weekFixtures]) => (
              <div key={week} className="rounded-lg overflow-hidden shadow-lg mb-4">
                <div className="bg-accent-500 text-teal-950 text-xs font-extrabold uppercase tracking-wide px-3 py-1.5">
                  {formatWeekDate(week)}
                </div>
                <div className="divide-y bg-white">
                  {weekFixtures.map((f) => {
                    if (f.is_bye) {
                      const restingName = f.homeIsClub ? f.teams_home?.name : f.teams_away?.name;
                      return (
                        <div key={f.id} className="px-4 py-3 flex items-center justify-between text-sm">
                          <span className="font-semibold text-slate-700">{restingName}</span>
                          <span className="inline-block bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded">Rest</span>
                        </div>
                      );
                    }
                    return (
                      <div key={f.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <span className={`font-semibold ${f.homeIsClub ? 'text-teal-900' : 'text-slate-500'}`}>
                            {f.teams_home?.name}
                          </span>
                          {f.homeIsClub && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-accent-500 text-teal-950 text-[10px] font-extrabold uppercase tracking-wide">Home</span>
                          )}
                          <span className="mx-2 text-gray-400">vs</span>
                          <span className={`font-semibold ${f.awayIsClub ? 'text-teal-900' : 'text-slate-500'}`}>
                            {f.teams_away?.name}
                          </span>
                          {f.awayIsClub && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-extrabold uppercase tracking-wide">Away</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 shrink-0">{f.divisions?.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
