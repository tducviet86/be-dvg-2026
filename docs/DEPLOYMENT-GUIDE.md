# Deployment guide

> Chưa triển khai lên hạ tầng thật. Mọi bước dưới đây cần thông tin hạ tầng và thông tin đăng nhập do doanh nghiệp cung cấp, và cần phê duyệt trước khi chạy trên production.

## Kiến trúc đích

| Thành phần | Đề xuất | Ghi chú |
|---|---|---|
| DNS / CDN / TLS | Cloudflare hoặc tương đương | `datvanggroup.vn` → web; (tùy chọn) `api.datvanggroup.vn` → API |
| Web (FE-DVG) | Container Node 22 (`FE-DVG/Dockerfile`, standalone) | 2 instance sau load balancer |
| API (BE-DVG) | Container Node 22 (`BE-DVG/Dockerfile`, target `runtime`) | Mạng nội bộ với web; công khai qua `api.` là tùy chọn |
| PostgreSQL | Dịch vụ managed (PostgreSQL ≥ 16) | Backup tự động + PITR |
| Object storage | S3 / Cloudflare R2 / DigitalOcean Spaces… | Bucket `dvg-media`, phục vụ qua CDN |

Ba môi trường tách biệt: **development** (máy dev, `STORAGE_DRIVER=local`), **staging** (giống production, dữ liệu thử + demo được phép), **production** (không seed demo). Mỗi môi trường có DB, bucket, secret riêng.

## Biến môi trường

- BE: xem `BE-DVG/.env.example` (mọi biến đều có chú thích). Production bắt buộc: `DATABASE_URL`, `APP_ORIGINS` (https), `SITE_URL`, `JWT_ACCESS_SECRET` (≥32 ký tự ngẫu nhiên), `COOKIE_SECURE=true`, `STORAGE_DRIVER=s3` + `S3_*`, `MEDIA_PUBLIC_BASE_URL`, `FRONTEND_REVALIDATE_URL`, `REVALIDATE_SECRET` (≥24), `IP_HASH_SALT`, `TRUST_PROXY`.
- FE: `API_INTERNAL_URL` (**lúc build**), `NEXT_PUBLIC_SITE_URL`, `MEDIA_REMOTE_PATTERNS`, `REVALIDATE_SECRET` (runtime).

Ứng dụng từ chối khởi động nếu cấu hình production không hợp lệ.

## Build & phát hành

```bash
# API
docker build -t registry/be-dvg:$SHA --target runtime BE-DVG
docker build -t registry/be-dvg-migrate:$SHA --target migrate BE-DVG
# Web (rewrites tới API được cố định lúc build)
docker build -t registry/fe-dvg:$SHA \
  --build-arg API_INTERNAL_URL=http://be-dvg.internal:4000 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://datvanggroup.vn \
  --build-arg MEDIA_REMOTE_PATTERNS=https://media.datvanggroup.vn FE-DVG
```

Trình tự phát hành:
1. CI xanh (typecheck, lint, unit, e2e API, build, audit).
2. **Backup DB** (snapshot) ngay trước khi migrate.
3. Chạy job `be-dvg-migrate` (`prisma migrate deploy`) với user DB có quyền DDL.
4. Triển khai API mới (rolling), chờ `/api/v1/health/ready` = 200.
5. Triển khai web mới.
6. Smoke test: trang chủ, 1 dự án, `/sitemap.xml`, đăng nhập Admin, gửi form thử trên staging.

Lần đầu trên một môi trường: `npm run db:seed` (dữ liệu tham chiếu) và `npm run admin:create` (biến môi trường tạm). Không chạy `seed:demo` trên production (script tự chặn).

## Chiến lược migration

- Chỉ `migrate deploy` ngoài máy dev; không bao giờ `migrate dev`/`reset` trên staging/production.
- Thay đổi tương thích ngược (expand → contract): thêm cột/bảng trước, code mới dùng, phát hành sau mới xóa cột cũ.
- Migration phá hủy dữ liệu cần review riêng + backup đã kiểm chứng.

## Rollback

- **Code**: triển khai lại image tag trước (API và web độc lập).
- **Schema**: migration theo kiểu mở rộng nên code cũ vẫn chạy với schema mới ⇒ thường chỉ cần rollback code. Nếu bắt buộc: khôi phục snapshot trước migrate (mất dữ liệu ghi sau thời điểm đó — cần phê duyệt).
- **Cache FE**: gọi webhook revalidate (hoặc chờ 5 phút).

## Backup & khôi phục

- Managed DB: bật backup hằng ngày + point-in-time recovery, giữ ≥ 14 ngày; sao lưu chéo vùng nếu có.
- Thủ công / bổ sung:
  ```bash
  pg_dump --format=custom --no-owner "$DATABASE_URL" > dvg-$(date +%F).dump
  # Khôi phục vào DB trống (KHÔNG chạy vào production đang hoạt động khi chưa phê duyệt):
  pg_restore --clean --if-exists --no-owner -d "$RESTORE_DATABASE_URL" dvg-YYYY-MM-DD.dump
  ```
- Object storage: bật versioning; sao chép định kỳ sang bucket dự phòng.
- **Diễn tập khôi phục** mỗi quý vào môi trường staging; ghi lại thời gian khôi phục thực tế.

## Vận hành

- Health: `GET /api/v1/health` (liveness), `/api/v1/health/ready` (DB).
- Log: JSON có cấu trúc (pino) ra stdout, mỗi request có `x-request-id`; đưa vào hệ thống log tập trung.
- Graceful shutdown: SIGTERM → đóng kết nối HTTP và Prisma (`enableShutdownHooks`).
- Swagger tắt ở production (bật tạm bằng `SWAGGER_ENABLED=true` nếu cần, nên đặt sau xác thực của proxy).

## Chạy toàn bộ stack bằng Docker (máy dev)

```bash
cd BE-DVG
cat > .env.docker <<'EOF'
POSTGRES_PASSWORD=<random>
S3_ACCESS_KEY_ID=<random>
S3_SECRET_ACCESS_KEY=<random>
JWT_ACCESS_SECRET=<openssl rand -base64 48>
REVALIDATE_SECRET=<openssl rand -hex 24>
IP_HASH_SALT=<openssl rand -hex 16>
EOF
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker run --rm migrate
docker compose --env-file .env.docker run --rm migrate npm run db:seed
```
(Compose dùng cho phát triển; production dùng dịch vụ managed.)
