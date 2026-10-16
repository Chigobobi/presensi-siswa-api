import { Role } from '@prisma/client';

/**
 * User yang tersimpan di sesi server.
 * Dibuat dari data database saat login, disimpan di session store (Redis/DB).
 */
export interface SessionUser {
  id: string;
  email: string;
  nama: string;
  role: Role;
  kelasId: string | null;
}
