// src/components/ToggleSwitch.jsx
//
// A small dot-on-a-track switch for an on/off admin setting — styled to
// match the app's teal/gray palette rather than a plain checkbox. Used
// wherever an admin flips a binary setting (Grouping's avoidSameClub,
// Manage Scores' per-week override, ...).

export default function ToggleSwitch({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-teal-700' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
      {label}
    </label>
  );
}
