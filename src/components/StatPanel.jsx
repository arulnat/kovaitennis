// src/components/StatPanel.jsx
//
// Bold dark stat table — alternating deep-teal rows, uppercase tracked
// labels, extra-bold values, one row optionally highlighted gold (e.g. the
// team's current division). Same spirit as league.cdta.co.in's team-info
// panel (bold, high-contrast, unmissable) but our own teal/gold palette,
// rounded corners and shadow instead of a copy of its layout.

export default function StatPanel({ rows }) {
  return (
    <div className="rounded-lg overflow-hidden shadow-lg">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`flex items-center justify-between px-4 py-2.5 ${
            r.highlight ? 'bg-accent-500 text-teal-950' : i % 2 === 0 ? 'bg-teal-900 text-teal-50' : 'bg-teal-800 text-teal-50'
          }`}
        >
          <span className="text-xs font-bold uppercase tracking-wider">{r.label}</span>
          <span className="text-base font-extrabold">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
