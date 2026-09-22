// src/lib/bulkUpload.js
//
// Admin bulk CSV upload (Req 2.1), MVP-scoped: teams + full player
// rosters, names only (no gender in this format) — no photo, DOB, or ID
// proof (those are nullable columns, populated later under the deferred
// MP registration flow). All-or-nothing validation (v6 decision): any
// block error rejects the whole file. CSV only — not a general Excel
// importer.
//
// Expected CSV shape — NO header row; two rows per team, repeated:
//   Row 1 (team info): team_name | captain_name | captain_phone | player_count
//   Row 2 (roster):    player_name_1 | player_name_2 | ... | player_name_N
// where N is the player_count given in Row 1 — OTHER players, not counting
// the captain. The captain is added to the roster automatically (Req 1.5's
// 4-player minimum includes the captain), so player_count must be at least
// 3. A 2-team file is 4 rows total.
//
// Uses SheetJS (`xlsx`) to parse the CSV — parsing itself is kept separate
// from validation (and the `xlsx` import is dynamic, inside parseWorkbook and
// downloadSampleTemplate only) so validation logic can be unit-tested with
// plain Node, without requiring the `xlsx` package to be installed.

const PHONE_RE = /^[0-9+\-\s()]{7,15}$/;

/** Parse a workbook (ArrayBuffer) into raw rows of cell values (no header row in this format). Requires `xlsx` (npm install xlsx). */
export async function parseWorkbook(arrayBuffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

/**
 * Validate raw rows (array of arrays) in the 2-row-per-team block format.
 * Returns either {ok:true, teams:[...]} — each team's `players` includes the
 * captain (prepended) alongside the roster row's names — or {ok:false,
 * errors:[...]}, in which case NONE of the file should be imported
 * (all-or-nothing, Req 2.1). Every problem found is reported, not just the
 * first one.
 *
 * @param {any[][]} rows
 */
export function validateBulkUpload(rows) {
  const errors = [];
  const teams = [];
  const seenTeamNames = new Set();

  for (let i = 0; i < rows.length; i += 2) {
    const infoRow = rows[i] || [];
    const infoLineNo = i + 1;
    const teamName = String(infoRow[0] ?? '').trim();
    const captainName = String(infoRow[1] ?? '').trim();
    const captainPhone = String(infoRow[2] ?? '').trim();
    const playerCountRaw = infoRow[3];
    const playerCount = Number(playerCountRaw);
    const countIsValid = Number.isInteger(playerCount) && playerCount > 0;

    if (!teamName) errors.push(`Row ${infoLineNo}: team name is required`);
    if (!captainName) errors.push(`Row ${infoLineNo}: captain name is required`);
    if (!captainPhone) errors.push(`Row ${infoLineNo}: captain phone is required`);
    else if (!PHONE_RE.test(captainPhone)) errors.push(`Row ${infoLineNo}: captain phone "${captainPhone}" doesn't look like a valid phone number`);

    if (!countIsValid) {
      errors.push(`Row ${infoLineNo}: player count "${playerCountRaw}" must be a positive whole number`);
    } else if (playerCount < 3) {
      errors.push(`Row ${infoLineNo}: team "${teamName || '(unnamed)'}" has ${playerCount + 1} player(s) including the captain — minimum is 4 (Req 1.5)`);
    }

    if (teamName) {
      if (seenTeamNames.has(teamName)) {
        errors.push(`Row ${infoLineNo}: duplicate team name "${teamName}"`);
      }
      seenTeamNames.add(teamName);
    }

    const rosterRowIndex = i + 1;
    const rosterLineNo = rosterRowIndex + 1;
    const rosterRow = rows[rosterRowIndex];

    if (!rosterRow) {
      errors.push(`Row ${rosterLineNo}: expected a player-names row after row ${infoLineNo}, but the file ends there`);
      continue;
    }

    const playerNames = rosterRow.map((v) => String(v ?? '').trim()).filter((v) => v !== '');

    if (countIsValid && playerNames.length !== playerCount) {
      errors.push(`Row ${rosterLineNo}: expected ${playerCount} player name(s) for team "${teamName || '(unnamed)'}", found ${playerNames.length}`);
    }

    if (teamName && captainName && countIsValid && playerNames.length === playerCount) {
      teams.push({
        teamName, captainName, captainPhone,
        players: [
          { name: captainName, gender: null },
          ...playerNames.map((name) => ({ name, gender: null })),
        ],
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, teams };
}

/**
 * A small 2-team example matching the expected block format, for
 * downloadSampleTemplate(). The roster row lists OTHER players only — the
 * captain (named in the info row) is added automatically, so "Aces" here
 * shows the minimum allowed: 3 other players + the captain = 4 total.
 */
export function sampleTemplateRows() {
  return [
    ['Aces', 'Priya Kumar', '9876543210', 3],
    ['Arjun Rao', 'Divya Shah', 'Karthik Iyer'],
    ['Smashers', 'Anita Menon', '9123456780', 4],
    ['Rahul Verma', 'Sneha Pillai', 'Vikram Singh', 'Lakshmi Narayan'],
  ];
}

/** Builds a CSV from rows (array of arrays) and triggers a browser download. Requires `xlsx`. */
async function downloadCsv(rows, filename) {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
