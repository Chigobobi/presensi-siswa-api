/**
 * Helper untuk waktu zona Asia/Jakarta (UTC+7).
 * Server diasumsikan UTC. Semua perbandingan waktu pakai Jakarta.
 */

export const JAKARTA_TZ = 'Asia/Jakarta';

/** Tanggal lokal Jakarta "YYYY-MM-DD" dari Date */
export function jakartaDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JAKARTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Jam & menit Jakarta { hour, minute } */
export function jakartaHourMinute(date: Date = new Date()): {
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: JAKARTA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: get('hour'), minute: get('minute') };
}

/** Total menit sejak 00:00 Jakarta */
export function jakartaMinutes(date: Date = new Date()): number {
  const { hour, minute } = jakartaHourMinute(date);
  return hour * 60 + minute;
}

/** Parse "HH:MM" → total menit */
export function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Apakah `now` dalam rentang [mulai, selesai) */
export function isWithinRange(nowMinutes: number, mulai: string, selesai: string): boolean {
  const start = parseHHMM(mulai);
  const end = parseHHMM(selesai);
  return nowMinutes >= start && nowMinutes < end;
}
