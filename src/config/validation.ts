import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),

  // Database
  DATABASE_URL: Joi.string().required().messages({
    'any.required': 'DATABASE_URL wajib diisi (contoh: postgresql://user:pass@localhost:5432/db)',
  }),

  // Session
  SESSION_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'SESSION_SECRET minimal 32 karakter',
    'any.required': 'SESSION_SECRET wajib diisi',
  }),
  SESSION_COOKIE_NAME: Joi.string().default('presensi_session'),
  SESSION_MAX_AGE_MS: Joi.number().integer().positive().default(28800000),
  SESSION_SAME_SITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),

  // Security
  BCRYPT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  CSRF_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'CSRF_SECRET minimal 32 karakter',
    'any.required': 'CSRF_SECRET wajib diisi',
  }),

  // Upload
  UPLOAD_DIR: Joi.string().default('./uploads'),
  UPLOAD_MAX_SIZE_BYTES: Joi.number().integer().positive().default(5242880),
});
