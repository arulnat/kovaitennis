// src/pages/admin/BulkUploadPage.jsx
//
// Req 2.1 (MVP-extended): admin uploads one CSV file, two rows per team
// (team info, then roster). All-or-nothing validation — any bad block
// rejects the whole file, nothing is imported (v6 decision). The
// roster row lists every player EXCEPT the captain — the info row's
// player count is the team's total size (captain included), so that
// count minus 1 is how many names the roster row must have. The
// captain can still add more players later from their own My Team page
// after logging in (see MyTeamPage.jsx and the manage-team-roster Edge
// Function).
//
// The actual team/player/login creation happens server-side in the
// bulk-create-teams Edge Function (service_role key required to create
// real Supabase Auth accounts — that can't run from the browser). Newly
// created teams land in team_seasons with no division_id, so they start
// out in Grouping's "Unassigned pool" ready to be placed. Login IDs and
// passwords are no longer shown here — see the Team Logins page.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { parseWorkbook, validateBulkUpload, downloadSampleTemplate } from '../../lib/bulkUpload.js';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';

export default function BulkUploadPage({ seasonId }) {
  const [status, setStatus] = useState('idle'); // idle | parsing | error | preview | importing | done
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState([]);
  const [teams, setTeams] = useState([]);
  const [importResult, setImportResult] = useState(null);

  function handleFileChosen(e) {
    setFile(e.target.files?.[0] ?? null);
    setErrors([]);
  }

  async function handleUpload() {
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
      <PageHeader title="Bulk Team Upload" />
      <p className="text-sm text-gray-600 mb-2">
        CSV file, no header row — two rows per team, one block after another:
      </p>
      <ul className="text-sm text-gray-600 mb-4 list-disc pl-5 space-y-1">
        <li><strong>Row 1</strong> (team info): team name, captain name, captain phone, number of players (total team size, including the captain — minimum 4), club name (optional — leave blank if none)</li>
        <li><strong>Row 2</strong> (roster): that many names <em>minus the captain</em>, one per column — e.g. a player count of 4 means 3 names on this row</li>
      </ul>
      <p className="text-sm text-gray-600 mb-4">
        Repeat for each additional team — a 2-team file is 4 rows total. If a club name is left blank, it
        defaults to the full team name; either way it's matched case-insensitively against clubs already on
        file, so "City Club" and "city club" become the same club rather than two — a new one is only created
        if nothing matches. Club can also be added or corrected later from the Teams page. The captain can add
        further players later from their own My Team page. Gender, photos, ID proof, and date of birth are not
        collected here. If any block has a problem, nothing is imported — fix the file and re-upload.
      </p>

      <button
        onClick={downloadSampleTemplate}
        className="mb-4 text-sm text-teal-700 underline"
      >
        Download a sample CSV template
      </button>

      {status === 'idle' || status === 'parsing' || status === 'error' ? (
        <div className="flex items-center gap-3">
          <input type="file" accept=".csv" onChange={handleFileChosen} disabled={status === 'parsing'} />
          <button
            onClick={handleUpload}
            disabled={!file || status === 'parsing'}
            className="px-4 py-1.5 rounded bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Upload
          </button>
        </div>
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
          <div className="overflow-x-auto rounded shadow">
            <table className="w-full text-sm border">
              <thead className="bg-teal-900 text-teal-50">
                <tr>
                  <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Team Name</th>
                  <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Club Name</th>
                  <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Captain Name</th>
                  <th className="text-left p-2 font-bold uppercase text-xs tracking-wide">Mobile Phone Number</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={t.teamName} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 border-t font-semibold">{t.teamName}</td>
                    <td className="p-2 border-t">{t.clubName ? t.clubName.toUpperCase() : '—'}</td>
                    <td className="p-2 border-t">{t.captainName}</td>
                    <td className="p-2 border-t">{t.captainPhone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          {importResult.failures?.length > 0 && (
            <ul className="mt-2 text-sm text-red-700 list-disc pl-5">
              {importResult.failures.map((f, i) => <li key={i}>{f.team}: {f.error}</li>)}
            </ul>
          )}
          <p className="text-sm text-gray-600 mt-3">
            New teams start out unassigned — place them into a division under Grouping. Their login IDs and
            passwords are on the <Link to="/admin/login-credentials" className="text-teal-700 underline">Team Logins</Link> page.
          </p>
        </div>
      )}
    </div>
  );
}
