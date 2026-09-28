// src/pages/admin/MessagesPage.jsx
//
// Admin inbox for the public Contact Us form (src/pages/ContactUsPage.jsx).
// No email service is wired up in this project, so a submission lands
// here as a row instead of an email that would go nowhere.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import PageHeader from '../../components/PageHeader.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function MessagesPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false });
    if (error) { alert(error.message); setLoading(false); return; }
    setMessages(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleResolved(m) {
    const { error } = await supabase.from('contact_messages').update({ resolved: !m.resolved }).eq('id', m.id);
    if (error) { alert(error.message); return; }
    load();
  }

  const unresolvedCount = messages.filter((m) => !m.resolved).length;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <PageHeader
        title="Messages"
        subtitle={`Contact Us submissions. ${unresolvedCount} unresolved.`}
      />

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-gray-500">No messages yet.</p>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`border rounded p-3 ${m.resolved ? 'bg-slate-50' : 'bg-white'}`}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <div>
                  <p className="font-semibold text-sm">{m.name} <span className="text-gray-400 font-normal">— {m.email}</span></p>
                  {m.phone && <p className="text-xs text-gray-500">{m.phone}</p>}
                </div>
                <span className="text-xs text-gray-400 shrink-0">{formatDate(m.created_at)}</span>
              </div>
              {m.subject && <p className="text-sm font-medium mb-1">{m.subject}</p>}
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{m.details}</p>
              <button onClick={() => toggleResolved(m)} className="text-xs text-teal-700 underline">
                {m.resolved ? 'Mark unresolved' : 'Mark resolved'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
