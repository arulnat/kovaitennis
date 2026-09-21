// src/pages/admin/BulkUploadPage.jsx
//
// Req 2.1 (MVP-extended): admin uploads one CSV file with a 2-row block
// per team (team info, then roster). All-or-nothing validation — any bad
// block rejects the whole file, nothing is imported (v6 decision).

import { useState } from 'react';
import { parseWorkbook, validateBulkUpload, generateLoginId, generateDefaultPassword, downloadSampleTemplate } from '../../lib/bulkUpload.js';
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
    const created = [];
    const failures = [];

    for (const team of teams) {
      const loginId = generateLoginId(team.teamName);
      const defaultPassword = generateDefaultPassword();

      // 1. Create the auth user (Edge Function recommended in production
      //    so the service-role key never touches the browser — this
      //    inline call is illustrative of the flow).
      const { data: teamRow, error: teamErr } = await supabase
        .from('teams')
        .insert({
          name: team.teamName,
          login_id: loginId,
          captain_name: team.captainName,
          captain_phone: team.captainPhone,
        })
        .select()
        .single();

      if (teamErr) { failures.push({ team: team.teamName, error: teamErr.message }); continue; }

      const { error: playersErr } = await supabase.from('players').insert(
        team.players.map((p) => ({ team_id: teamRow.id, name: p.name, gender: p.gender }))
      );
      if (playersErr) { failures.push({ team: team.teamName, error: playersErr.message }); continue; }

      const { data: playerRows } = await supabase.from('players').select('id').eq('team_id', teamRow.id);
      if (playerRows) {
        await supabase.from('team_players').insert(
          playerRows.map((p) => ({ season_id: seasonId, team_id: teamRow.id, player_id: p.id }))
        );
      }

      await supabase.from('team_seasons').insert({ season_id: seasonId, team_id: teamRow.id, status: 'new' });

      created.push({ teamName: team.teamName, loginId, defaultPassword });
    }

    setImportResult({ created, failures });
    setStatus('done');
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Bulk Team &amp; Roster Upload</h1>
      <p className="text-sm text-gray-600 mb-2">
        CSV file, no header row — two rows per team, one block after another:
      </p>
      <ul className="text-sm text-gray-600 mb-4 list-disc pl-5 space-y-1">
        <li><strong>Row 1</strong> (team info): team name, captain name, captain phone, number of players (excluding the captain)</li>
        <li><strong>Row 2</strong> (roster): that many player names, one per column</li>
      </ul>
      <p className="text-sm text-gray-600 mb-4">
        Repeat for each additional team — a 2-team file is 4 rows total. Gender, photos, ID proof, and date of
        birth are not collected here (Req 1.7/1.6 deferred). If any block has a problem, nothing is imported —
        fix the file and re-upload.
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
            {importResult.failures.length > 0 && ` ${importResult.failures.length} failed.`}
          </p>
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr><th className="text-left p-2">Team</th><th className="text-left p-2">Login ID</th><th className="text-left p-2">Default Password</th></tr>
            </thead>
            <tbody>
              {importResult.created.map((c) => (
                <tr key={c.loginId} className="border-t">
                  <td className="p-2">{c.teamName}</td>
                  <td className="p-2 font-mono">{c.loginId}</td>
                  <td className="p-2 font-mono">{c.defaultPassword}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-2">
            Circulate these credentials to captains (Req 2.2, 10.2). SMS/WhatsApp delivery is a follow-on —
            export this table for now.
          </p>
        </div>
      )}
    </div>
  );
}
