// src/components/TeamLink.jsx
//
// Every team name shown anywhere in the app links to that team's profile
// page (/team/:teamId) — public, so it works the same for an anonymous
// visitor, a team login, or an admin. Renders plain text (no link) if
// teamId is missing, e.g. a bye slot's opponent side.

import { Link } from 'react-router-dom';

export default function TeamLink({ teamId, children, className }) {
  if (!teamId || !children) return <>{children}</>;
  return (
    <Link to={`/team/${teamId}`} className={className ?? 'hover:underline hover:text-teal-700'}>
      {children}
    </Link>
  );
}
