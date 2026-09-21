// src/App.jsx — top-level routing for the MVP (HP-priority) screens.
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, RequireRole } from './lib/auth.jsx';

import BulkUploadPage from './pages/admin/BulkUploadPage.jsx';
import FixtureGenerationPage from './pages/admin/FixtureGenerationPage.jsx';
import MissingScoresReportPage from './pages/admin/MissingScoresReportPage.jsx';
import ContentManagementPage from './pages/admin/ContentManagementPage.jsx';
import TestSeasonPage from './pages/admin/TestSeasonPage.jsx';
import ScoreEntryPage from './pages/team/ScoreEntryPage.jsx';
import StandingsPage from './pages/public/StandingsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<Navigate to="/standings" replace />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Public (Req 10.5 — no login required) */}
          <Route path="/standings" element={<StandingsPageWrapper />} />

          {/* Team (captain login required) */}
          <Route path="/score/:fixtureId" element={<RequireRole roles={['team']}><ScoreEntryRouteWrapper /></RequireRole>} />

          {/* Admin */}
          <Route path="/admin/bulk-upload" element={<RequireRole roles={['tournament_admin', 'super_admin']}><BulkUploadRouteWrapper /></RequireRole>} />
          <Route path="/admin/fixtures" element={<RequireRole roles={['tournament_admin', 'super_admin']}><FixtureRouteWrapper /></RequireRole>} />
          <Route path="/admin/missing-scores" element={<RequireRole roles={['tournament_admin', 'super_admin']}><MissingScoresRouteWrapper /></RequireRole>} />
          <Route path="/admin/content" element={<RequireRole roles={['tournament_admin', 'super_admin']}><ContentRouteWrapper /></RequireRole>} />
          <Route path="/admin/test-season" element={<RequireRole roles={['tournament_admin', 'super_admin']}><TestSeasonPage /></RequireRole>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function Nav() {
  const { role, signOut } = useAuth();
  return (
    <nav className="border-b p-3 flex gap-4 text-sm items-center">
      <Link to="/standings" className="font-semibold">Tennis League</Link>
      {(role === 'tournament_admin' || role === 'super_admin') && (
        <>
          <Link to="/admin/bulk-upload">Bulk Upload</Link>
          <Link to="/admin/fixtures">Fixtures</Link>
          <Link to="/admin/missing-scores">Missing Scores</Link>
          <Link to="/admin/content">Content</Link>
          <Link to="/admin/test-season">Test Season</Link>
        </>
      )}
      <div className="ml-auto">
        {role ? <button onClick={signOut} className="text-gray-500">Sign out</button> : <Link to="/login">Login</Link>}
      </div>
    </nav>
  );
}

// --- Wrapper components pull IDs from context/URL in a real router setup.
// These are left as simple examples wiring a hardcoded/selected season —
// swap in useParams()/a season-selector context as the app grows beyond MVP.

function StandingsPageWrapper() {
  // TODO: replace with a real season/division selector
  return <StandingsPage seasonId={window.__ACTIVE_SEASON_ID__} divisionId={window.__ACTIVE_DIVISION_ID__} />;
}
function ScoreEntryRouteWrapper() {
  const fixtureId = window.location.pathname.split('/').pop();
  return <ScoreEntryPage fixtureId={fixtureId} />;
}
function BulkUploadRouteWrapper() {
  return <BulkUploadPage seasonId={window.__ACTIVE_SEASON_ID__} />;
}
function FixtureRouteWrapper() {
  return <FixtureGenerationPage seasonId={window.__ACTIVE_SEASON_ID__} divisionId={window.__ACTIVE_DIVISION_ID__} startWeekend={window.__SEASON_START_WEEKEND__} />;
}
function MissingScoresRouteWrapper() {
  return <MissingScoresReportPage seasonId={window.__ACTIVE_SEASON_ID__} />;
}
function ContentRouteWrapper() {
  return <ContentManagementPage seasonId={window.__ACTIVE_SEASON_ID__} />;
}
