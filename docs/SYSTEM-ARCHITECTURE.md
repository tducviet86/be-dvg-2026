# Kiến trúc hệ thống

## Tổng quan

```
Internet
   │  HTTPS (CDN / reverse proxy)
   ├── datvanggroup.vn ──────────► FE-DVG  (Next.js 16, Node server)
   │                                 │  /api/v1/*, /media/*  → proxy (rewrites)
   │                                 │  server-side fetch    → API_INTERNAL_URL
   │                                 ▼
   └── api.datvanggroup.vn (tùy chọn) ► BE-DVG (NestJS 12, Node 22)
                                         ├── PostgreSQL 17+  (Prisma 7)
                                         └── Object storage S3-compatible (media)
```

- **Modular monolith** NestJS: mỗi nghiệp vụ một module (`auth`, `users`, `audit`, `media`, `banners`, `projects`, `properties`, `blog`, `pages`, `settings`, `leads`, `seo`, `health`, `revalidation`). Không tách microservice — quy mô nghiệp vụ hiện tại không cần.
- **Một nguồn sự thật**: PostgreSQL. FE không còn dữ liệu nghiệp vụ trong mã nguồn (chỉ còn ảnh/nội dung marketing tĩnh: `photos`, `services`, FAQ cho thuê).

## Luồng dữ liệu

| Luồng | Cách hoạt động |
|---|---|
| Trang công khai | Server Component gọi `GET /api/v1/...` qua `API_INTERNAL_URL` với `fetch(..., { next: { revalidate: 300, tags } })`. Trang được render theo yêu cầu (SSR), dữ liệu được cache theo tag. |
| Admin lưu dữ liệu | Trình duyệt → `/api/v1/admin/*` (cùng origin, proxy sang BE) → transaction PostgreSQL → audit log → BE gọi webhook `POST /api/revalidate` của FE (có secret, chờ tối đa 3 s) → `revalidateTag(tag, { expire: 0 })` → lượt xem tiếp theo có dữ liệu mới. |
| Form khách hàng | `POST /api/v1/contact|inquiries|newsletter` → kiểm tra hợp lệ, honeypot, thời gian điền form, rate limit, chống trùng → bảng `leads`. Chỉ báo thành công khi API trả 202. |
| Media | Upload multipart → kiểm tra chữ ký file thật → `sharp` xoay theo EXIF, giới hạn 2560 px, mã hóa WebP (loại bỏ metadata) → object storage với key ngẫu nhiên → bản ghi `media_assets`. |
| Xem trước | `GET /api/preview?type=project|post&slug=` (FE) chuyển cookie phiên của biên tập viên tới endpoint `admin/*/preview` → bật Draft Mode → trang hiển thị bản nháp, `noindex`, không cache. |

## Quyết định kiến trúc & đánh đổi

1. **NestJS 12 (ESM) + Prisma 7.10 (stable)** thay vì Prisma 8 (đang RC). Prisma 7 dùng driver adapter `@prisma/adapter-pg`, client sinh ra trong `src/generated/prisma`.
2. **Trình duyệt gọi API qua chính domain website** (Next.js rewrites). Ưu điểm: cookie phiên là first-party `SameSite=Strict`, không cần CORS cho admin, không lộ host API. Đánh đổi: rewrites được tính lúc build ⇒ `API_INTERNAL_URL` phải đúng khi build image FE.
3. **Render động + cache dữ liệu theo tag** thay vì SSG/ISR toàn trang. Trước đây `dynamicParams = false` khiến dự án mới trả 404 tới lần build sau. Nay URL mới hoạt động ngay, build không phụ thuộc API, HTML luôn render phía server (crawler nhận nội dung đầy đủ). Đánh đổi: mỗi request render HTML (TTFB đo được ~60 ms nội bộ); có thể bật cache HTML ở CDN sau này (xem `DEPLOYMENT-GUIDE.md`).
4. **Revalidate đồng bộ có timeout**: lưu thành công ⇒ trang công khai cập nhật ngay; nếu FE không phản hồi trong 3 s, dữ liệu vẫn được lưu và tự làm mới sau tối đa 5 phút.
5. **Xác thực**: JWT access token 15 phút (cookie httpOnly) + refresh token ngẫu nhiên lưu dạng hash, xoay vòng mỗi lần dùng; dùng lại token đã xoay ⇒ thu hồi cả "family" phiên. Mỗi request admin kiểm tra phiên trong DB (khóa/vô hiệu hóa có hiệu lực ngay). CSRF double-submit cho request dùng cookie.
6. **Soft delete (lưu trữ)** cho dự án, căn hộ, bài viết, lead; URL lưu trữ trả 410 ở API (404 ở website). Banner bị xóa thật vì không có giá trị lịch sử.
7. **Nội dung bài viết là văn bản thuần** (FE chưa có rich text editor): mọi thẻ HTML bị loại khi lưu ⇒ không có stored XSS.
8. **Một banner trên mỗi dự án**: `banners.project_id UNIQUE` + CHECK constraint ở DB; form dự án và module Banner cùng ghi một bản ghi, có kiểm tra xung đột phiên bản.

## Cấu trúc thư mục BE-DVG

```
src/
  main.ts, bootstrap.ts, app.module.ts
  config/            env.ts (zod, chặn khởi động khi cấu hình sai), config.service.ts
  database/          prisma.service.ts, database.module.ts (CoreModule)
  common/            errors, filters (định dạng lỗi chuẩn), decorators, dto, utils
  modules/<module>/  controller + service + dto (+ mapper)
prisma/              schema.prisma, migrations/, reference-data.ts, seed.ts, data/*.json
scripts/             import-legacy, seed-demo, create-admin, reset-database, export-fe-content
test/                e2e (Vitest + Supertest, DB thật)
```
