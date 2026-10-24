/**
 * Formatter CSV sederhana tanpa dependency eksternal.
 * Escape: bungkus field dengan quote jika mengandung koma, quote, atau newline.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

function escapeCsvField(raw: string | number): string {
  const s = String(raw ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Bangun CSV dari daftar baris.
 * @param columns definisi kolom
 * @param rows data
 * @param footer baris total (opsional)
 */
export function buildCsv<T>(
  columns: CsvColumn<T>[],
  rows: T[],
  footer?: (totals: T) => Array<string | number>,
): string {
  const lines: string[] = [];

  // Header
  lines.push(columns.map((c) => escapeCsvField(c.header)).join(','));

  // Data
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvField(c.value(row))).join(','));
  }

  // Footer (opsional)
  if (footer && rows.length > 0) {
    const totals = rows.reduce<T>((acc, row) => {
      // Gabungkan numeric field secara naive — hanya untuk kolom angka
      const merged = { ...acc } as Record<string, unknown>;
      const r = row as Record<string, unknown>;
      for (const key of Object.keys(r)) {
        const v = r[key];
        if (typeof v === 'number') {
          merged[key] = (Number(merged[key]) || 0) + v;
        } else {
          merged[key] = merged[key] ?? v;
        }
      }
      return merged as T;
    }, {} as T);
    lines.push(footer(totals).map((v) => escapeCsvField(v)).join(','));
  }

  return lines.join('\r\n');
}
