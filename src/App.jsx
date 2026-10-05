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

// Colorful tennis-player silhouettes (serve/ready/smash poses, mixed
// men and women — a ponytail + flared skirt distinguishes the women)
// as a decorative background band across the nav bar, instead of a
// stock photo. Pure SVG shapes, no image asset. Absolutely positioned
// behind the nav content (see Nav()), at partial opacity so the colors
// stay vivid without fighting the white/gold text on top of it.
function PlayerSilhouettes({ className }) {
  // Start well clear of x=0 — that zone sits behind the brand text on
  // the left, where a figure (especially a gold one) muddies contrast.
  const figures = [
    { id: 'female-ready', x: 480, scale: -0.8, color: '#ffffff' },
    { id: 'female-serve', x: 590, scale: 0.75, color: '#5fcf9e' },
    { id: 'male-smash', x: 700, scale: -0.85, color: '#f5c344' },
    { id: 'male-ready', x: 810, scale: 0.8, color: '#ffffff' },
    { id: 'female-serve', x: 920, scale: -0.75, color: '#f5c344' },
    { id: 'female-ready', x: 1030, scale: 0.8, color: '#5fcf9e' },
    { id: 'male-serve', x: 1140, scale: -0.85, color: '#ffffff' },
    { id: 'male-smash', x: 1250, scale: 0.75, color: '#5fcf9e' },
    { id: 'female-serve', x: 1360, scale: -0.8, color: '#f5c344' },
  ];
  return (
    <svg className={className} viewBox="0 0 1400 160" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        {/* Male, serving: legs in a lunge, one arm up with racket */}
        <g id="male-serve">
          <circle cx="0" cy="-92" r="10" />
          <path d="M -9 -78 Q 0 -86 9 -78 L 13 -40 Q 14 -30 6 -28 L 6 -4 L 16 38 L 8 40 L -1 -2 L -8 40 L -16 38 L -8 -4 L -8 -28 Q -16 -30 -13 -40 Z" />
          <path d="M 9 -78 L 30 -100 L 36 -96 L 20 -70 Z" />
          <ellipse cx="38" cy="-104" rx="4" ry="16" transform="rotate(35 38 -104)" />
          <path d="M -9 -78 L -26 -64 L -22 -58 L -4 -70 Z" />
        </g>
        {/* Female, serving: ponytail + flared skirt */}
        <g id="female-serve">
          <circle cx="0" cy="-92" r="10" />
          <path d="M -6 -103 Q 8 -108 7 -95 Q 12 -92 7 -87 L 1 -89 Z" />
          <path d="M -9 -78 Q 0 -86 9 -78 L 12 -44 Q 20 -39 13 -35 L -13 -35 Q -20 -39 -12 -44 Z" />
          <path d="M -8 -35 L -14 36 L -7 38 L 0 -6 L 7 38 L 14 36 L 8 -35 Z" />
          <path d="M 9 -78 L 30 -100 L 36 -96 L 20 -70 Z" />
          <ellipse cx="38" cy="-104" rx="4" ry="16" transform="rotate(35 38 -104)" />
          <path d="M -9 -78 L -26 -64 L -22 -58 L -4 -70 Z" />
        </g>
        {/* Male, ready stance: wide base, racket out front */}
        <g id="male-ready">
          <circle cx="0" cy="-88" r="10" />
          <path d="M -9 -74 Q 0 -80 9 -74 L 12 -36 L -12 -36 Z" />
          <path d="M -8 -36 L -20 36 L -12 38 L -2 -4 L 2 -4 L 12 38 L 20 36 L 8 -36 Z" />
          <path d="M -9 -70 L -28 -52 L -22 -46 L -2 -62 Z" />
          <path d="M 9 -70 L 24 -48 L 18 -42 L 2 -62 Z" />
          <ellipse cx="30" cy="-44" rx="3.5" ry="13" transform="rotate(-60 30 -44)" />
        </g>
        {/* Female, ready stance */}
        <g id="female-ready">
          <circle cx="0" cy="-88" r="10" />
          <path d="M -6 -99 Q 8 -104 7 -91 Q 12 -88 7 -83 L 1 -85 Z" />
          <path d="M -9 -74 Q 0 -80 9 -74 L 11 -42 Q 18 -38 12 -34 L -12 -34 Q -18 -38 -11 -42 Z" />
          <path d="M -8 -34 L -16 36 L -9 38 L 0 -4 L 9 38 L 16 36 L 8 -34 Z" />
          <path d="M -9 -70 L -28 -52 L -22 -46 L -2 -62 Z" />
          <path d="M 9 -70 L 24 -48 L 18 -42 L 2 -62 Z" />
          <ellipse cx="30" cy="-44" rx="3.5" ry="13" transform="rotate(-60 30 -44)" />
        </g>
        {/* Male, overhead smash: legs together, arm fully extended up */}
        <g id="male-smash">
          <circle cx="0" cy="-96" r="10" />
          <path d="M -8 -82 Q 0 -90 8 -82 L 10 -38 L -10 -38 Z" />
          <path d="M -7 -38 L -12 36 L -4 38 L 0 -2 L 4 38 L 12 36 L 7 -38 Z" />
          <path d="M -8 -82 L -22 -70 L -18 -64 L -4 -74 Z" />
          <path d="M 8 -82 L 14 -112 L 20 -110 L 16 -78 Z" />
          <ellipse cx="24" cy="-120" rx="4" ry="15" transform="rotate(15 24 -120)" />
        </g>
      </defs>
      {figures.map((f, i) => (
        <g key={i} transform={`translate(${f.x},120) scale(${f.scale})`}>
          <use href={`#${f.id}`} fill={f.color} />
        </g>
      ))}
    </svg>
  );
}

