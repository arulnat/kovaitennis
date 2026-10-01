// src/lib/age.js
//
// Age eligibility: every player must be MIN_AGE+ as of a season's fixed
// age_cutoff_date (seasons.age_cutoff_date, set per season on the
// Seasons admin page) — a fixed reference date, not "today", so a
// player's eligibility never silently flips mid-season as time passes.
// Next season just gets its own cutoff date when it's created.
//
// Used by My Team (live display + a client-side pre-check) and the
// manage-team-roster Edge Function (the actual enforcement — this
// module's logic is duplicated there, since a deployed Edge Function
// can't import from src/lib).

export const MIN_AGE = 40;

/** Age in whole years as of `asOfDate`, from a date of birth — both YYYY-MM-DD strings (or anything Date can parse). */
export function calculateAge(dateOfBirth, asOfDate) {
  const dob = new Date(dateOfBirth);
  const asOf = new Date(asOfDate);
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const birthdayPassed =
    asOf.getUTCMonth() > dob.getUTCMonth() ||
    (asOf.getUTCMonth() === dob.getUTCMonth() && asOf.getUTCDate() >= dob.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age;
}

/** Whether a date of birth meets MIN_AGE as of a season's age_cutoff_date. */
export function isAgeEligible(dateOfBirth, ageCutoffDate) {
  return calculateAge(dateOfBirth, ageCutoffDate) >= MIN_AGE;
}
