import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((value) => value === 'true' || value === '1');
const list = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    DATABASE_URL: z.string().url(),
    APP_ORIGINS: list,
    SITE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(14),
    COOKIE_SECURE: bool,
    COOKIE_DOMAIN: z.string().optional().default(''),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
    STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
    LOCAL_MEDIA_DIR: z.string().default('./.local/media'),
    // Absolute CDN/bucket URL, or a same-origin path such as /media (dev proxy).
    MEDIA_PUBLIC_BASE_URL: z.string().url().or(z.string().regex(/^\/[\w/-]*$/)),
    MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(8),
    /** Videos (MP4/WebM) are stored as uploaded, so they get their own limit. */
    MAX_VIDEO_MB: z.coerce.number().positive().max(500).default(100),
    S3_ENDPOINT: z.string().optional().default(''),
    S3_REGION: z.string().default('ap-southeast-1'),
    S3_BUCKET: z.string().optional().default(''),
    S3_ACCESS_KEY_ID: z.string().optional().default(''),
    S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
    S3_FORCE_PATH_STYLE: bool,
    FRONTEND_REVALIDATE_URL: z.string().url().optional().or(z.literal('')),
    REVALIDATE_SECRET: z.string().optional().default(''),
    IP_HASH_SALT: z.string().min(16, 'IP_HASH_SALT must be at least 16 chars'),
    /** Gemini API key for AI SEO suggestions; empty = feature off. */
    GEMINI_API_KEY: z.string().optional().default(''),
    GEMINI_MODEL: z.string().regex(/^[\w.-]+$/).default('gemini-3.8-flash'),
    /** Tried once when the main model is overloaded (503/429); empty = none. */
    GEMINI_FALLBACK_MODEL: z.string().regex(/^[\w.-]*$/).default('gemini-3.5-flash'),
    GEMINI_API_BASE: z.string().url().default('https://generativelanguage.googleapis.com'),
    /** Model for website translation (EN/KO/ZH): fast and cheap. */
    GEMINI_TRANSLATE_MODEL: z.string().regex(/^[\w.-]+$/).default('gemini-3.5-flash-lite'),
    /** Characters of NEW (uncached) text sent to Gemini per day; 0 = translation off. */
    /** Outgoing mail (new customer requests). Empty SMTP_HOST = mail off. */
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.coerce.number().int().default(465),
    SMTP_SECURE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    MAIL_FROM: z.string().optional().default(''),
    /** Recipient when Admin › Cài đặt has no "Email tiếp nhận yêu cầu". */
    LEADS_NOTIFY_EMAIL: z.string().optional().default(''),
    I18N_DAILY_CHAR_LIMIT: z.coerce.number().int().min(0).default(400_000),
    /** Rate limiting; may only be disabled for automated end-to-end runs. */
    THROTTLE_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (env.STORAGE_DRIVER !== 's3')
      fail('STORAGE_DRIVER', 'production requires s3 object storage');
    for (const key of [
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ] as const)
      if (!env[key]) fail(key, 'required in production');
    if (!env.COOKIE_SECURE) fail('COOKIE_SECURE', 'must be true in production');
    if (!env.APP_ORIGINS.length) fail('APP_ORIGINS', 'required in production');
    if (!env.THROTTLE_ENABLED) fail('THROTTLE_ENABLED', 'rate limiting cannot be disabled in production');
    if (env.APP_ORIGINS.some((origin) => !origin.startsWith('https://')))
      fail('APP_ORIGINS', 'production origins must use https');
    if (env.REVALIDATE_SECRET.length < 24)
      fail('REVALIDATE_SECRET', 'at least 24 characters in production');
  });

export type Env = z.infer<typeof envSchema>;

/** Validates process.env once at boot; refuses to start on bad config. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
