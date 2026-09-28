// src/pages/ContactUsPage.jsx
//
// Public contact form — no email service is wired up in this project,
// so a submission is stored as a row an admin reads on the Messages
// admin page, rather than an email that would go nowhere.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { normalizePhone } from '../lib/phone.js';

export default function ContactUsPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !details.trim()) {
      setError('Name, email, and details are required.');
      return;
    }

    let normalizedPhone = null;
    if (phone.trim()) {
      const result = normalizePhone(phone);
      if (!result.ok) {
        setError('Contact number must be a 10-digit number (spaces are fine; a leading +91 or 91 is fine).');
        return;
      }
      normalizedPhone = result.value;
    }

    setSubmitting(true);
    const { error: insertErr } = await supabase.from('contact_messages').insert({
      name: name.trim(),
      email: email.trim(),
      phone: normalizedPhone,
      subject: subject.trim() || null,
      details: details.trim(),
    });
    setSubmitting(false);
    if (insertErr) { setError(insertErr.message); return; }
    setSent(true);
  }

  return (
    <div className="max-w-sm mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="bg-teal-900 px-6 py-4 border-b-4 border-accent-500">
          <h1 className="text-lg font-extrabold uppercase tracking-wide text-white">Contact Us</h1>
        </div>
        <div className="p-6">
          {sent ? (
            <>
              <p className="text-sm text-gray-700 mb-4">Thanks — your message has been sent. We'll get back to you shortly.</p>
              <Link to="/login" className="text-teal-700 text-sm underline">Back to Sign In</Link>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="text-sm text-gray-600 mb-4">Enter your details, we will connect with you shortly!</p>
              <input placeholder="Enter name" value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mb-2" />
              <input placeholder="Enter email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mb-2" />
              <input placeholder="Enter contact number" value={phone} onChange={(e) => setPhone(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mb-2" />
              <input placeholder="Enter subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mb-2" />
              <textarea
                placeholder="Enter details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
                className="border rounded px-3 py-2 text-sm w-full mb-2"
              />
              {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded bg-teal-700 text-white text-sm font-bold uppercase tracking-wide hover:bg-teal-800 shadow disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send'}
              </button>
              <p className="text-xs text-gray-500 mt-3">
                Already have an account? <Link to="/login" className="text-teal-700 underline">Sign In</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
