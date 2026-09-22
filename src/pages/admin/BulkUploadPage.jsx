// src/pages/admin/BulkUploadPage.jsx
//
// Req 2.1 (MVP-extended): admin uploads one CSV file with a 2-row block
// per team (team info, then roster). All-or-nothing validation — any bad
// block rejects the whole file, nothing is imported (v6 decision).
//
// The actual team/player/login creation happens server-side in the
// bulk-create-teams Edge Function (service_role key required to create
// real Supabase Auth accounts — that can't run from the browser). Newly
// created teams land in team_seasons with no division_id, so they start
// out in Grouping's "Unassigned pool" ready to be placed. Login IDs and
// passwords are no longer shown here — see the Login Credentials page.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { parseWorkbook, validateBulkUpload, downloadSampleTemplate } from '../../lib/bulkUpload.js';
import { supabase } from '../../lib/supabaseClient.js';

export default function BulkUploadPage({ seasonId }) {
  const [status, setStatus] = useState('idle'); // idle | parsing | error | preview | importing | done
  const [errors, setErrors] = useState([]);
  const [teams, setTeams] = useState([]);
  const [importResult, setImportResult] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('parsing');
    setErrors([]);
    try {
      const buffer = await file.arrayBuffer();
      const rows = await parseWorkbook(buffer);
      const result = validateBulkUpload(rows);
      if (!result.ok) {
        setErrors(result.errors);
        setStatus('error');
        return;
      }
      setTeams(result.teams);
      setStatus('preview');
    } catch (err) {
      setErrors([`Could not read the file: ${err.message}`]);
      setStatus('error');
    }
  }

  async function handleImport() {
    setStatus('importing');
    const { data, error } = await supabase.functions.invoke('bulk-create-teams', {
      body: { seasonId, teams },
    });
    if (error) {
      setErrors([`Import failed: ${error.message}`]);
      setStatus('error');
      return;
    }
    setImportResult(data);
    setStatus('done');
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Bulk Team &amp; Roster Upload</h1>
      <p className="text-sm text-gray-600 mb-2">
        CSV file, no header row — two rows per team, one block after another:
      </p>
      <ul className="text-sm text-gray-600 mb-4 list-disc pl-5 space-y-1">
        <li><strong>Row 1</strong> (team info): team name, captain name, captain phone, number of other players (not counting the captain)</li>
        <li><strong>Row 2</strong> (roster): that many player names, one per column</li>
      </ul>
      <p className="text-sm text-gray-600 mb-4">
        The captain is added to the roster automatically, so a team needs at least 3 other players (4 total
        including the captain — Req 1.5). Repeat for each additional team — a 2-team file is 4 rows total.
        Gender, photos, ID proof, and date of birth are not collected here (Req 1.7/1.6 deferred). If any block
        has a problem, nothing is imported — fix the file and re-upload.
      </p>

      <button
        onClick={downloadSampleTemplate}
        className="mb-4 text-sm text-teal-700 underline"
      >
        Download a sample CSV template
      </button>

      {status === 'idle' || status === 'parsing' || status === 'error' ? (
        <input type="file" accept=".csv" onChange={handleFile} disabled={status === 'parsing'} />
      ) : null}

      {status === 'parsing' && <p className="mt-3 text-gray-500">Reading file…</p>}

      {status === 'error' && (
        <div className="mt-4 p-4 border border-red-300 bg-red-50 rounded">
          <p className="font-medium text-red-800 mb-2">File rejected — fix these and re-upload:</p>
          <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {status === 'preview' && (
        <div className="mt-4">
          <p className="font-medium mb-2">{teams.length} team(s) ready to import:</p>
          <ul className="border rounded divide-y">
            {teams.map((t) => (
              <li key={t.teamName} className="p-3 flex justify-between text-sm">
                <span>{t.teamName} — captain {t.captainName}</span>
                <span className="text-gray-500">{t.players.length} players</span>
              </li>
            ))}
          </ul>
          <button
            onClick={handleImport}
            className="mt-4 px-4 py-2 rounded bg-teal-700 text-white text-sm font-medium hover:bg-teal-800"
          >
            Import {teams.length} team(s)
          </button>
        </div>
      )}

      {status === 'importing' && <p className="mt-3 text-gray-500">Importing…</p>}

      {status === 'done' && importResult && (
        <div className="mt-4">
          <p className="font-medium text-green-800 mb-2">
            {importResult.created.length} team(s) created.
            {importResult.failures?.length > 0 && ` ${importResult.failures.length} failed.`}
          </p>
          <ul className="border rounded divide-y">
            {importResult.created.map((c) => (
              <li key={c.loginId} className="p-3 text-sm">{c.teamName}</li>
            ))}
          </ul>
          {importResult.failures?.length > 0 && (
            <ul className="mt-2 text-sm text-red-700 list-disc pl-5">
              {importResult.failures.map((f, i) => <li key={i}>{f.team}: {f.error}</li>)}
            </ul>
          )}
          <p className="text-sm text-gray-600 mt-3">
            New teams start out unassigned — place them into a division under Grouping. Their login IDs and
            passwords are on the <Link to="/admin/login-credentials" className="text-teal-700 underline">Login Credentials</Link> page.
          </p>
        </div>
      )}
    </div>
  );
}
