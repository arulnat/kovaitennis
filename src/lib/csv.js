// src/lib/csv.js
//
// Shared CSV-download helper — was private to bulkUpload.js, pulled out
// so other pages (e.g. the Fixtures Calendar) can reuse the same
// properly-escaped CSV building (via SheetJS) instead of hand-rolling it.

/** Builds a CSV from rows (array of arrays) and triggers a browser download. Requires `xlsx`. */
export async function downloadCsv(rows, filename) {
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
