# FE-DVG — Audit frontend (trước khi xây backend)

Ngày audit: 2026-10-21 · Phạm vi: toàn bộ `FE-DVG/src`, cấu hình build, test.
Mọi nhận định dưới đây được kiểm tra trực tiếp trên mã nguồn, không suy đoán framework.

## 1. Kiến trúc & framework

| Hạng mục | Thực tế |
|---|---|
| Framework | **Next.js 16.4 (App Router)**, React 19.2, TypeScript strict (`tsconfig.json` `strict: true`) |
| Build | `next build --webpack`; Node ≥ 22.13 |
| Styling | Tailwind v4 + CSS thuần theo module (`globals.css`, `signature-home.css`, `rentals.css`, `admin.css`) |
| Thư viện UI | Radix Dialog, Embla Carousel, motion, lucide-react, sonner, react-hook-form + zod, recharts (chỉ admin) |
| Routing | `app/(public)/page.tsx` (trang chủ), `app/(public)/[...slug]/page.tsx` (catch-all cho mọi trang công khai), `app/admin/[[...segments]]/page.tsx` (SPA admin) |
| Rendering | Trang công khai là **Server Components + SSG**: `generateStaticParams` liệt kê toàn bộ URL, `dynamicParams = false` ⇒ URL không có lúc build trả 404. Admin là client component tải động (`ssr: false`). |
| Test | Playwright (39 test: route, dữ liệu, a11y axe, responsive, banner) |

## 2. Chức năng hiện có

