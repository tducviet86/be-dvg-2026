# Security checklist

## Đã triển khai

| Hạng mục | Cách làm | Kiểm chứng |
|---|---|---|
| Kiểm tra cấu hình khi khởi động | `src/config/env.ts` (zod). Production từ chối: lưu trữ local, thiếu S3, cookie không Secure, origin không HTTPS, secret ngắn, tắt rate limit | Khởi động thất bại với thông báo rõ ràng |
| Bí mật ngoài mã nguồn | `.env` bị gitignore; `.env.example` không chứa giá trị; tài khoản admin tạo bằng lệnh với biến môi trường tạm | |
| Mật khẩu | Argon2id (19 MiB, t=2, p=1 — mức tối thiểu OWASP), tự rehash khi tăng tham số; tối thiểu 12 ký tự | |
| Chống dò mật khẩu | Rate limit 5 lần/phút/IP cho login; khóa tài khoản 15 phút sau 5 lần sai; thông báo lỗi giống nhau cho email không tồn tại; thời gian xử lý tương đương (hash giả) | `test/auth.e2e-spec.ts` |
| Phiên | Access JWT HS256 15 phút + refresh token ngẫu nhiên 256-bit, lưu **hash**, xoay vòng; dùng lại token cũ ⇒ thu hồi cả chuỗi + audit; vô hiệu hóa người dùng / đổi mật khẩu / đổi vai trò ⇒ thu hồi phiên ngay | `auth.e2e-spec.ts` |
| Cookie | `HttpOnly` (token), `SameSite=Strict`, `Secure` (bắt buộc ở production), refresh token giới hạn path `/api/v1/auth`. **Không** lưu token trong `localStorage` | |
| CSRF | Double-submit (`dvg_csrf` cookie ↔ header `X-CSRF-Token`, so sánh thời gian hằng) cho mọi request ghi dùng cookie | `auth.e2e-spec.ts` |
| Phân quyền | Guard toàn cục: mọi route mặc định cần đăng nhập (`@Public` mới mở); quyền theo vai trò; xuất bản cần `content:publish`; sales chỉ thấy lead của mình | `access.e2e-spec.ts` (401 cho 13 route admin, 403 theo vai trò) |
| Validation | `ValidationPipe` whitelist + `forbidNonWhitelisted`; giới hạn độ dài; slug/URL/điện thoại/tiền bằng regex; body JSON ≤ 1 MB | |
| SQL injection | Chỉ dùng Prisma query builder / tagged template; raw SQL duy nhất là TRUNCATE trong script reset DB (tên bảng lấy từ catalog, chỉ chạy trên DB `*_e2e`/`*_test`) | |
| XSS | Mọi chuỗi nội dung bị loại HTML khi lưu (`sanitize-html`, allowlist rỗng); FE render text (không `dangerouslySetInnerHTML` cho dữ liệu người dùng; JSON-LD escape `<`) | `projects.e2e-spec.ts`, `content.e2e-spec.ts` |
| Upload | Kiểm tra **chữ ký file** (không tin MIME/đuôi); chỉ JPG/PNG/WebP/AVIF; giới hạn dung lượng (`MAX_UPLOAD_MB`) và 80 MP; re-encode WebP (xóa EXIF/GPS, payload ẩn); key ngẫu nhiên; không xóa ảnh đang dùng | `content.e2e-spec.ts` (SVG giả mạo PNG ⇒ 415) |
| Header bảo mật | Helmet: CSP `default-src 'none'` cho API, `frame-ancestors 'none'`, HSTS (production), `X-Content-Type-Options`, ẩn `X-Powered-By` | |
| CORS | Allowlist `APP_ORIGINS`, credentials; admin dùng cùng origin qua proxy | |
| Rate limit | Toàn cục 300/phút/IP; form công khai 5/10 phút/IP; `TRUST_PROXY` để lấy IP thật sau proxy | |
| Chống spam form | Honeypot, thời gian điền tối thiểu, chống gửi trùng 10 phút, yêu cầu đồng ý | `content.e2e-spec.ts` |
| Dữ liệu cá nhân | IP chỉ lưu hash có salt; log ẩn `authorization`, `cookie`, `set-cookie`, CSRF; không log body form; API công khai không trả dữ liệu nháp/nội bộ (`settings/public` chỉ khóa công khai) | `access.e2e-spec.ts` |
| Xuất dữ liệu | CSV chỉ cho `leads:export`, có audit log, chặn CSV/formula injection (`=`, `+`, `-`, `@`) | `content.e2e-spec.ts` |
| Audit log | Đăng nhập (thành công/thất bại/khóa), refresh bất thường, mọi thao tác ghi CMS, xuất dữ liệu, upload/xóa media | |
| Phụ thuộc | `npm audit`: 0 lỗ hổng (BE, FE — production và dev). npm 11 `allowScripts`: chỉ cho phép install script của prisma, argon2, esbuild, fsevents; chặn script telemetry | CI chạy `npm audit --audit-level=high` |
| Container | Image không chạy root, healthcheck, tách image migrate | |

## Cần làm trước/khi go-live

- [ ] HTTPS ở CDN/proxy; `COOKIE_SECURE=true`; `TRUST_PROXY` đúng số proxy.
- [ ] Tài khoản PostgreSQL **ít quyền**: user ứng dụng chỉ `SELECT/INSERT/UPDATE/DELETE` trên schema; user migrate riêng có quyền DDL (dùng cho job migrate).
- [ ] Bucket media: chỉ đọc công khai đối tượng `uploads/*`; khóa ghi chỉ cho IAM user của API; bật versioning/lifecycle.
- [ ] Lưu bí mật trong secret manager của nền tảng (không trong image/compose).
- [ ] Bật backup tự động + thử khôi phục (xem DEPLOYMENT-GUIDE).
- [ ] Giám sát: cảnh báo 5xx, `auth.refresh_reuse_detected`, `auth.account_locked` tăng đột biến.
- [ ] Cân nhắc MFA cho tài khoản admin (chưa triển khai).
- [ ] Chính sách bảo mật & đồng ý xử lý dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP; thời hạn lưu lead và quy trình xóa theo yêu cầu.
- [ ] Rà soát CSP cho website FE (hiện chưa đặt CSP cho trang Next.js).
