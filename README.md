# BE-DVG · API Đất Vàng Group

API cho website và Admin CMS của Đất Vàng Group: NestJS 12 (TypeScript strict, ESM), PostgreSQL + Prisma 7, xác thực cookie httpOnly + CSRF, lưu media trên S3-compatible storage, OpenAPI.

## Yêu cầu

- Node.js ≥ 22.22, **npm 11** (`npx npm@11 …` hoặc `npm i -g npm@11`; npm 10 gặp lỗi resolve peer deps của Vite và bỏ qua `allowScripts`).
- PostgreSQL ≥ 16.

## Bắt đầu

```bash
cp .env.example .env            # điền DATABASE_URL và các secret (openssl rand …)
npm ci                           # chạy prisma generate
npm run db:migrate:dev           # tạo schema
npm run db:seed                  # vai trò, quyền, danh mục tham chiếu
npm run import:legacy -- --publish   # nội dung cũ của website (chỉ dev/staging khi chưa duyệt)
npm run seed:demo                # căn hộ/bài viết minh họa (bị chặn ở production)
ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… npm run admin:create
npm run start:dev                # http://localhost:4000/api/v1 · tài liệu: /api/docs
```

## Lệnh

| Lệnh | Mục đích |
|---|---|
| `npm run typecheck` / `lint` / `build` | Kiểm tra kiểu, oxlint, build `dist/` |
| `npm test` | Unit test (Vitest) |
| `npm run test:e2e` | API test với PostgreSQL thật (`TEST_DATABASE_URL`, mặc định `dvg_test` cục bộ) |
| `npm run db:migrate` | `prisma migrate deploy` (staging/production) |
| `npm run db:reset:disposable` | Reset DB `*_e2e` / `*_test` (từ chối DB khác) |
| `npm run start:prod` | `node dist/main.js` |

## Tài liệu

`docs/`: FE-DVG-AUDIT · SYSTEM-ARCHITECTURE · DATABASE-DESIGN · API-CONTRACT · FRONTEND-INTEGRATION · ADMIN-CMS-GUIDE · DATA-MIGRATION · SEO-CHECKLIST · DEPLOYMENT-GUIDE · SECURITY-CHECKLIST · PRODUCTION-READINESS.
# be-dvg-2026
