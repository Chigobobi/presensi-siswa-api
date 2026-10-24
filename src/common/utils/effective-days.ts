const DAY_MS = 86_400_000;

/**
 * Hitung jumlah hari kerja (Senin-Jumat) dalam rentang [from, to] inklusif.
 * Pakai UTC agar konsisten dengan penyimpanan @db.Date.
 */
export function countEffectiveDays(from: Date, to: Date): number {
  if (to < from) return 0;
  let count = 0;
  const cur = new Date(from.getTime());
  while (cur <= to) {
    const dow = cur.getUTCDay(); // 0=Minggu, 6=Sabtu
    if (dow !== 0 && dow !== 6) count++;
    cur.setTime(cur.getTime() + DAY_MS);
  }
  return count;
}
