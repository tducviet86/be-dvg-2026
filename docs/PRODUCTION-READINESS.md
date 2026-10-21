# Production readiness — Đất Vàng Group

Cập nhật: 2026-10-21. **Trạng thái: sẵn sàng cho staging; chưa sẵn sàng go-live** (thiếu hạ tầng, thông tin đăng nhập và dữ liệu doanh nghiệp đã xác minh — xem mục Blockers).

## Kết quả kiểm tra (đã chạy thật)

| Kiểm tra | BE-DVG | FE-DVG |
|---|---|---|
| Typecheck (`tsc --noEmit`, strict) | ✅ | ✅ |
| Lint | ✅ oxlint, 0 cảnh báo | ✅ eslint, 0 cảnh báo |
| Unit test | ✅ 2/2 (Vitest) | — |
| API e2e trên PostgreSQL thật | ✅ 43/43 (auth, phân quyền, dự án/banner, căn hộ, blog, lead, media) | — |
| Playwright full-stack (BE + PostgreSQL + FE production build) | — | ✅ 37/37, gồm 16 kịch bản hành trình bắt buộc (`tests/journey.spec.ts`) và 11 kịch bản banner |
| Production build | ✅ `nest build` | ✅ `next build` |
| `npm audit` (prod + dev) | ✅ 0 lỗ hổng | ✅ 0 lỗ hổng (production) |
| Lighthouse mobile, trang chủ (3 lần, máy cục bộ) | — | Performance 89–92 · A11y 100 · Best practices 100 · SEO 100 · LCP 3.4–3.7 s · CLS 0 |
| Docker | ⚠️ `docker compose config` hợp lệ; **chưa build image** (Docker daemon trên máy dev không chạy) | ⚠️ như BE |
| CI | ⚠️ Workflow đã viết (`.github/workflows/ci.yml` ở cả hai repo), **chưa chạy** (chưa có remote GitHub) | ⚠️ |

## Hoàn thành

- Audit FE, kiến trúc, thiết kế DB, API contract, tài liệu vận hành (thư mục `docs/`).
- BE-DVG: NestJS modular monolith, Prisma/PostgreSQL với migration + CHECK constraint, OpenAPI.
- Xác thực admin: cookie httpOnly, refresh token xoay vòng + phát hiện tái sử dụng, CSRF, khóa tài khoản, rate limit, RBAC 3 vai trò, audit log.
- CMS: dự án (phân loại chồng lấp, SEO, gallery, highlight, bản đồ, hướng dẫn thuê, xem trước, xuất bản/lưu trữ, redirect slug), banner động (NORMAL/PROJECT, đồng bộ hai chiều, một nguồn dữ liệu, chống trùng, khóa phiên bản), căn hộ (giá VND số nguyên, bán/thuê/ký gửi, demo flag), blog (hẹn giờ, tag, chống XSS), trang tĩnh, cài đặt, người dùng, media library (kiểm tra chữ ký, WebP, kiểm tra tham chiếu khi xóa), lead (lọc, phân công, trạng thái, xuất CSV an toàn).
- FE: toàn bộ trang công khai đọc dữ liệu thật; form gửi API thật (không còn thông báo "demo"); Admin có đăng nhập; SEO động (metadata, canonical, 308, noindex demo/nháp, sitemap từ DB, JSON-LD Organization/WebSite/Breadcrumb/Article); xóa mock data và lời chia sẻ hư cấu.
- Dữ liệu: snapshot nội dung cũ có phân loại + nguồn gốc; script import có kiểm soát (DRAFT mặc định), seed demo bị chặn ở production, tạo admin không hardcode mật khẩu.

- AI gợi ý SEO (Gemini) cho bài viết, dự án, căn hộ: biên tập viên duyệt trước khi áp dụng; khóa chỉ ở máy chủ.
- Căn hộ: tải nhiều ảnh + video (MP4/MOV/WebM), chọn ảnh bìa, sắp xếp, xóa; không nhập link ngoài.

Hướng dẫn từng bước đưa lên thị trường: `GO-LIVE-GUIDE.md`.

## Còn lại (pending)

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Build & chạy image Docker, chạy CI trên GitHub | Cần Docker daemon / repository |
| 2 | Hotline/thông tin liên hệ trên website đọc từ `/settings/public` | Hiện vẫn từ `NEXT_PUBLIC_COMPANY_PHONE` + FAQ tĩnh |
| 3 | Admin quản lý trang tĩnh (`static_pages`) và chuyên mục blog trên giao diện | API đã có; UI chưa có màn hình riêng |
| 4 | Đổi mật khẩu tự phục vụ, MFA cho admin | Hiện quản trị viên đặt lại mật khẩu |
| 5 | Email thông báo lead mới (`leads.notificationEmail`) | Cần dịch vụ email (SES/SMTP) |
| 6 | Banner đồng ý cookie + GA4 | Cần quyết định về Nghị định 13/2023 |
| 7 | CSP cho website Next.js | API đã có CSP |
| 8 | Lọc căn hộ `/cho-thue` đang lọc trong bộ nhớ trên toàn bộ danh sách | Phù hợp tới vài trăm căn; chuyển sang lọc ở API khi lớn hơn |
| 9 | Cache HTML ở CDN | Hiện cache dữ liệu theo tag, HTML render mỗi request |

## Known issues

- Ảnh dự án hiện là tệp tải từ website chủ đầu tư (lưu `EXTERNAL`, phục vụ từ `public/images` của FE) — **cần xác nhận quyền sử dụng** hoặc thay thế.
- Văn bản dự án/trang doanh nghiệp là nội dung biên tập của bản demo; một số trang tự ghi "minh họa" — cần duyệt trước khi xuất bản.
- Rewrites FE tới API được cố định lúc build: đổi địa chỉ API phải build lại image web.
- Lần render đầu sau khi khởi động/cache lạnh chậm hơn (Lighthouse lần đầu 81, các lần sau 89–92).

## Thông tin đăng nhập / hạ tầng cần cung cấp

- Quyền quản lý DNS `datvanggroup.vn` (xác minh quyền sở hữu, bản ghi A/CNAME, TXT cho Search Console).
- Nền tảng chạy container (VPS/Kubernetes/PaaS) + registry image.
- PostgreSQL managed (chuỗi kết nối cho user ứng dụng và user migrate riêng).
- Object storage + CDN (bucket, access key cho API, domain media).
- Secret manager để lưu `JWT_ACCESS_SECRET`, `REVALIDATE_SECRET`, `IP_HASH_SALT`, khóa S3.
- (Tùy chọn) dịch vụ email, tài khoản Google Search Console / Bing / GA4.
- Tài khoản GitHub/GitLab cho CI.

## Dữ liệu doanh nghiệp cần cung cấp

Xem chi tiết `DATA-MIGRATION.md` §4: pháp nhân, hotline/email/mạng xã hội đã xác minh, vai trò với từng dự án, ảnh có quyền sử dụng, danh mục căn hộ thật, bài viết/đội ngũ/đối tác thật, chính sách bảo mật & điều khoản, danh sách nhân sự Admin.

## Deployment blockers

1. Chưa có hạ tầng (máy chủ, DB, storage, DNS/CDN) và thông tin đăng nhập.
2. Chưa xác minh quyền dùng ảnh và thông tin dự án; chưa có thông tin pháp nhân/hotline xác minh.
3. Chưa có chính sách bảo mật dữ liệu cá nhân phù hợp cho việc thu thập lead.
4. Image Docker và CI chưa được chạy thử.

Không triển khai lên hạ tầng thật khi chưa có phê duyệt rõ ràng.
