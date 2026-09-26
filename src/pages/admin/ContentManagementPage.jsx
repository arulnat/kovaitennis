// src/pages/admin/ContentManagementPage.jsx
//
// Req 13.1 (Rules & Regulations) and 13.2 (Welcome Note) — the two
// content items in the MVP scope. Newsletter (13.4) and Prize Gallery
// (13.3) are deferred (LP) per the priority roadmap.

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';

export default function ContentManagementPage({ seasonId }) {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <PageHeader title="Content Management" />
      <RulesEditor />
      <WelcomeNoteEditor seasonId={seasonId} />
    </div>
  );
}

function RulesEditor() {
  const [title, setTitle] = useState('Rules & Regulations');
  const [bodyHtml, setBodyHtml] = useState('');
  const [saving, setSaving] = useState(false);

  // Req 13.1: admin uploads a doc (PDF/Word); production wires this to
  // mammoth.js (Word) / pdf.js (PDF) conversion server-side or in an
  // Edge Function. This scaffold accepts pasted/typed HTML directly so
  // the publish flow can be exercised without that conversion step yet.
  async function handleSave(publish) {
    setSaving(true);
    const { error } = await supabase.from('content_pages').upsert(
      { page_type: 'rules_and_regulations', season_id: null, title, body_html: bodyHtml, published: publish },
      { onConflict: 'page_type,season_key' }
    );
    setSaving(false);
    if (error) alert(error.message);
    else alert(publish ? 'Published.' : 'Saved as draft.');
  }

  return (
    <section className="border rounded p-4">
      <h2 className="font-medium mb-2">Rules &amp; Regulations</h2>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className="border rounded px-2 py-1 text-sm w-full mb-2" />
      <textarea
        value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)}
        rows={8} placeholder="Paste or write the rendered content here (doc-to-HTML conversion wires in here)"
        className="border rounded px-2 py-1 text-sm w-full font-mono"
      />
      <div className="flex gap-2 mt-2">
        <button onClick={() => handleSave(false)} disabled={saving} className="px-3 py-1.5 rounded border text-sm">Save draft</button>
        <button onClick={() => handleSave(true)} disabled={saving} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm">Publish</button>
      </div>
    </section>
  );
}

function WelcomeNoteEditor({ seasonId }) {
  const [bodyHtml, setBodyHtml] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave(publish) {
    setSaving(true);
    const { error } = await supabase.from('content_pages').upsert(
      { page_type: 'welcome_note', season_id: seasonId, title: 'Welcome Note', body_html: bodyHtml, published: publish },
      { onConflict: 'page_type,season_key' }
    );
    setSaving(false);
    if (error) alert(error.message);
    else alert(publish ? 'Published.' : 'Saved as draft.');
  }

  return (
    <section className="border rounded p-4">
      <h2 className="font-medium mb-2">Welcome Note — this season only</h2>
      <textarea
        value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)}
        rows={6} placeholder="Written by the secretary, signed by office bearers"
        className="border rounded px-2 py-1 text-sm w-full font-mono"
      />
      <div className="flex gap-2 mt-2">
        <button onClick={() => handleSave(false)} disabled={saving} className="px-3 py-1.5 rounded border text-sm">Save draft</button>
        <button onClick={() => handleSave(true)} disabled={saving} className="px-3 py-1.5 rounded bg-teal-700 text-white text-sm">Publish</button>
      </div>
    </section>
  );
}
