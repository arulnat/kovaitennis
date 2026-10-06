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
import ManageScoresPage from './pages/admin/ManageScoresPage.jsx';
import ContentManagementPage from './pages/admin/ContentManagementPage.jsx';
import SeasonsPage from './pages/admin/SeasonsPage.jsx';
import FinalResultsAdminPage from './pages/admin/FinalResultsAdminPage.jsx';
import ScoreEntryPage from './pages/team/ScoreEntryPage.jsx';
import MyTeamPage from './pages/team/MyTeamPage.jsx';
import MyFixturesPage from './pages/team/MyFixturesPage.jsx';
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
            <Route path="/my-fixtures" element={<RequireRole roles={['team']}><MyFixturesPage /></RequireRole>} />

            {/* Admin */}
            <Route path="/admin/bulk-upload" element={<RequireRole roles={['tournament_admin', 'super_admin']}><BulkUploadRouteWrapper /></RequireRole>} />
            <Route path="/admin/login-credentials" element={<RequireRole roles={['tournament_admin', 'super_admin']}><LoginCredentialsPage /></RequireRole>} />
            <Route path="/admin/teams" element={<RequireRole roles={['tournament_admin', 'super_admin']}><TeamsRouteWrapper /></RequireRole>} />
            <Route path="/admin/teams/:teamId/roster" element={<RequireRole roles={['tournament_admin', 'super_admin']}><AdminTeamRosterRouteWrapper /></RequireRole>} />
            <Route path="/admin/divisions" element={<RequireRole roles={['tournament_admin', 'super_admin']}><DivisionsPage /></RequireRole>} />
            <Route path="/admin/grouping" element={<RequireRole roles={['tournament_admin', 'super_admin']}><GroupingRouteWrapper /></RequireRole>} />
            <Route path="/admin/fixtures" element={<RequireRole roles={['tournament_admin', 'super_admin']}><FixtureRouteWrapper /></RequireRole>} />
            <Route path="/admin/update-scores" element={<RequireRole roles={['tournament_admin', 'super_admin']}><UpdateScoresRouteWrapper /></RequireRole>} />
            <Route path="/admin/manage-scores" element={<RequireRole roles={['tournament_admin', 'super_admin']}><ManageScoresRouteWrapper /></RequireRole>} />
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
    <g id="navfig-ball-icon">
      <circle cx="0" cy="0" r="11" fill="url(#navfig-ball)"/>
      <path d="M -9 1 Q 0 8 9 1" fill="none" stroke="#5a8a2f" stroke-width="1.4"/>
    </g>
  </defs>
  <line x1="0" y1="189" x2="1400" y2="189" stroke="#143a34" stroke-width="2"/>
  <ellipse cx="190" cy="189" rx="28" ry="4" fill="#0a221e" opacity="0.6"/>
  <ellipse cx="500" cy="189" rx="30" ry="4" fill="#0a221e" opacity="0.6"/>
  <ellipse cx="820" cy="189" rx="30" ry="4" fill="#0a221e" opacity="0.6"/>
  <ellipse cx="1140" cy="189" rx="30" ry="4" fill="#0a221e" opacity="0.6"/>

  <use href="#navfig-ball-icon" transform="translate(60,70)"/>
  <!-- Serve: gold shirt, white shorts, red cap/racket -->
  <g transform="translate(190,134)" stroke-linecap="round">
    <line x1="0" y1="-24" x2="-10" y2="55" stroke="#e8b48a" stroke-width="13"/>
    <line x1="0" y1="-24" x2="10" y2="55" stroke="#e8b48a" stroke-width="13"/>
    <ellipse cx="-11" cy="56" rx="8" ry="4.5" fill="#ffffff"/>
    <ellipse cx="11" cy="56" rx="8" ry="4.5" fill="#ffffff"/>
    <line x1="0" y1="-24" x2="-5" y2="8" stroke="#ffffff" stroke-width="15"/>
    <line x1="0" y1="-24" x2="5" y2="8" stroke="#ffffff" stroke-width="15"/>
    <line x1="0" y1="-74" x2="0" y2="-22" stroke="#f2b84b" stroke-width="16"/>
    <line x1="0" y1="-65" x2="28" y2="-95" stroke="#e8b48a" stroke-width="10"/>
    <line x1="0" y1="-65" x2="-22" y2="-90" stroke="#e8b48a" stroke-width="10"/>
    <circle cx="0" cy="-85" r="9" fill="#e8b48a"/>
    <path d="M -8 -90 Q 0 -98 9 -90 L 9 -87 Q 0 -93 -8 -87 Z" fill="#e0493f"/>
    <line x1="28" y1="-95" x2="34" y2="-104" stroke="#2a2a2a" stroke-width="3"/>
    <ellipse cx="40" cy="-115" rx="9" ry="13" transform="rotate(25 40 -115)" fill="none" stroke="#e0493f" stroke-width="2.6"/>
    <g transform="rotate(25 40 -115)" stroke="#dfe8e6" stroke-width="0.8" opacity="0.9">
      <line x1="33" y1="-115" x2="47" y2="-115"/>
      <line x1="33" y1="-110" x2="47" y2="-110"/>
      <line x1="33" y1="-120" x2="47" y2="-120"/>
      <line x1="40" y1="-126" x2="40" y2="-104"/>
      <line x1="36" y1="-126" x2="36" y2="-104"/>
      <line x1="44" y1="-126" x2="44" y2="-104"/>
    </g>
  </g>

  <use href="#navfig-ball-icon" transform="translate(360,140)"/>
  <!-- Forehand reach: orange shirt, dark shorts/cap/racket -->
  <g transform="translate(500,134)" stroke-linecap="round">
    <line x1="0" y1="-24" x2="-35" y2="50" stroke="#c98a5a" stroke-width="13"/>
    <line x1="0" y1="-24" x2="30" y2="50" stroke="#c98a5a" stroke-width="13"/>
    <ellipse cx="-36" cy="51" rx="8" ry="4.5" fill="#ffffff"/>
    <ellipse cx="31" cy="51" rx="8" ry="4.5" fill="#ffffff"/>
    <line x1="0" y1="-24" x2="-18" y2="15" stroke="#2a2a2a" stroke-width="15"/>
    <line x1="0" y1="-24" x2="15" y2="15" stroke="#2a2a2a" stroke-width="15"/>
    <line x1="0" y1="-74" x2="0" y2="-22" stroke="#ff8a5c" stroke-width="16"/>
    <line x1="0" y1="-65" x2="45" y2="-72" stroke="#c98a5a" stroke-width="10"/>
    <line x1="0" y1="-65" x2="-35" y2="-60" stroke="#c98a5a" stroke-width="10"/>
    <circle cx="0" cy="-85" r="9" fill="#c98a5a"/>
    <path d="M -8 -90 Q 0 -98 9 -90 L 9 -87 Q 0 -93 -8 -87 Z" fill="#2a2a2a"/>
    <line x1="45" y1="-72" x2="52" y2="-79" stroke="#2a2a2a" stroke-width="3"/>
    <ellipse cx="59" cy="-87" rx="9" ry="13" transform="rotate(20 59 -87)" fill="none" stroke="#2a2a2a" stroke-width="2.6"/>
    <g transform="rotate(20 59 -87)" stroke="#dfe8e6" stroke-width="0.8" opacity="0.9">
      <line x1="52" y1="-87" x2="66" y2="-87"/>
      <line x1="52" y1="-82" x2="66" y2="-82"/>
      <line x1="52" y1="-92" x2="66" y2="-92"/>
      <line x1="59" y1="-98" x2="59" y2="-76"/>
      <line x1="55" y1="-98" x2="55" y2="-76"/>
      <line x1="63" y1="-98" x2="63" y2="-76"/>
    </g>
  </g>

  <use href="#navfig-ball-icon" transform="translate(680,50)"/>
  <!-- Forehand low: teal shirt, dark-green shorts, white cap, blue racket -->
  <g transform="translate(820,134) scale(-1,1)" stroke-linecap="round">
    <line x1="0" y1="-24" x2="-30" y2="50" stroke="#e8b48a" stroke-width="13"/>
    <line x1="0" y1="-24" x2="35" y2="50" stroke="#e8b48a" stroke-width="13"/>
    <ellipse cx="-31" cy="51" rx="8" ry="4.5" fill="#ffffff"/>
    <ellipse cx="36" cy="51" rx="8" ry="4.5" fill="#ffffff"/>
    <line x1="0" y1="-24" x2="-15" y2="12" stroke="#1c4a3e" stroke-width="15"/>
    <line x1="0" y1="-24" x2="18" y2="12" stroke="#1c4a3e" stroke-width="15"/>
    <line x1="0" y1="-74" x2="0" y2="-22" stroke="#4fc79a" stroke-width="16"/>
    <line x1="0" y1="-65" x2="40" y2="-35" stroke="#e8b48a" stroke-width="10"/>
    <line x1="0" y1="-65" x2="-30" y2="-70" stroke="#e8b48a" stroke-width="10"/>
    <circle cx="0" cy="-85" r="9" fill="#e8b48a"/>
    <path d="M -8 -90 Q 0 -98 9 -90 L 9 -87 Q 0 -93 -8 -87 Z" fill="#ffffff"/>
    <line x1="40" y1="-35" x2="46" y2="-29" stroke="#2a2a2a" stroke-width="3"/>
    <ellipse cx="52" cy="-21" rx="9" ry="13" transform="rotate(-20 52 -21)" fill="none" stroke="#3a7bd6" stroke-width="2.6"/>
    <g transform="rotate(-20 52 -21)" stroke="#dfe8e6" stroke-width="0.8" opacity="0.9">
      <line x1="45" y1="-21" x2="59" y2="-21"/>
      <line x1="45" y1="-16" x2="59" y2="-16"/>
      <line x1="45" y1="-26" x2="59" y2="-26"/>
      <line x1="52" y1="-32" x2="52" y2="-10"/>
      <line x1="48" y1="-32" x2="48" y2="-10"/>
      <line x1="56" y1="-32" x2="56" y2="-10"/>
    </g>
  </g>

  <use href="#navfig-ball-icon" transform="translate(1000,160)"/>
  <!-- Two-handed backhand: both arms converge on one grip (not two separate
       hands at two different points), head stays centred over the torso
       instead of floating off to one side, weight on a forward lunge —
       purple shirt, dark-purple shorts, gold cap/racket -->
  <g transform="translate(1140,134)" stroke-linecap="round">
    <line x1="0" y1="-24" x2="-28" y2="50" stroke="#d9a06b" stroke-width="13"/>
    <line x1="0" y1="-24" x2="32" y2="50" stroke="#d9a06b" stroke-width="13"/>
    <ellipse cx="-29" cy="51" rx="8" ry="4.5" fill="#ffffff"/>
    <ellipse cx="33" cy="51" rx="8" ry="4.5" fill="#ffffff"/>
    <line x1="0" y1="-24" x2="-14" y2="10" stroke="#3d2f5c" stroke-width="15"/>
    <line x1="0" y1="-24" x2="16" y2="10" stroke="#3d2f5c" stroke-width="15"/>
    <line x1="0" y1="-74" x2="0" y2="-22" stroke="#a78bdb" stroke-width="16"/>
    <line x1="-4" y1="-65" x2="34" y2="-80" stroke="#d9a06b" stroke-width="10"/>
    <line x1="4" y1="-65" x2="34" y2="-80" stroke="#d9a06b" stroke-width="9"/>
    <circle cx="0" cy="-85" r="9" fill="#d9a06b"/>
    <path d="M -8 -90 Q 0 -98 9 -90 L 9 -87 Q 0 -93 -8 -87 Z" fill="#f2b84b"/>
    <line x1="34" y1="-80" x2="40" y2="-86" stroke="#2a2a2a" stroke-width="3"/>
    <ellipse cx="46" cy="-93" rx="9" ry="13" transform="rotate(20 46 -93)" fill="none" stroke="#f2b84b" stroke-width="2.6"/>
    <g transform="rotate(20 46 -93)" stroke="#dfe8e6" stroke-width="0.8" opacity="0.9">
      <line x1="39" y1="-93" x2="53" y2="-93"/>
      <line x1="39" y1="-88" x2="53" y2="-88"/>
      <line x1="39" y1="-98" x2="53" y2="-98"/>
      <line x1="46" y1="-104" x2="46" y2="-82"/>
      <line x1="42" y1="-104" x2="42" y2="-82"/>
      <line x1="50" y1="-104" x2="50" y2="-82"/>
    </g>
  </g>
  <use href="#navfig-ball-icon" transform="translate(1320,90)"/>
