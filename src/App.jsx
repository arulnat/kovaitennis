// src/App.jsx — top-level routing for the MVP (HP-priority) screens.
import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth, RequireRole } from './lib/auth.jsx';
import { SeasonProvider, useSeason, SeasonSelector } from './lib/seasonContext.jsx';

import BulkUploadPage from './pages/admin/BulkUploadPage.jsx';
import LoginCredentialsPage from './pages/admin/LoginCredentialsPage.jsx';
import TeamsPage from './pages/admin/TeamsPage.jsx';
import DivisionsPage from './pages/admin/DivisionsPage.jsx';
import GroupingPage from './pages/admin/GroupingPage.jsx';
import FixtureGenerationPage from './pages/admin/FixtureGenerationPage.jsx';
import MissingScoresReportPage from './pages/admin/MissingScoresReportPage.jsx';
import UpdateScoresPage from './pages/admin/UpdateScoresPage.jsx';
import ContentManagementPage from './pages/admin/ContentManagementPage.jsx';
import SeasonsPage from './pages/admin/SeasonsPage.jsx';
import ScoreEntryPage from './pages/team/ScoreEntryPage.jsx';
import StandingsPage from './pages/public/StandingsPage.jsx';
import FixturesCalendarPage from './pages/public/FixturesCalendarPage.jsx';
import TeamProfilePage from './pages/public/TeamProfilePage.jsx';
import RisingStarsPage from './pages/public/RisingStarsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <SeasonProvider>
        <BrowserRouter>
          <Nav />
          <Routes>
            <Route path="/" element={<Navigate to="/standings" replace />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Public (Req 10.5 — no login required) */}
            <Route path="/standings" element={<StandingsRouteWrapper />} />
            <Route path="/fixtures-calendar" element={<FixturesCalendarRouteWrapper />} />
            <Route path="/rising-stars" element={<RisingStarsRouteWrapper />} />
            <Route path="/team/:teamId" element={<TeamProfileRouteWrapper />} />

            {/* Score entry — either captain, or an admin doing it on their behalf (Req 5.2) */}
            <Route path="/score/:fixtureId" element={<RequireRole roles={['team', 'tournament_admin', 'super_admin']}><ScoreEntryRouteWrapper /></RequireRole>} />

            {/* Admin */}
            <Route path="/admin/bulk-upload" element={<RequireRole roles={['tournament_admin', 'super_admin']}><BulkUploadRouteWrapper /></RequireRole>} />
            <Route path="/admin/login-credentials" element={<RequireRole roles={['tournament_admin', 'super_admin']}><LoginCredentialsPage /></RequireRole>} />
            <Route path="/admin/teams" element={<RequireRole roles={['tournament_admin', 'super_admin']}><TeamsRouteWrapper /></RequireRole>} />
            <Route path="/admin/divisions" element={<RequireRole roles={['tournament_admin', 'super_admin']}><DivisionsPage /></RequireRole>} />
            <Route path="/admin/grouping" element={<RequireRole roles={['tournament_admin', 'super_admin']}><GroupingRouteWrapper /></RequireRole>} />
            <Route path="/admin/fixtures" element={<RequireRole roles={['tournament_admin', 'super_admin']}><FixtureRouteWrapper /></RequireRole>} />
            <Route path="/admin/update-scores" element={<RequireRole roles={['tournament_admin', 'super_admin']}><UpdateScoresRouteWrapper /></RequireRole>} />
            <Route path="/admin/missing-scores" element={<RequireRole roles={['tournament_admin', 'super_admin']}><MissingScoresRouteWrapper /></RequireRole>} />
            <Route path="/admin/content" element={<RequireRole roles={['tournament_admin', 'super_admin']}><ContentRouteWrapper /></RequireRole>} />
            <Route path="/admin/seasons" element={<RequireRole roles={['tournament_admin', 'super_admin']}><SeasonsPage /></RequireRole>} />
          </Routes>
        </BrowserRouter>
      </SeasonProvider>
    </AuthProvider>
  );
}

const navLinkClass = 'text-teal-100 hover:text-white font-semibold uppercase text-xs tracking-wide border-b-2 border-transparent hover:border-accent-400 transition-colors pb-0.5';
const dropdownLinkClass = 'block px-4 py-2 text-teal-100 hover:text-white hover:bg-teal-800 font-semibold uppercase text-xs tracking-wide transition-colors whitespace-nowrap';

