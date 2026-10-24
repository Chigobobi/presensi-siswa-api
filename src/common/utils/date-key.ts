import { BadRequestException } from '@nestjs/common';

/**
 * Validasi tanggal string "YYYY-MM-DD" → Date.
 * Normalisasi: trim, koma → strip, unicode.
 */
export function parseDateKey(date: string): Date {
  if (typeof date !== 'string' || !date.trim()) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Tanggal wajib diisi.',
    });
  }

  const normalized = date.trim().replace(/,/g, '-').normalize('NFKC');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: `Tanggal "${date}" tidak valid. Format: YYYY-MM-DD (contoh: 2026-10-16).`,
    });
  }

  const d = new Date(`${normalized}T00:00:00.000Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== normalized) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: `Tanggal "${date}" bukan tanggal kalender yang valid.`,
    });
  }

  return d;
}
