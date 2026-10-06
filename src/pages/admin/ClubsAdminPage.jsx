// src/pages/admin/ClubsAdminPage.jsx
//
// Clubs themselves are created indirectly (find-or-create by name, via
// a team's Club field on the Teams admin page or bulk upload) — this is
// the one place an admin fills in the rest of a club's own details:
// where it's located, its full address, how many courts it has, and
// what surface they're on. Shown on the club's public page
// (ClubProfilePage) and on every one of its teams' profile pages
// (TeamProfilePage), so players/captains know where they're headed and
// visiting captains know what to expect.
//
// Every club ever created shows here (not just ones with a team this
// season) — club details are persistent, season-independent facts, same
// as the club itself.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';
import Dropdown from '../../components/Dropdown.jsx';

const COURT_TYPES = [
  { value: '', label: 'Not set' },
  { value: 'synthetic', label: 'Synthetic' },
  { value: 'clay', label: 'Clay' },
  { value: 'both', label: 'Both' },
];

export default function ClubsAdminPage() {
  const [clubs, setClubs] = useState(null); // null = loading

  async function refresh() {
    const { data } = await supabase.from('clubs').select('*').order('name');
    setClubs(data || []);
  }

  useEffect(() => { refresh(); }, []);

  async function save(clubId, fields) {
    const { error } = await supabase.from('clubs').update(fields).eq('id', clubId);
    if (error) { alert(error.message); return; }
    refresh();
  }

  if (clubs === null) return <p className="p-6 text-gray-500">Loading…</p>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PageHeader
        title="Clubs"
        subtitle="Where each club plays — shown on the club's own public page and on every one of its teams' profile pages. Clubs themselves are created from a team's Club field (Manage Teams or bulk upload); this is just their location/address/court details."
      />

      {clubs.length === 0 ? (
        <p className="text-gray-500 text-sm">No clubs yet — add one via a team's Club field under Manage Teams.</p>
      ) : (
        <div className="space-y-3">
          {clubs.map((c) => (
            <ClubRow key={c.id} club={c} onSave={(fields) => save(c.id, fields)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClubRow({ club, onSave }) {
  const [location, setLocation] = useState(club.location ?? '');
  const [address, setAddress] = useState(club.address ?? '');
  const [numberOfCourts, setNumberOfCourts] = useState(club.number_of_courts ?? '');
  const [courtType, setCourtType] = useState(club.court_type ?? '');
  const [saving, setSaving] = useState(false);

  const dirty =
    location !== (club.location ?? '') ||
    address !== (club.address ?? '') ||
    String(numberOfCourts) !== String(club.number_of_courts ?? '') ||
    courtType !== (club.court_type ?? '');

  async function save() {
    setSaving(true);
    await onSave({
      location: location.trim() || null,
      address: address.trim() || null,
      number_of_courts: numberOfCourts === '' ? null : Number(numberOfCourts),
      court_type: courtType || null,
    });
    setSaving(false);
  }

  return (
    <div className="border rounded p-3 bg-white shadow-sm">
      <p className="font-bold text-teal-900 uppercase text-sm mb-2">{club.name}</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Coimbatore" className="border rounded px-2 py-1 text-sm w-full" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Number of courts</label>
          <input type="number" min="0" value={numberOfCourts} onChange={(e) => setNumberOfCourts(e.target.value)} className="border rounded px-2 py-1 text-sm w-full" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-600 mb-0.5">Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" className="border rounded px-2 py-1 text-sm w-full" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Court type</label>
          <Dropdown value={courtType} onChange={setCourtType} options={COURT_TYPES} className="text-sm w-full" />
        </div>
      </div>
      {dirty && (
        <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded bg-teal-700 text-white text-xs font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  );
}