</svg>`;

const navStripStyle = {
  backgroundColor: '#0d2a26',
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(NAV_STRIP_SVG)}")`,
  backgroundRepeat: 'repeat-x',
  backgroundPosition: 'left bottom',
  backgroundSize: 'auto 76px',
};

const navLinkClass = 'text-teal-100 hover:text-white font-semibold uppercase text-xs tracking-wide border-b-2 border-transparent hover:border-accent-400 transition-colors pb-0.5';
const dropdownLinkClass = 'block px-4 py-2 text-teal-100 hover:text-white hover:bg-teal-800 font-semibold uppercase text-xs tracking-wide transition-colors whitespace-nowrap';

// A reusable "label ▾" nav dropdown — used for groups of closely
// related pages that would otherwise each be their own top-level nav
// item: public Teams/Fixtures Calendar/Clubs, and, admin-only, Setup
// (Seasons -> Divisions -> Bulk Upload -> Manage Teams -> Team Logins,
// the order an admin actually sets a season up in), Grouping+Fixtures
// (scheduling), Update Scores+Manage Scores+Missing Scores+Final
// Results (score entry), and Content+Messages+About. See the
// NavDropdown calls in Nav() below.
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
        <>
          <Link to="/my-team" className={navLinkClass}>My Team</Link>
          <Link to="/my-fixtures" className={navLinkClass}>Update Scores</Link>
        </>
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
              { to: '/admin/manage-scores', label: 'Manage Scores' },
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
      <div className="h-[76px]" style={navStripStyle} aria-hidden="true" />
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
function ManageScoresRouteWrapper() {
  const { seasonId } = useSeason();
  return (
    <NeedsSeason>
      <ManageScoresPage seasonId={seasonId} />
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