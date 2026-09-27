// src/lib/functionsError.js
//
// An Edge Function returns a non-2xx status with a JSON {error} body for
// its own expected failures (e.g. "still grouped") — supabase-js doesn't
// parse that into error.message itself, so this pulls it from the raw
// response. Shared by every page that calls delete-team or similar.

export async function extractFunctionErrorMessage(error) {
  try {
    const body = await error.context.json();
    if (body?.error) return body.error;
  } catch { /* fall back to error.message below */ }
  return error.message;
}
