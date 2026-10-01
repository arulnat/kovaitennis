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
import FinalResultsAdminPage from './pages/admin/FinalResultsAdminPage.jsx';
import ScoreEntryPage from './pages/team/ScoreEntryPage.jsx';
import MyTeamPage from './pages/team/MyTeamPage.jsx';
import StandingsPage from './pages/public/StandingsPage.jsx';
import ResultsPage from './pages/public/ResultsPage.jsx';
import FixturesCalendarPage from './pages/public/FixturesCalendarPage.jsx';
import TeamProfilePage from './pages/public/TeamProfilePage.jsx';
import TeamsDirectoryPage from './pages/public/TeamsDirectoryPage.jsx';
import PlayerProfilePage from './pages/public/PlayerProfilePage.jsx';
import RisingStarsPage from './pages/public/RisingStarsPage.jsx';
import ClubsPage from './pages/public/ClubsPage.jsx';
import ClubProfilePage from './pages/public/ClubProfilePage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import DatabaseAdminPage from './pages/admin/DatabaseAdminPage.jsx';
import MessagesPage from './pages/admin/MessagesPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ContactUsPage from './pages/ContactUsPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <SeasonProvider>
        <BrowserRouter>
          <Nav />
          <Routes>
            <Route path="/" element={<Navigate to="/standings" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/contact" element={<ContactUsPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Public (Req 10.5 — no login required) */}
            <Route path="/standings" element={<StandingsRouteWrapper />} />
            <Route path="/results" element={<ResultsRouteWrapper />} />
            <Route path="/fixtures-calendar" element={<FixturesCalendarRouteWrapper />} />
            <Route path="/rising-stars" element={<RisingStarsRouteWrapper />} />
            <Route path="/team/:teamId" element={<TeamProfileRouteWrapper />} />
            <Route path="/teams" element={<TeamsDirectoryRouteWrapper />} />
            <Route path="/player/:playerId" element={<PlayerProfileRouteWrapper />} />
            <Route path="/clubs" element={<ClubsRouteWrapper />} />
            <Route path="/club/:clubId" element={<ClubProfileRouteWrapper />} />

            {/* Score entry — either captain, or an admin doing it on their behalf (Req 5.2) */}
            <Route path="/score/:fixtureId" element={<RequireRole roles={['team', 'tournament_admin', 'super_admin']}><ScoreEntryRouteWrapper /></RequireRole>} />

            {/* Self-service team roster editing — captain only, on their own team */}
            <Route path="/my-team" element={<RequireRole roles={['team']}><MyTeamPage /></RequireRole>} />

            {/* Admin */}
            <Route path="/admin/bulk-upload" element={<RequireRole roles={['tournament_admin', 'super_admin']}><BulkUploadRouteWrapper /></RequireRole>} />
            <Route path="/admin/login-credentials" element={<RequireRole roles={['tournament_admin', 'super_admin']}><LoginCredentialsPage /></RequireRole>} />
            <Route path="/admin/teams" element={<RequireRole roles={['tournament_admin', 'super_admin']}><TeamsRouteWrapper /></RequireRole>} />
            <Route path="/admin/teams/:teamId/roster" element={<RequireRole roles={['tournament_admin', 'super_admin']}><AdminTeamRosterRouteWrapper /></RequireRole>} />
            <Route path="/admin/divisions" element={<RequireRole roles={['tournament_admin', 'super_admin']}><DivisionsPage /></RequireRole>} />
            <Route path="/admin/grouping" element={<RequireRole roles={['tournament_admin', 'super_admin']}><GroupingRouteWrapper /></RequireRole>} />
            <Route path="/admin/fixtures" element={<RequireRole roles={['tournament_admin', 'super_admin']}><FixtureRouteWrapper /></RequireRole>} />
            <Route path="/admin/update-scores" element={<RequireRole roles={['tournament_admin', 'super_admin']}><UpdateScoresRouteWrapper /></RequireRole>} />
            <Route path="/admin/missing-scores" element={<RequireRole roles={['tournament_admin', 'super_admin']}><MissingScoresRouteWrapper /></RequireRole>} />
            <Route path="/admin/final-results" element={<RequireRole roles={['tournament_admin', 'super_admin']}><FinalResultsAdminPage /></RequireRole>} />
            <Route path="/admin/content" element={<RequireRole roles={['tournament_admin', 'super_admin']}><ContentRouteWrapper /></RequireRole>} />
            <Route path="/admin/seasons" element={<RequireRole roles={['tournament_admin', 'super_admin']}><SeasonsPage /></RequireRole>} />
            <Route path="/about" element={<RequireRole roles={['tournament_admin', 'super_admin']}><AboutPage /></RequireRole>} />
            <Route path="/admin/database" element={<RequireRole roles={['super_admin']}><DatabaseAdminPage /></RequireRole>} />
            <Route path="/admin/messages" element={<RequireRole roles={['tournament_admin', 'super_admin']}><MessagesPage /></RequireRole>} />
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
      <Link to="/results" className={navLinkClass}>Results</Link>
      <Link to="/fixtures-calendar" className={navLinkClass}>Fixtures Calendar</Link>
      <Link to="/rising-stars" className={navLinkClass}>Rising Stars</Link>
      <Link to="/clubs" className={navLinkClass}>Clubs</Link>
      <Link to="/teams" className={navLinkClass}>Teams</Link>
      {role === 'team' && (
        <Link to="/my-team" className={navLinkClass}>My Team</Link>
      )}
      {(role === 'tournament_admin' || role === 'super_admin') && (
        <>
          <SetupMenu />
          <Link to="/admin/teams" className={navLinkClass}>Manage Teams</Link>
          <Link to="/admin/grouping" className={navLinkClass}>Grouping</Link>
          <Link to="/admin/fixtures" className={navLinkClass}>Fixtures</Link>
          <Link to="/admin/update-scores" className={navLinkClass}>Update Scores</Link>
          <Link to="/admin/missing-scores" className={navLinkClass}>Missing Scores</Link>
          <Link to="/admin/final-results" className={navLinkClass}>Final Results</Link>
          <Link to="/admin/content" className={navLinkClass}>Content</Link>
          <Link to="/admin/messages" className={navLinkClass}>Messages</Link>
          <Link to="/about" className={navLinkClass}>About</Link>
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
function ResultsRouteWrapper() {
  // NeedsSeason only, not NeedsDivision — ResultsPage's own Final
  // Results tab is season-wide (no division), so it must still be
  // reachable with no division selected/created.
  return (
    <NeedsSeason>
      <ResultsPage />
    </NeedsSeason>
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
function PlayerProfileRouteWrapper() {
  const { seasonId } = useSeason();
  const { playerId } = useParams();
  return <PlayerProfilePage seasonId={seasonId} playerId={playerId} />;
}
function TeamsDirectoryRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <TeamsDirectoryPage seasonId={seasonId} />
    </NeedsSeason>
  );
}
function AdminTeamRosterRouteWrapper() {
  const { teamId } = useParams();
  return <MyTeamPage teamId={teamId} isAdminView />;
}
function ClubsRouteWrapper() {
  return <ClubsPage />;
}
function ClubProfileRouteWrapper() {
  const { clubId } = useParams();
  return <ClubProfilePage clubId={clubId} />;
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
  // Not wrapped in NeedsSeason — orphaned teams (in no season at all,
  // e.g. left behind by a purge) need to be visible and deletable here
  // even when there's currently no season to select at all.
  return <TeamsPage seasonId={seasonId} />;
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