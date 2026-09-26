// src/components/PlayerLink.jsx
//
// Same pattern as TeamLink — every player name shown anywhere links to
// that player's profile page (/player/:playerId), public like the rest
// of Section 6/10.5. Renders plain text if playerId is missing.

import { Link } from 'react-router-dom';

export default function PlayerLink({ playerId, children, className }) {
  if (!playerId || !children) return <>{children}</>;
  return (
    <Link to={`/player/${playerId}`} className={className ?? 'hover:underline hover:text-teal-700'}>
      {children}
    </Link>
  );
}
