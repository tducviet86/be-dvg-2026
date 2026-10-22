// Test environment: a dedicated local database, never the dev/prod one.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://dvg@127.0.0.1:5433/dvg_test?schema=public';
process.env.APP_ORIGINS = 'http://localhost:3000';
process.env.SITE_URL = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.IP_HASH_SALT = 'test-salt-0123456789';
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_MEDIA_DIR = './.local/test-media';
process.env.MEDIA_PUBLIC_BASE_URL = 'http://localhost:4000/media';
process.env.LOG_LEVEL = 'silent';
process.env.COOKIE_SECURE = 'false';
process.env.FRONTEND_REVALIDATE_URL = '';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GEMINI_API_BASE = 'http://127.0.0.1:4199';
process.env.REVALIDATE_SECRET = 'test-revalidate-secret-0123456789';
