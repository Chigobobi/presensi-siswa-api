export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
}

export interface DatabaseConfig {
  url: string;
}

export interface SessionConfig {
  secret: string;
  name: string;
  maxAge: number; // ms
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
}

export interface SecurityConfig {
  bcryptRounds: number;
  csrfSecret: string;
}

export interface UploadConfig {
  dir: string;
  maxSizeBytes: number;
}

export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  } as AppConfig,

  database: {
    url: process.env.DATABASE_URL ?? '',
  } as DatabaseConfig,

  session: {
    secret: process.env.SESSION_SECRET ?? '',
    name: process.env.SESSION_COOKIE_NAME ?? 'presensi_session',
    maxAge: parseInt(process.env.SESSION_MAX_AGE_MS ?? '28800000', 10), // 8 jam
    secure: process.env.NODE_ENV === 'production',
    sameSite: (process.env.SESSION_SAME_SITE ?? 'lax') as 'lax' | 'strict' | 'none',
  } as SessionConfig,

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
    csrfSecret: process.env.CSRF_SECRET ?? '',
  } as SecurityConfig,

  upload: {
    dir: process.env.UPLOAD_DIR ?? './uploads',
    maxSizeBytes: parseInt(process.env.UPLOAD_MAX_SIZE_BYTES ?? '5242880', 10), // 5 MB
  } as UploadConfig,
});
