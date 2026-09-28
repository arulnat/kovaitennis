// src/lib/phone.js
//
// Indian 10-digit mobile number normalization, used everywhere a phone
// number is entered (bulk upload's captain phone, Contact Us). Logic:
// strip spaces, strip a leading "+", then strip a leading country code
// "91" ONLY if what's left is 12 digits (91 + 10 more) — a 10-digit
// number that happens to start with "91" is left alone. Whatever
// remains must be exactly 10 digits, or the number is rejected.

/** @returns {{ok:true, value:string} | {ok:false}} */
export function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/\s+/g, '').replace(/^\+/, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return /^\d{10}$/.test(digits) ? { ok: true, value: digits } : { ok: false };
}