// Seasons -> Divisions -> Bulk Upload -> Team Logins is the order an
// admin actually sets a season up in (logins only exist once teams are
// uploaded), so grouping them under one "Setup" menu, in that order,
// keeps the one-time setup steps together and out of the way of the
// day-to-day admin links, instead of each sitting as its own top-level
// nav item.
function SetupMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`${navLinkClass} flex items-center gap-1`}
      >
        Setup <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute left-0 top-full mt-2 bg-teal-900 border-2 border-accent-500 rounded shadow-lg py-1 z-10"
        >
          <Link to="/admin/seasons" className={dropdownLinkClass}>Seasons</Link>
          <Link to="/admin/divisions" className={dropdownLinkClass}>Divisions</Link>
          <Link to="/admin/bulk-upload" className={dropdownLinkClass}>Bulk Upload</Link>
          <Link to="/admin/login-credentials" className={dropdownLinkClass}>Team Logins</Link>
        </div>
      )}
    </div>
  );
}

function Nav() {
  const { role, signOut } = useAuth();
  return (
    <nav className="no-print bg-teal-900 border-b-4 border-accent-500 px-4 py-3 flex flex-wrap gap-x-5 gap-y-2 text-sm items-center shadow-md">
      <Link to="/standings" className="font-extrabold uppercase text-white text-lg tracking-wide mr-1">
        Tennis League
      </Link>
      <Link to="/fixtures-calendar" className={navLinkClass}>Fixtures Calendar</Link>
      <Link to="/rising-stars" className={navLinkClass}>Rising Stars</Link>
      {(role === 'tournament_admin' || role === 'super_admin') && (
        <>
          <SetupMenu />
          <Link to="/admin/teams" className={navLinkClass}>Teams</Link>
          <Link to="/admin/grouping" className={navLinkClass}>Grouping</Link>
          <Link to="/admin/fixtures" className={navLinkClass}>Fixtures</Link>
          <Link to="/admin/update-scores" className={navLinkClass}>Update Scores</Link>
          <Link to="/admin/missing-scores" className={navLinkClass}>Missing Scores</Link>
          <Link to="/admin/content" className={navLinkClass}>Content</Link>
        </>
      )}
      <SeasonSelector />
      <div className="ml-auto">
        {role ? (
          <button onClick={signOut} className="text-teal-200 hover:text-white font-semibold uppercase text-xs tracking-wide transition-colors">Sign out</button>
        ) : (
          <Link to="/login" className="text-white font-bold uppercase text-xs tracking-wide hover:text-accent-400 transition-colors">Login</Link>
        )}
      </div>
    </nav>
  );
}

// --- Wrapper components pull the active season/division from context
// (set via the picker in the nav bar) rather than a hardcoded global.
// A missing selection shows a clear message instead of a broken query.

function NeedsSeason({ children }) {
  const { seasonId, loading } = useSeason();
  if (loading) return <p className="p-6 text-gray-500">Loading…</p>;
  if (!seasonId) return <p className="p-6 text-gray-500">No season yet — create one under Seasons first.</p>;
  return children;
}

function NeedsDivision({ children }) {
  const { seasonId, divisionId, loading } = useSeason();
  if (loading) return <p className="p-6 text-gray-500">Loading…</p>;
  if (!seasonId) return <p className="p-6 text-gray-500">No season yet — create one under Seasons first.</p>;
  if (!divisionId) return <p className="p-6 text-gray-500">This season has no divisions yet — create one first.</p>;
  return children;
}

function StandingsRouteWrapper() {
  return (
    <NeedsDivision>
      <StandingsPage />
    </NeedsDivision>
  );
}
function FixturesCalendarRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <FixturesCalendarPage seasonId={seasonId} />
    </NeedsSeason>
  );
}
function RisingStarsRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <RisingStarsPage seasonId={seasonId} />
    </NeedsSeason>
  );
}
function TeamProfileRouteWrapper() {
  const { seasonId } = useSeason();
  const { teamId } = useParams();
  return <TeamProfilePage seasonId={seasonId} teamId={teamId} />;
}
function ScoreEntryRouteWrapper() {
  const fixtureId = window.location.pathname.split('/').pop();
  return <ScoreEntryPage fixtureId={fixtureId} />;
}
function BulkUploadRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <BulkUploadPage seasonId={seasonId} />
    </NeedsSeason>
  );
}
function TeamsRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <TeamsPage seasonId={seasonId} />
    </NeedsSeason>
  );
}
function GroupingRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <GroupingPage seasonId={seasonId} />
    </NeedsSeason>
  );
}
function FixtureRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <FixtureGenerationPage seasonId={seasonId} />
    </NeedsSeason>
  );
}
function UpdateScoresRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <UpdateScoresPage seasonId={seasonId} />
    </NeedsSeason>
  );
}
function MissingScoresRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <MissingScoresReportPage seasonId={seasonId} />
    </NeedsSeason>
  );
}
function ContentRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <ContentManagementPage seasonId={seasonId} />
    </NeedsSeason>
  );
}