- **Trang chủ**: banner trình chiếu động (NORMAL/PROJECT — đã làm ở bước trước, đọc `localStorage`), 2 khối dự án (triển khai / vận hành), lĩnh vực hoạt động, 3 bài viết mới, khối liên hệ.
- **Dự án**: `/du-an`, `/du-an/trien-khai`, `/du-an/van-hanh`, `/du-an/{slug}` (chi tiết khác nhau cho nhóm triển khai và vận hành; nhóm vận hành có tab Mua bán / Cho thuê / Ký gửi qua `?nhu-cau=`).
- **Cho thuê**: `/cho-thue` (lọc server-side theo query: `q, location, project, type, price, bedrooms, area, furniture, status, sort, limit`), `/cho-thue/du-an/{slug}`, `/cho-thue/{slug}` (chi tiết căn, gallery ảnh + video).
- **Blog**: `/blog`, `/blog/danh-muc/{slug}`, `/blog/{slug}` (nội dung văn bản thuần, chia đoạn bằng xuống dòng).
- **Trang doanh nghiệp**: `gioi-thieu/*`, `dich-vu/*`, `lien-he`, `tuyen-dung`, chính sách… lấy từ `src/lib/pages.ts` (`staticPages`).
- **Biểu mẫu**: `ContactForm` (liên hệ, tư vấn, ứng tuyển), `Newsletter`, `Favorite` (yêu thích).
- **Admin** `/admin/*`: tổng quan + biểu đồ, CRUD dự án / banner / căn hộ / bài viết / khách hàng, cài đặt, khôi phục dữ liệu mẫu. **Không có đăng nhập.**
- **SEO**: `generateMetadata` (title, description, canonical, OG, Twitter), JSON-LD Organization / BreadcrumbList / Article, `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, admin `noindex`.

## 3. Nguồn dữ liệu giả (mock) — toàn bộ vị trí

| File | Nội dung | Phân loại |
|---|---|---|
| `src/data/home-projects.ts` | 8 dự án (tên, slug, nhóm, khu vực, loại ảnh, URL nguồn) + `projectStories` (giới thiệu, đoạn văn, sản phẩm, điểm nổi bật) | Tên/khu vực/nguồn: **thông tin công khai có trích nguồn** (cần doanh nghiệp xác nhận). Văn bản mô tả: nội dung biên tập, cần duyệt |
| `src/data/project-locations.ts` | Tọa độ 3 dự án, "resolved from the three Google Maps links supplied by the company" | **Dữ liệu doanh nghiệp cung cấp** |
| `src/data/index.ts` → `projects` | Dẫn xuất từ `homeProjects` (status, type, createdAt cố định) | Dẫn xuất |
| `src/data/index.ts` → `properties` | 24 căn hộ sinh bằng vòng lặp, `isDemo: true`, giá/diện tích/tầng giả | **Demo** — không được xuất bản như dữ liệu thật |
| `src/data/index.ts` → `posts` | 12 bài viết, slug lặp `goc-nhin-khong-gian-song-N` | **Demo** |
| `src/data/index.ts` → `leads`, `adminUsers` | 20 khách hàng, 5 người dùng mẫu | **Demo** (không import) |
| `src/data/index.ts` → `testimonials` | 8 lời chia sẻ ghi rõ "Nhân vật hư cấu" | **Hư cấu** — không được đưa lên production |
| `src/data/index.ts` → `services`, `photos` | 6 dịch vụ, ảnh minh họa (một số từ Unsplash) | Nội dung doanh nghiệp tĩnh / ảnh minh họa |
| `src/data/index.ts` → `banners` | 3 banner mặc định | Nội dung trình bày |
| `src/data/rental-content.ts` | Hướng dẫn thuê theo từng dự án + FAQ; có hotline `0911 29 69 79` | Nội dung biên tập; hotline **cần xác minh** |
| `src/lib/pages.ts` | Nội dung các trang tĩnh doanh nghiệp (ghi rõ "minh họa" ở nhiều chỗ) | Nội dung biên tập, cần duyệt |
| `src/lib/company-contact.ts` | `NEXT_PUBLIC_COMPANY_PHONE` mặc định `0911 29 69 79` | Cần xác minh |
| `public/images/projects/*.jpg` | Ảnh phối cảnh tải từ website chủ đầu tư (`reports/project-image-sources.json`) | **Cần xác nhận quyền sử dụng ảnh** |

Ghi `localStorage` (`src/lib/storage.ts`, khóa `dvg:*`): admin (projects, properties, posts, leads, banners, settings), form liên hệ (`leads`), newsletter, favorites.
⇒ Mọi thao tác admin và mọi form hiện **không đến được doanh nghiệp**; thông báo "thành công" là giả.

## 4. Mô hình dữ liệu hiện có (`src/types/index.ts`)

- `Project`: id, slug, name, location, type, status (chuỗi tiếng Việt), image, description, + `AdminDetails` (address, developer, companyRole, legalStatus, totalArea, totalUnits, startDate, handoverDate, mapUrl, amenities, seo*, imageAlt, gallery).
- `PortfolioProject` (home-projects): id ngắn (`capital`), slug, projectId, name, group (`development` | `operation`), location, imageType, source.
- `Property`: projectId, location, type, price (**triệu/tháng, số thực**), area, bedrooms, bathrooms, floor, furniture, status, image, gallery (chuỗi xuống dòng), videoUrl, isDemo, + chi tiết thuê.
- `Post`: category/categorySlug, readingTime, status, content (văn bản), tags (chuỗi).
- `Lead`: name, email, phone, message, source, status, assignment (tên người), notes, + ngân sách (chuỗi).
- `Banner`: type NORMAL/PROJECT, projectId, imageUrl, mobileImageUrl, isActive, sortOrder.

Vấn đề mô hình: giá dạng float, trạng thái là chuỗi hiển thị, nhóm dự án loại trừ nhau (một dự án không thể vừa "vận hành" vừa "đang bán"), gallery/amenities/tags là chuỗi, lead gán bằng tên chứ không bằng user ID, dữ liệu dự án bị chia đôi (`projects` vs `homeProjects`).

## 5. Phụ thuộc backend còn thiếu

1. Xác thực admin + phân quyền (hiện ai cũng vào được `/admin`).
2. Lưu trữ bền vững cho dự án, căn hộ, banner, bài viết, trang, cài đặt.
3. Tiếp nhận form (liên hệ, tư vấn, ứng tuyển, newsletter) + chống spam.
4. Upload & lưu trữ media (hiện chỉ nhập URL hoặc data URL vào localStorage).
5. Trạng thái xuất bản (Draft/Published/Archived), lịch xuất bản, xem trước.
6. Sitemap/metadata sinh từ dữ liệu thật; chuyển hướng khi đổi slug.
7. Nhật ký thao tác (audit log), xuất dữ liệu khách hàng có kiểm soát.

## 6. API cần có (ánh xạ từ nhu cầu FE)

| Nhu cầu FE | Endpoint |
|---|---|
| Danh sách / chi tiết dự án, nhóm triển khai/vận hành | `GET /api/v1/projects?category=`, `GET /api/v1/projects/:slug` |
| Danh sách căn + bộ lọc `/cho-thue` | `GET /api/v1/properties?…`, `GET /api/v1/properties/:slug`, `GET /api/v1/property-types` |
| Banner trang chủ | `GET /api/v1/banners` |
| Blog | `GET /api/v1/blog`, `GET /api/v1/blog/categories`, `GET /api/v1/blog/:slug` |
| Trang tĩnh | `GET /api/v1/pages/*path` |
| Cài đặt công khai (hotline, email…) | `GET /api/v1/settings/public` |
| Sitemap | `GET /api/v1/sitemap` |
| Form | `POST /api/v1/contact`, `POST /api/v1/inquiries`, `POST /api/v1/newsletter` |
| Admin | `/api/v1/auth/*`, `/api/v1/admin/{projects,properties,banners,blog/posts,blog/categories,pages,leads,media,settings,users,audit-logs}` |

Chi tiết: `API-CONTRACT.md`.

## 7. Thực thể database cần có

User, Role, Permission, Session (refresh token), AuditLog · Project, ProjectCategory (nhiều-nhiều, chồng lấp), ProjectImage, ProjectAmenity, ProjectHighlight, SlugRedirect · Property, PropertyType, PropertyImage, PropertyAmenity (giá VND dạng `BigInt`) · Banner · BlogPost, BlogCategory, BlogTag · StaticPage · MediaAsset · SiteSetting · Lead (gộp ContactSubmission/Inquiry theo `kind`), NewsletterSubscriber. Chi tiết: `DATABASE-DESIGN.md`.

## 8. Component cần tích hợp

| Component | Hiện dùng | Thay bằng |
|---|---|---|
| `app/(public)/page.tsx`, `home-projects.tsx`, `corporate-banner.tsx` | `posts`, `homeProjects`, banner localStorage | API (server fetch, ISR + revalidate theo tag) |
| `[...slug]/page.tsx` (metadata, resolve, generateStaticParams) | toàn bộ mock | API; `dynamicParams = true` để URL mới hoạt động |
| `portfolio-pages.tsx`, `rental-page.tsx`, `room-detail.tsx`, `search.tsx`, `rental-search.tsx`, `cards.tsx`, `public-pages.tsx`, `company-layouts.tsx`, `project-map.tsx`, `lib/filter.ts` | mock import trực tiếp | dữ liệu truyền từ server qua props / data layer |
| `interactive.tsx` (`ContactForm`, `Newsletter`) | `writeStore` | `POST` API, chỉ báo thành công khi server xác nhận |
| `sitemap.ts` | mock | `GET /api/v1/sitemap` |
| `features/admin/*` | localStorage | API có xác thực (cookie httpOnly + CSRF) |

## 9. Rủi ro SEO & rendering

- `dynamicParams = false`: dự án mới tạo trong admin sẽ **404** cho tới lần build sau ⇒ phải chuyển sang render theo yêu cầu + cache (ISR) và revalidate khi admin thay đổi.
- Banner trang chủ đọc `localStorage` ⇒ crawler chỉ thấy banner mặc định ⇒ phải render từ API phía server.
- Đổi slug hiện làm gãy URL cũ ⇒ cần bảng redirect (308).
- Thông tin doanh nghiệp (địa chỉ, điện thoại, pháp nhân) chưa được xác minh ⇒ không đưa vào JSON-LD cho tới khi có dữ liệu thật.
- Căn hộ demo đã được `noindex` và loại khỏi sitemap; phải giữ nguyên quy tắc này khi có dữ liệu thật.
- `next/image` chỉ cho phép `images.unsplash.com` ⇒ cần thêm host CDN media.

## 10. Thứ tự ưu tiên triển khai

1. DB + API đọc công khai (projects, properties, banners, blog, pages, settings, sitemap) — để website hiển thị dữ liệu thật và SEO đúng.
2. Xác thực admin + CRUD dự án / banner (đồng bộ một nguồn) + media upload.
3. Tiếp nhận lead từ form + quản lý lead.
4. Blog CMS, trang tĩnh, cài đặt.
5. SEO động (redirect slug, noindex, sitemap từ DB), revalidate theo tag.
6. Docker, CI, tài liệu triển khai, readiness checklist.