const navLinkClass = 'text-teal-100 hover:text-white font-semibold uppercase text-xs tracking-wide border-b-2 border-transparent hover:border-accent-400 transition-colors pb-0.5';
const dropdownLinkClass = 'block px-4 py-2 text-teal-100 hover:text-white hover:bg-teal-800 font-semibold uppercase text-xs tracking-wide transition-colors whitespace-nowrap';

// A reusable "label ▾" nav dropdown — used for groups of closely
// related pages that would otherwise each be their own top-level nav
// item: public Teams/Fixtures Calendar/Clubs, and, admin-only, Setup
// (Seasons -> Divisions -> Bulk Upload -> Manage Teams -> Team Logins,
// the order an admin actually sets a season up in), Grouping+Fixtures
// (scheduling), Update Scores+Final Results (score entry), and
// Content+Messages+About. See the NavDropdown calls in Nav() below.
function NavDropdown({ label, items }) {
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
        {label} <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute left-0 top-full mt-2 bg-teal-900 border-2 border-accent-500 rounded shadow-lg py-1 z-10"
        >
          {items.map((item) => (
            <Link key={item.to} to={item.to} className={dropdownLinkClass}>{item.label}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Nav() {
  const { role, signOut } = useAuth();
  return (
    <nav className="no-print relative overflow-hidden bg-teal-900 border-b-4 border-accent-500 shadow-md">
      <PlayerSilhouettes className="absolute inset-0 w-full h-full opacity-50 pointer-events-none" />
      <div className="relative px-4 py-3 flex flex-wrap gap-x-5 gap-y-2 items-center text-sm">
      <Link to="/standings" className="flex flex-col leading-none mr-1">
        <span className="hidden sm:block text-accent-400 text-[9px] font-bold uppercase tracking-wide">Kovai Tennis League Association Trust</span>
        <span className="font-extrabold uppercase text-white text-lg tracking-wide">Kovai Legends 40+</span>
        <span className="text-teal-200 text-[9px] font-bold uppercase tracking-[0.2em]">Fun . Friendship . Fitness</span>
      </Link>
      <Link to="/results" className={navLinkClass}>Results</Link>
      <Link to="/rising-stars" className={navLinkClass}>Rising Stars</Link>
      <NavDropdown
        label="Teams"
        items={[
          { to: '/teams', label: 'Teams' },
          { to: '/fixtures-calendar', label: 'Fixtures Calendar' },
          { to: '/clubs', label: 'Clubs' },
        ]}
      />
      {role === 'team' && (
        <Link to="/my-team" className={navLinkClass}>My Team</Link>
      )}
      {(role === 'tournament_admin' || role === 'super_admin') && (
        <>
          <NavDropdown
            label="Setup"
            items={[
              { to: '/admin/seasons', label: 'Seasons' },
              { to: '/admin/divisions', label: 'Divisions' },
              { to: '/admin/bulk-upload', label: 'Bulk Upload' },
              { to: '/admin/teams', label: 'Manage Teams' },
              { to: '/admin/login-credentials', label: 'Team Logins' },
            ]}
          />
          <NavDropdown
            label="Grouping"
            items={[
              { to: '/admin/grouping', label: 'Grouping' },
              { to: '/admin/fixtures', label: 'Fixtures' },
            ]}
          />
          <NavDropdown
            label="Scores"
            items={[
              { to: '/admin/update-scores', label: 'Update Scores' },
              { to: '/admin/final-results', label: 'Final Results' },
            ]}
          />
          <Link to="/admin/missing-scores" className={navLinkClass}>Missing Scores</Link>
          <NavDropdown
            label="About"
            items={[
              { to: '/admin/content', label: 'Content' },
              { to: '/admin/messages', label: 'Messages' },
              { to: '/about', label: 'About' },
            ]}
          />
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