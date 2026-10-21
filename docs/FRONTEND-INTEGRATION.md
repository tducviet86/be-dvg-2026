# Tích hợp FE-DVG ↔ BE-DVG

## Biến môi trường FE

| Biến | Khi nào cần | Ý nghĩa |
|---|---|---|
| `API_INTERNAL_URL` | **build** + runtime | URL BE mà máy chủ Next.js gọi được (mạng nội bộ). Dùng cho fetch phía server **và** cho rewrites `/api/v1/*`, `/media/*` (được cố định lúc build). |
| `REVALIDATE_SECRET` | runtime | Trùng với `REVALIDATE_SECRET` của BE. |
| `NEXT_PUBLIC_SITE_URL` | build | URL chuẩn (canonical, sitemap, JSON-LD). |
| `MEDIA_REMOTE_PATTERNS` | build | Host CDN/bucket media cho `next/image` (vd `https://media.datvanggroup.vn`). |
| `NEXT_PUBLIC_COMPANY_PHONE` | build | Hotline nút gọi (đến khi chuyển sang đọc cài đặt công khai — xem PRODUCTION-READINESS). |

## Lớp dữ liệu

- `src/lib/api/server.ts` — `apiGet`, `apiGetAll` (gom mọi trang), `apiLookup` (phân biệt 404 / 410 / 301). Cache: `revalidate: 300`, tag theo tài nguyên.
- `src/lib/api/content.ts` — loader dùng `React.cache` (khử trùng trong một request) và **adapter** chuyển DTO API sang đúng kiểu component đang dùng (`Project`, `Property`, `Post`, `PortfolioProject`, story/rental guide/map). Nhờ vậy markup, CSS, animation không đổi.
- `src/lib/api/preview.ts` — Draft Mode: gọi endpoint `admin/*/preview` bằng cookie của biên tập viên, không cache.
- `src/lib/api/client.ts` — gọi API từ trình duyệt cho form công khai.
- `src/app/api/revalidate/route.ts` — nhận webhook từ BE, `revalidateTag(tag, { expire: 0 })`.
- `src/app/api/preview/route.ts`, `src/app/api/preview/exit/route.ts` — bật/tắt xem trước.

## Thay đổi chính ở FE

| Khu vực | Trước | Sau |
|---|---|---|
| Trang chủ | mock + banner `localStorage` | `getBanners`, `getSiteContent`, `getPosts`; banner render phía server (link thật cho crawler) |
| `[...slug]` | `generateStaticParams` + `dynamicParams=false` | render theo yêu cầu; 404/410 → `notFound()`, slug cũ → `permanentRedirect` (308); nội dung demo/nháp → `noindex` |
| Sitemap | mock | `GET /api/v1/sitemap` (đã lọc nháp + demo) |
| Form liên hệ / newsletter | `localStorage`, thông báo "demo" | `POST` API; chỉ báo thành công khi nhận 202; honeypot + thời gian điền |
| Admin | SPA đọc/ghi `localStorage`, không đăng nhập | Đăng nhập, phân quyền theo vai trò, CRUD qua API, upload media, xem trước, người dùng, xuất CSV |
| Mock data | `src/data/*`, `src/lib/pages.ts` | Đã gỡ (snapshot ở `BE-DVG/prisma/data`). Còn lại: `photos`, `services`, `rentalFaqs` (nội dung tĩnh) |
| Lời chia sẻ khách hàng hư cấu | component `Testimonials` | Đã gỡ (không dùng ở trang nào, nội dung hư cấu) |
| Yêu thích | `localStorage` | Giữ nguyên (sở thích cá nhân, không phải dữ liệu nghiệp vụ) |

## Admin

- `src/features/admin/api.ts` — client: CSRF header, refresh token một lần (single-flight), sự kiện hết phiên → trang đăng nhập.
- `adapters.ts` — DTO ↔ giá trị form (triệu đồng ↔ VND số nguyên, ngày giờ local ↔ ISO, danh sách ↔ dòng văn bản).
- `editor.tsx` — biểu mẫu cấu hình theo trường; lỗi từ máy chủ hiển thị trong khung lỗi.
- `media.tsx` — tải ảnh lên / chọn từ thư viện / gallery có sắp xếp.
- `banners.tsx` — module Banner và section banner trong form dự án (cùng một bản ghi).
- `users.tsx`, `login.tsx`.

## Chạy cục bộ

```bash
# BE-DVG (cổng 4000) — cần PostgreSQL
cd BE-DVG && npm run build && node dist/main.js
# FE-DVG (cổng 3000)
cd FE-DVG && npm run build && npm start
```
`npm run dev` cũng hoạt động cho cả hai.

## Kiểm thử end-to-end

`cd FE-DVG && npx playwright test` — Playwright tự khởi động BE (DB `dvg_e2e`, được reset + seed + tạo tài khoản test ngẫu nhiên mỗi lần chạy) và FE production build. Dừng server dev ở cổng 3000/4000 trước khi chạy.
