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
// Decorative tennis strip along the bottom of the nav bar, below the
// menu row rather than behind it — so it never competes with the
// clickable text above. A fixed-size SVG tile repeated via CSS
// background-image (so its on-screen size is pinned, not stretched to
// the browser's width like a viewBox+slice SVG would be), with only a
// few, larger figures and tennis balls per tile — sparser than a
// densely-packed row, which read as visual noise at full page width.
// Figure gradients use userSpaceOnUse with coordinates matching each
// path's own geometry, so colour flows smoothly across the whole
// silhouette instead of being computed per separate shape.
const NAV_STRIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 200">
  <defs>
    <radialGradient id="navfig-ball" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#eaff7a"/>
      <stop offset="1" stop-color="#9ad028"/>
    </radialGradient>
    <!-- Vivid multi-hue blends (head to feet), not a single flat colour —
         userSpaceOnUse so the colour flows smoothly across each figure's
         separate limb strokes instead of each one computing its own
         gradient independently. -->
    <linearGradient id="navfig-gradA" x1="0" y1="-115" x2="0" y2="55" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3b5fe0"/>
      <stop offset="0.35" stop-color="#9345d6"/>
      <stop offset="0.65" stop-color="#e94f9c"/>
      <stop offset="1" stop-color="#ffb23e"/>
    </linearGradient>
    <linearGradient id="navfig-gradB" x1="0" y1="-115" x2="0" y2="55" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7c3fe0"/>
      <stop offset="0.4" stop-color="#e94f6a"/>
      <stop offset="0.7" stop-color="#ff8a3d"/>
      <stop offset="1" stop-color="#ffd54a"/>
    </linearGradient>
    <g id="navfig-ball-icon">
      <circle cx="0" cy="0" r="11" fill="url(#navfig-ball)"/>
      <path d="M 0 -11 C -8 -8, -8 8, 0 11" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0.85"/>
      <path d="M 0 -11 C 8 -8, 8 8, 0 11" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0.85"/>
    </g>
    <!-- Four flat-colour action poses — a head, a thick torso stroke, limb
         strokes with round caps, and an open-ring racket (no fill, just a
         stroked circle) at the swinging hand. Legs start slightly inside
         the torso's own bottom so its round cap doesn't peek out as a
         bump at the hip. -->
    <g id="navfig-serve">
      <circle cx="0" cy="-85" r="9"/>
      <line x1="0" y1="-74" x2="0" y2="-22" stroke-width="16"/>
      <line x1="0" y1="-24" x2="-10" y2="55" stroke-width="13"/>
      <line x1="0" y1="-24" x2="10" y2="55" stroke-width="13"/>
      <line x1="0" y1="-65" x2="28" y2="-95" stroke-width="11"/>
      <line x1="0" y1="-65" x2="-22" y2="-90" stroke-width="11"/>
      <circle cx="34" cy="-100" r="12" fill="none" stroke-width="5"/>
    </g>
    <g id="navfig-forehand-high">
      <circle cx="0" cy="-85" r="9"/>
      <line x1="0" y1="-74" x2="0" y2="-22" stroke-width="16"/>
      <line x1="0" y1="-24" x2="-35" y2="50" stroke-width="13"/>
      <line x1="0" y1="-24" x2="30" y2="50" stroke-width="13"/>
      <line x1="0" y1="-65" x2="45" y2="-72" stroke-width="11"/>
      <line x1="0" y1="-65" x2="-35" y2="-60" stroke-width="11"/>
      <circle cx="54" cy="-74" r="12" fill="none" stroke-width="5"/>
    </g>
    <g id="navfig-forehand-low">
      <circle cx="0" cy="-85" r="9"/>
      <line x1="0" y1="-74" x2="0" y2="-22" stroke-width="16"/>
      <line x1="0" y1="-24" x2="-30" y2="50" stroke-width="13"/>
      <line x1="0" y1="-24" x2="35" y2="50" stroke-width="13"/>
      <line x1="0" y1="-65" x2="40" y2="-35" stroke-width="11"/>
      <line x1="0" y1="-65" x2="-30" y2="-70" stroke-width="11"/>
      <circle cx="48" cy="-30" r="12" fill="none" stroke-width="5"/>
    </g>
    <g id="navfig-jump-smash">
      <circle cx="0" cy="-85" r="9"/>
      <line x1="0" y1="-74" x2="0" y2="-22" stroke-width="16"/>
      <line x1="0" y1="-24" x2="-18" y2="-2" stroke-width="13"/>
      <line x1="-18" y1="-2" x2="-9" y2="24" stroke-width="12"/>
      <line x1="0" y1="-24" x2="16" y2="-6" stroke-width="13"/>
      <line x1="16" y1="-6" x2="8" y2="20" stroke-width="12"/>
      <line x1="0" y1="-65" x2="22" y2="-98" stroke-width="11"/>
      <line x1="0" y1="-65" x2="-18" y2="-92" stroke-width="11"/>
      <circle cx="28" cy="-104" r="12" fill="none" stroke-width="5"/>
    </g>
  </defs>
  <g stroke-linecap="round">
    <use href="#navfig-ball-icon" transform="translate(60,70)"/>
    <g transform="translate(190,134)" fill="url(#navfig-gradA)" stroke="url(#navfig-gradA)"><use href="#navfig-serve"/></g>
    <use href="#navfig-ball-icon" transform="translate(360,140)"/>
    <g transform="translate(500,134)" fill="url(#navfig-gradB)" stroke="url(#navfig-gradB)"><use href="#navfig-forehand-high"/></g>
    <use href="#navfig-ball-icon" transform="translate(680,50)"/>
    <g transform="translate(820,134) scale(-1,1)" fill="url(#navfig-gradA)" stroke="url(#navfig-gradA)"><use href="#navfig-forehand-low"/></g>
    <use href="#navfig-ball-icon" transform="translate(1000,160)"/>
    <g transform="translate(1140,118)" fill="url(#navfig-gradB)" stroke="url(#navfig-gradB)"><use href="#navfig-jump-smash"/></g>
    <use href="#navfig-ball-icon" transform="translate(1320,90)"/>
  </g>
</svg>`;

const navStripStyle = {
  backgroundColor: '#0d2a26',
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(NAV_STRIP_SVG)}")`,
  backgroundRepeat: 'repeat-x',
  backgroundPosition: 'left bottom',
  backgroundSize: 'auto 64px',
};

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
    <nav className="no-print bg-teal-900 border-b-4 border-accent-500 shadow-md">
      <div className="px-4 py-3 flex flex-wrap gap-x-5 gap-y-2 items-center text-sm">
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
              { to: '/admin/missing-scores', label: 'Missing Scores' },
              { to: '/admin/final-results', label: 'Final Results' },
            ]}
          />
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
      <div className="h-[64px]" style={navStripStyle} aria-hidden="true" />
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