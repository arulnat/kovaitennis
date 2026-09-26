// src/components/Avatar.jsx
//
// Bold initials avatar for a team or player with no photo on file (photos
// are a deferred/MP field — bulk upload never collects one in the MVP), so
// profile/roster views still look intentional and finished rather than
// leaving a broken <img> or blank box.

const PALETTE = ['bg-teal-700', 'bg-teal-600', 'bg-accent-600', 'bg-teal-800', 'bg-accent-500'];

function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function colorFor(name) {
  let hash = 0;
  for (const ch of name || '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export default function Avatar({ name, size = 'md', className = '' }) {
  const sizeClass = size === 'lg' ? 'w-20 h-20 text-2xl' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-12 h-12 text-base';
  return (
    <div
      className={`${sizeClass} ${colorFor(name)} rounded-full flex items-center justify-center text-white font-extrabold shrink-0 shadow ${className}`}
    >
      {initialsOf(name)}
    </div>
  );
}
