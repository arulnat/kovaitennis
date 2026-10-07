// src/lib/text.js
//
// Shared text-formatting helpers with no DOM/Supabase dependency, so
// they're usable from any page and trivially unit-testable.

/**
 * Title-cases a person's name, treating both a space AND a dot as a
 * word boundary — so every format a captain might type an initial in
 * comes out correctly capitalized: "k.ravi" -> "K.Ravi", "k ravi" ->
 * "K Ravi", "ravi k" -> "Ravi K", "ravi k s" -> "Ravi K S" (a lone
 * initial is just a one-letter "word", so it's capitalized the same
 * way a full word's first letter is). The separator itself (space or
 * dot) is always preserved as-is; only letters are touched.
 */
export function toTitleCase(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/(^|[\s.])([a-z])/g, (_, boundary, letter) => boundary + letter.toUpperCase());
}
