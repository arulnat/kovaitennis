// src/lib/bulkUpload.js
//
// Admin bulk Excel upload (Req 2.1), MVP-scoped: teams + full player
// rosters, names/gender only — no photo, DOB, or ID proof (those are
// nullable columns, populated later under the deferred MP registration
// flow). All-or-nothing validation (v6 decision): any row error rejects
// the whole file.
//
// Expected sheet shape (one row per PLAYER, team columns repeated):
//   team_name | captain_name | captain_phone | player_name | player_gender
//
// Uses SheetJS (`xlsx`) to parse — parsing itself is kept separate from
// validation (and the `xlsx` import is dynamic, inside parseWorkbook
// only) so validation logic can be unit-tested with plain Node, without
// requiring the `xlsx` package to be installed.

const PHONE_RE = /^[0-9+\-\s()]{7,15}$/;

/** Parse a workbook (ArrayBuffer) into raw row objects. Requires `xlsx` (npm install xlsx). */
export async function parseWorkbook(arrayBuffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

/**
 * Validate parsed rows. Returns either {ok:true, teams:[...]} with rows
 * grouped into team+roster objects, or {ok:false, errors:[...]} — in
 * which case NONE of the file should be imported (all-or-nothing, Req 2.1).
 *
 * @param {Record<string,string>[]} rows
 */
export function validateBulkUpload(rows) {
  const errors = [];
  const teamsByName = new Map();
  const seenTeamNames = new Set();

  rows.forEach((row, i) => {
    const lineNo = i + 2; // +1 for 0-index, +1 for header row
    const teamName = String(row.team_name || '').trim();
    const captainName = String(row.captain_name || '').trim();
    const captainPhone = String(row.captain_phone || '').trim();
    const playerName = String(row.player_name || '').trim();
    const playerGender = String(row.player_gender || '').trim().toLowerCase();

    if (!teamName) errors.push(`Row ${lineNo}: team_name is required`);
    if (!captainName) errors.push(`Row ${lineNo}: captain_name is required`);
    if (!captainPhone) errors.push(`Row ${lineNo}: captain_phone is required`);
    else if (!PHONE_RE.test(captainPhone)) errors.push(`Row ${lineNo}: captain_phone "${captainPhone}" doesn't look like a valid phone number`);
    if (!playerName) errors.push(`Row ${lineNo}: player_name is required`);
    if (playerGender && !['male', 'female', 'other'].includes(playerGender)) {
      errors.push(`Row ${lineNo}: player_gender must be male/female/other, got "${row.player_gender}"`);
    }

    if (!teamName) return; // can't group this row without a team name

    if (!teamsByName.has(teamName)) {
      if (seenTeamNames.has(teamName)) {
        errors.push(`Row ${lineNo}: duplicate team name "${teamName}" (already seen with different details)`);
      }
      seenTeamNames.add(teamName);
      teamsByName.set(teamName, {
        teamName, captainName, captainPhone, players: [],
      });
    } else {
      const existing = teamsByName.get(teamName);
      if (existing.captainName !== captainName || existing.captainPhone !== captainPhone) {
        errors.push(`Row ${lineNo}: team "${teamName}" has inconsistent captain details across rows`);
      }
    }

    if (playerName) {
      teamsByName.get(teamName)?.players.push({ name: playerName, gender: playerGender || null });
    }
  });

  // Req 1.5: minimum 4 players per team — enforced here too since this
  // IS the final submission for a bulk-uploaded team (no partial-save
  // step exists in the admin bulk flow).
  for (const [teamName, team] of teamsByName) {
    if (team.players.length < 4) {
      errors.push(`Team "${teamName}" has only ${team.players.length} player(s) — minimum is 4 (Req 1.5)`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, teams: [...teamsByName.values()] };
}

/** Generate a login ID from a team name (Req 2.2): lowercase, alnum + dashes, deduped by caller if needed. */
export function generateLoginId(teamName) {
  return teamName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Generate a default password (Req 2.2) — simple, human-typeable, forced to change on first login anyway. */
export function generateDefaultPassword() {
  const words = ['ace', 'lob', 'volley', 'serve', 'court', 'match', 'rally', 'smash'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}${num}`;
}
