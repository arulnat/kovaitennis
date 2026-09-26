// src/components/PageHeader.jsx
//
// Bold, uppercase title bar with a thick gold underline — used at the top
// of every page for a consistent, high-visibility "nice look and feel"
// (inspired by league.cdta.co.in's bold labeling, not copied from it).

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 pb-3 border-b-4 border-accent-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-teal-900 uppercase">{title}</h1>
        {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
      </div>
      {subtitle && <p className="no-print text-sm text-slate-600 mt-1">{subtitle}</p>}
    </div>
  );
}
