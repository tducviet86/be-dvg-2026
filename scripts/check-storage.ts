/**
 * Checks the object storage configured in .env (Cloudflare R2 / S3):
 * uploads a tiny test file, reads it back through MEDIA_PUBLIC_BASE_URL and
 * deletes it. Prints what to fix when a step fails. Never prints the keys.
 *   npm run storage:check
 */
import 'dotenv/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const env = process.env;
const step = (ok: boolean, label: string, hint = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${!ok && hint ? `\n    → ${hint}` : ''}`);
  if (!ok) process.exit(1);
};

step(env.STORAGE_DRIVER === 's3', 'STORAGE_DRIVER=s3', 'Đổi STORAGE_DRIVER=local thành s3 trong .env.');
for (const key of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const)
  step(!!env[key] && !env[key]!.includes('<'), `${key} đã điền`, `Dán giá trị ${key} từ Cloudflare R2.`);
const base = (env.MEDIA_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
step(/^https:\/\//.test(base), 'MEDIA_PUBLIC_BASE_URL là địa chỉ https', 'Dùng Public Development URL (https://pub-….r2.dev) hoặc custom domain của bucket.');

const client = new S3Client({
  region: env.S3_REGION || 'auto',
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
});
const key = `healthcheck/${Date.now()}.txt`;
const body = `dvg storage check ${new Date().toISOString()}`;
try {
  await client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: 'text/plain' }));
  step(true, `Ghi tệp thử vào bucket ${env.S3_BUCKET}`);
} catch (err) {
  const name = (err as Error).name;
  step(
    false,
    `Ghi tệp thử vào bucket ${env.S3_BUCKET} (${name})`,
    name === 'NoSuchBucket'
      ? 'Sai tên bucket (S3_BUCKET).'
      : /AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch|Unauthorized/.test(name)
        ? 'Sai Access Key/Secret hoặc token không có quyền Object Read & Write cho bucket này.'
        : 'Kiểm tra S3_ENDPOINT (https://<ACCOUNT_ID>.r2.cloudflarestorage.com, không kèm tên bucket).',
  );
}
try {
  await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  step(true, 'Đọc lại tệp qua API');
} catch (err) {
  step(false, `Đọc lại tệp qua API (${(err as Error).name})`, 'Token cần quyền Object Read & Write.');
}
const res = await fetch(`${base}/${key}`).catch(() => null);
step(
  !!res?.ok && (await res.text()) === body,
  `Mở công khai ${base}/…`,
  'Bật Public Development URL (r2.dev) hoặc gắn custom domain cho bucket, rồi đặt MEDIA_PUBLIC_BASE_URL đúng địa chỉ đó.',
);
await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
step(true, 'Xóa tệp thử');
console.log('\nR2 sẵn sàng. Khởi động lại API, rồi thêm địa chỉ media vào FE-DVG/.env.local (MEDIA_REMOTE_PATTERNS) và khởi động lại website.');
