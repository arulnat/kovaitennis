// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fails loudly at build/dev time rather than silently returning a
  // broken client — see .env.example for what to set.
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill them in.');
}

// "Remember me" — a session normally lives in localStorage (survives a
// browser restart) since persistSession defaults there; unchecking it
// should mean "log me out when the browser closes" instead, i.e.
// sessionStorage. Supabase's client picks one storage at construction
// time, so this is a thin adapter that decides per-call which real
// store to use, based on a flag callers set with setRememberMe() BEFORE
// signing in.
const REMEMBER_KEY = 'auth-remember-me';

function rememberMe() {
  try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; } // default: remembered
}

/** Call before signInWithPassword — decides where THIS session gets written. */
export function setRememberMe(remembered) {
  try { localStorage.setItem(REMEMBER_KEY, remembered ? '1' : '0'); } catch { /* ignore */ }
}

const dynamicStorage = {
  getItem: (key) => {
    try {
      return (rememberMe() ? localStorage : sessionStorage).getItem(key);
    } catch { return null; }
  },
  setItem: (key, value) => {
    try {
      const primary = rememberMe() ? localStorage : sessionStorage;
      const other = rememberMe() ? sessionStorage : localStorage;
      primary.setItem(key, value);
      other.removeItem(key); // no stale copy left in the store not being used
    } catch { /* ignore */ }
  },
  removeItem: (key) => {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storage: dynamicStorage },
});
