// src/lib/bulkUpload.js
//
// Admin bulk CSV upload (Req 2.1), MVP-scoped, one row per team, no
// header row, repeated: team_name | captain_name | captain_phone |
// club_name?. club_name is optional — if left blank, it defaults to the
// team name's first word (e.g. "Aces Warriors" -> "Aces"); either way
// it's matched case-insensitively against existing clubs server-side
// (bulk-create-teams Edge Function), creating a new club only if no
// match exists, so "Aces Club" and "aces club" never end up as two
// different clubs. The club name can be corrected later on the Teams
// page. All-or-nothing validation (v6 decision): any row's error
// rejects the whole file.
//
// No roster is collected here — Req 1.5's 4-player minimum is met by
// creating the captain (real name) plus 3 placeholder players, "Player
// 1"/"Player 2"/"Player 3", for every team. Once the login exists, the
// captain signs in and renames those placeholders (and can add more
// real players) from the Roster page — see manage-team-roster Edge
// Function and MyTeamPage.jsx. Gender, photos, ID proof, and date of
// birth are still not collected anywhere in this flow.
//
// Captain name is normalized to title case ("raVI KUMAR" -> "Ravi
// Kumar") regardless of how it was typed — team name and club name are
// left as-is. captain_phone is normalized to a plain 10-digit number
// (see normalizePhone in phone.js) — spaces are stripped, and a leading
// +91/91 is stripped, but anything left over that isn't exactly 10
// digits is rejected.
//
// Uses SheetJS (`xlsx`) to parse the CSV — parsing itself is kept separate
// from validation (and the `xlsx` import is dynamic, inside parseWorkbook and
// downloadSampleTemplate only) so validation logic can be unit-tested with
// plain Node, without requiring the `xlsx` package to be installed.

import { downloadCsv } from './csv.js';
import { normalizePhone } from './phone.js';

/** Title-case a name: first letter of each word uppercase, rest lowercase (e.g. "raVI kumAR" -> "Ravi Kumar") — applied to captain/player names so inconsistent typing in the CSV doesn't carry through. */
function toTitleCase(name) {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Login IDs reserved for the tournament admin ("admin") and website admin ("superadmin") logins — never available to a team, even if its name would otherwise generate one of these. */
export const RESERVED_LOGIN_IDS = ['admin', 'superadmin'];

/** Parse a workbook (ArrayBuffer) into raw rows of cell values (no header row in this format). Requires `xlsx` (npm install xlsx). */
export async function parseWorkbook(arrayBuffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

/** The 3 placeholder players every bulk-uploaded team gets alongside its real captain, meeting the Req 1.5 4-player minimum until the captain renames them from the Roster page. */
const DEFAULT_PLACEHOLDER_PLAYERS = ['Player 1', 'Player 2', 'Player 3'];

/**
 * Validate raw rows (array of arrays), one row per team. Returns either
 * {ok:true, teams:[...]} — each team's `players` is the captain plus the
 * 3 default placeholders — or {ok:false, errors:[...]}, in which case
 * NONE of the file should be imported (all-or-nothing, Req 2.1). Every
 * problem found is reported, not just the first one.
 *
 * @param {any[][]} rows
 */
export function validateBulkUpload(rows) {
  const errors = [];
  const teams = [];
  const seenTeamNames = new Set();

  rows.forEach((row, i) => {
    const lineNo = i + 1;
    const isBlank = (row || []).every((v) => String(v ?? '').trim() === '');
    if (isBlank) return; // e.g. a trailing blank line from the CSV

    const teamName = String(row[0] ?? '').trim();
    const captainName = toTitleCase(String(row[1] ?? '').trim());
    const captainPhoneRaw = String(row[2] ?? '').trim();
    const captainPhoneResult = captainPhoneRaw ? normalizePhone(captainPhoneRaw) : null;
    const captainPhone = captainPhoneResult?.ok ? captainPhoneResult.value : captainPhoneRaw;
    const explicitClubName = String(row[3] ?? '').trim();
    // No club given -> default to the team name's first word (e.g. "Aces
    // Warriors" -> "Aces"), so every team lands in some club by default;
    // still editable later on the Teams page (ClubCell/updateClub).
    const clubName = explicitClubName || (teamName ? teamName.split(/\s+/)[0].trim() : null);

    if (!teamName) errors.push(`Row ${lineNo}: team name is required`);
    if (!captainName) errors.push(`Row ${lineNo}: captain name is required`);
    if (!captainPhoneRaw) errors.push(`Row ${lineNo}: captain phone is required`);
    else if (!captainPhoneResult.ok) errors.push(`Row ${lineNo}: captain phone "${captainPhoneRaw}" must be a 10-digit number (spaces are fine; a leading +91 or 91 is fine)`);

    if (teamName) {
      if (seenTeamNames.has(teamName)) {
        errors.push(`Row ${lineNo}: duplicate team name "${teamName}"`);
      }
      seenTeamNames.add(teamName);

      const loginId = generateLoginId(teamName);
      if (RESERVED_LOGIN_IDS.includes(loginId)) {
        errors.push(`Row ${lineNo}: team name "${teamName}" would generate the login ID "${loginId}", which is reserved for admin logins — rename the team`);
      }
    }

    if (teamName && captainName && captainPhoneResult?.ok) {
      teams.push({
        teamName, captainName, captainPhone, clubName,
        players: [
          { name: captainName, gender: null, isCaptain: true },
          ...DEFAULT_PLACEHOLDER_PLAYERS.map((name) => ({ name, gender: null, isCaptain: false })),
        ],
      });
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, teams };
}

/** A 5-team example matching the expected one-row-per-team format, for downloadSampleTemplate(). */
export function sampleTemplateRows() {
  return [
    ['Aces', 'Priya Kumar', '9876543210', 'City Sports Club'],
    ['Smashers', 'Anita Menon', '9123456780', ''],
    ['Warriors', 'Rahul Verma', '9988776655', 'Green Park Club'],
    ['Titans', 'Sneha Pillai', '9871234560', 'City Sports Club'],
    ['Strikers', 'Vikram Singh', '9765432109', ''],
  ];
}

/** Downloads sampleTemplateRows() as team-upload-template.csv. */
export async function downloadSampleTemplate() {
  await downloadCsv(sampleTemplateRows(), 'team-upload-template.csv');
}

/**
 * Downloads the just-created team login credentials (Req 2.2) as a CSV so
 * the admin can circulate them to captains without retyping the on-screen
 * table.
 *
 * @param {{teamName: string, loginId: string, defaultPassword: string}[]} created
 */
export async function downloadCredentialsSheet(created) {
  const rows = [
    ['Team', 'Login ID', 'Default Password'],
    ...created.map((c) => [c.teamName, c.loginId, c.defaultPassword]),
  ];
  await downloadCsv(rows, 'team-login-credentials.csv');
}

/**
 * Generate a login ID from a team name (Req 2.2): every letter,
 * concatenated with nothing between them, lowercased — spaces, hyphens,
 * digits, and everything else are simply dropped. "CMTA-A" -> "cmtaa",
 * "KGR Sky Riders" -> "kgrskyriders". Deduped by caller if needed (the
 * DB's login_id unique constraint is the final backstop).
 */
export function generateLoginId(teamName) {
  return teamName.replace(/[^a-zA-Z]/g, '').toLowerCase();
}

/** Generate a default password (Req 2.2) — simple, human-typeable, forced to change on first login anyway. */
export function generateDefaultPassword() {
  const words = ['ace', 'lob', 'volley', 'serve', 'court', 'match', 'rally', 'smash'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}${num}`;
}
