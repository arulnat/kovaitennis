// src/components/Dropdown.jsx
//
// A native <select>'s open popup can't have its visible row count or a
// scrollbar controlled via CSS in any browser — that's OS-level
// rendering, not something HTML/CSS exposes a hook for. This is a
// custom listbox with the same controlled value/onChange/options shape
// as a <select>, but its own open list capped at 5 rows tall with its
// own scrollbar for anything beyond that — used everywhere a dropdown
// appears in the app, so every one of them behaves the same way.

import { useEffect, useRef, useState } from 'react';

const VISIBLE_ROWS = 5;
const ROW_HEIGHT_PX = 32; // approx. one option row at text-sm + padding

/**
 * @param {string} value
 * @param {(value: string) => void} onChange
 * @param {{value: string, label: string, disabled?: boolean}[]} options
 * @param {string} [placeholder] - shown when value matches no option
 * @param {boolean} [disabled]
 * @param {string} [className] - applied to the outer wrapper (e.g. width)
 */
export default function Dropdown({ value, onChange, options, placeholder, disabled, className = '' }) {
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

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="border rounded px-2 py-1.5 text-sm w-full flex items-center justify-between gap-2 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={`truncate ${!selected ? 'text-gray-400' : ''}`}>{selected?.label ?? placeholder ?? 'Select…'}</span>
        <span className="text-gray-400 text-xs shrink-0">▾</span>
      </button>
      {open && (
        <ul
          className="absolute z-20 mt-1 min-w-full w-max max-w-xs bg-white border rounded shadow-lg overflow-y-auto py-1"
          style={{ maxHeight: ROW_HEIGHT_PX * VISIBLE_ROWS }}
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                disabled={o.disabled}
                onClick={() => { if (o.disabled) return; onChange(o.value); setOpen(false); }}
                className={`block w-full text-left px-3 py-1.5 text-sm whitespace-nowrap ${
                  o.disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : `hover:bg-teal-50 ${o.value === value ? 'bg-teal-50 font-semibold text-teal-800' : 'text-slate-800'}`
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
