import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';

export interface SavedFile {
  fileName: string; // nama file yang disimpan (unik)
  filePath: string; // path relatif (untuk DB)
  fileSize: number; // bytes
  mimeType: string;
}

/**
 * Storage lokal untuk file surat sakit.
 * - Nama file unik: {timestamp}-{random}-{sanitized-original}
 * - Disimpan di UPLOAD_DIR/sick-letters/
 * - Auto-cleanup saat record dihapus
 */
@Injectable()
export class LocalStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly baseDir: string;

  constructor(private readonly config: ConfigService) {
    const uploadDir = this.config.get<string>('UPLOAD_DIR') ?? './uploads';
    this.baseDir = resolve(uploadDir, 'sick-letters');
    this.logger.log(`Storage dir: ${this.baseDir}`);
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  /** Sanitasi nama file: hanya a-zA-Z0-9-_. */
  private sanitize(name: string): string {
    return (
      name
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'file'
    );
  }

  /** Simpan buffer ke disk. Return metadata. */
  async save(originalName: string, buffer: Buffer, mimeType: string): Promise<SavedFile> {
    await this.ensureDir();

    const ts = Date.now();
    const rand = randomBytes(6).toString('hex');
    const safe = this.sanitize(originalName);
    const fileName = `${ts}-${rand}-${safe}`;

    const absPath = join(this.baseDir, fileName);
    await fs.writeFile(absPath, buffer);

    return {
      fileName,
      filePath: join('sick-letters', fileName), // relatif terhadap UPLOAD_DIR
      fileSize: buffer.length,
      mimeType,
    };
  }

  /** Hapus file dari disk. Tidak throw kalau file tidak ada. */
  async remove(filePath: string): Promise<void> {
    try {
      const abs = resolve(this.baseDir, '..', filePath);
      await fs.unlink(abs);
      this.logger.log(`File dihapus: ${filePath}`);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.logger.warn(`File tidak ditemukan (sudah dihapus?): ${filePath}`);
      } else {
        this.logger.error(`Gagal hapus file: ${filePath}`, err as Error);
      }
    }
  }

  /** Path absolut untuk download. */
  getAbsolutePath(filePath: string): string {
    return resolve(this.baseDir, '..', filePath);
  }
}
