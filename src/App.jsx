// src/App.jsx — top-level routing for the MVP (HP-priority) screens.
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, RequireRole } from './lib/auth.jsx';
import { SeasonProvider, useSeason, SeasonSelector } from './lib/seasonContext.jsx';

import BulkUploadPage from './pages/admin/BulkUploadPage.jsx';
import LoginCredentialsPage from './pages/admin/LoginCredentialsPage.jsx';
import TeamsPage from './pages/admin/TeamsPage.jsx';
import DivisionsPage from './pages/admin/DivisionsPage.jsx';
import GroupingPage from './pages/admin/GroupingPage.jsx';
import FixtureGenerationPage from './pages/admin/FixtureGenerationPage.jsx';
import MissingScoresReportPage from './pages/admin/MissingScoresReportPage.jsx';
import ContentManagementPage from './pages/admin/ContentManagementPage.jsx';
import SeasonsPage from './pages/admin/SeasonsPage.jsx';
import ScoreEntryPage from './pages/team/ScoreEntryPage.jsx';
import StandingsPage from './pages/public/StandingsPage.jsx';
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

            {/* Team (captain login required) */}
            <Route path="/score/:fixtureId" element={<RequireRole roles={['team']}><ScoreEntryRouteWrapper /></RequireRole>} />

            {/* Admin */}
            <Route path="/admin/bulk-upload" element={<RequireRole roles={['tournament_admin', 'super_admin']}><BulkUploadRouteWrapper /></RequireRole>} />
            <Route path="/admin/login-credentials" element={<RequireRole roles={['tournament_admin', 'super_admin']}><LoginCredentialsPage /></RequireRole>} />
            <Route path="/admin/teams" element={<RequireRole roles={['tournament_admin', 'super_admin']}><TeamsRouteWrapper /></RequireRole>} />
            <Route path="/admin/divisions" element={<RequireRole roles={['tournament_admin', 'super_admin']}><DivisionsPage /></RequireRole>} />
            <Route path="/admin/grouping" element={<RequireRole roles={['tournament_admin', 'super_admin']}><GroupingRouteWrapper /></RequireRole>} />
            <Route path="/admin/fixtures" element={<RequireRole roles={['tournament_admin', 'super_admin']}><FixtureRouteWrapper /></RequireRole>} />
            <Route path="/admin/missing-scores" element={<RequireRole roles={['tournament_admin', 'super_admin']}><MissingScoresRouteWrapper /></RequireRole>} />
            <Route path="/admin/content" element={<RequireRole roles={['tournament_admin', 'super_admin']}><ContentRouteWrapper /></RequireRole>} />
            <Route path="/admin/seasons" element={<RequireRole roles={['tournament_admin', 'super_admin']}><SeasonsPage /></RequireRole>} />
          </Routes>
        </BrowserRouter>
      </SeasonProvider>
    </AuthProvider>
  );
}

function Nav() {
  const { role, signOut } = useAuth();
  return (
    <nav className="border-b p-3 flex flex-wrap gap-4 text-sm items-center">
      <Link to="/standings" className="font-semibold">Tennis League</Link>
      {(role === 'tournament_admin' || role === 'super_admin') && (
        <>
          <Link to="/admin/bulk-upload">Bulk Upload</Link>
          <Link to="/admin/login-credentials">Login Credentials</Link>
          <Link to="/admin/teams">Teams</Link>
          <Link to="/admin/divisions">Divisions</Link>
          <Link to="/admin/grouping">Grouping</Link>
          <Link to="/admin/fixtures">Fixtures</Link>
          <Link to="/admin/missing-scores">Missing Scores</Link>
          <Link to="/admin/content">Content</Link>
          <Link to="/admin/seasons">Seasons</Link>
        </>
      )}
      <SeasonSelector />
      <div className="ml-auto">
        {role ? <button onClick={signOut} className="text-gray-500">Sign out</button> : <Link to="/login">Login</Link>}
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
  if (!divisionId) return <p className="p-6 text-gray-500">This season has no divisions yet — create one first (Req 4.1).</p>;
  return children;
}

function StandingsRouteWrapper() {
  const { seasonId, divisionId } = useSeason();
  return (
    <NeedsDivision>
      <StandingsPage seasonId={seasonId} divisionId={divisionId} />
    </NeedsDivision>
  );
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