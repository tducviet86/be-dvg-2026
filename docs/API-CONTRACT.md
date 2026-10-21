# API contract — `/api/v1`

Tài liệu tương tác (OpenAPI): `GET /api/docs` (chỉ bật ngoài production, hoặc khi `SWAGGER_ENABLED=true`), JSON tại `/api/docs/openapi.json`.

## Quy ước chung

- **Thành công**: `{ "data": … }`; danh sách thêm `"meta": { page, pageSize, total, totalPages }`.
- **Lỗi**: `{ "error": { "code", "message", "details"?, "requestId" } }`. Với `VALIDATION_FAILED` và slug trùng (409), `details` là danh sách `{ field, constraints[], messages[] }` (vd `field: "banner.title"`, `constraints: ["maxLength"]`) để client đánh dấu đúng trường. Mã: `BAD_REQUEST`, `VALIDATION_FAILED` (details = danh sách lỗi trường), `UNAUTHENTICATED` (401), `FORBIDDEN` / `CSRF_INVALID` (403), `NOT_FOUND` (404), `GONE` (410 — nội dung đã lưu trữ), `MOVED_PERMANENTLY` (301, header `Location`, `details.slug` = slug mới), `CONFLICT` / `STALE_RECORD` (409), `ACCOUNT_LOCKED` (423), `UNSUPPORTED_MEDIA` (415), `PAYLOAD_TOO_LARGE` (413), `RATE_LIMITED` (429), `INTERNAL` (500, không lộ chi tiết).
- **Phân trang**: `?page=1&pageSize=20` (tối đa 100).
- **Tiền**: chuỗi số nguyên VND (`"12500000"`). **Ngày**: ISO 8601.
- **Khóa lạc quan**: mọi `PATCH` admin nhận `expectedUpdatedAt` (giá trị `updatedAt` đã đọc); lệch ⇒ 409 `STALE_RECORD`.
- **Header**: `X-Request-Id` được trả về (hoặc nhận từ client) để tra log.
- Validation: thuộc tính lạ bị từ chối (400), chuỗi được loại bỏ HTML.

## Xác thực

| Method | Path | Mô tả |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → đặt cookie `dvg_at` (httpOnly, 15 phút), `dvg_rt` (httpOnly, path `/api/v1/auth`), `dvg_csrf` (đọc được). Trả `{ user, csrfToken }`. 5 lần/phút/IP. |
| POST | `/auth/refresh` | Cần header `X-CSRF-Token`. Xoay vòng refresh token. |
| POST | `/auth/logout` | Cần `X-CSRF-Token`. Thu hồi chuỗi phiên. |
| GET | `/auth/me` | Người dùng hiện tại + quyền. |

Request admin dùng cookie phải gửi `X-CSRF-Token` cho POST/PATCH/PUT/DELETE. Client máy (script) có thể dùng `Authorization: Bearer <access token>` (không cần CSRF).

## Công khai (không cần đăng nhập)

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/projects?category=development|operation|sale|rent` | Chỉ dự án đã xuất bản |
| GET | `/projects/:slug` | 404 / 410 / 301 (slug cũ) |
| GET | `/project-categories` | |
| GET | `/properties?q&location&project(slug)&type(code)&maxRentVnd&bedrooms&minArea&furnishing&availability&listing=rent|sale&sort=price-asc|price-desc|area|newest` | `meta.locations` = danh sách khu vực |
| GET | `/properties/:slug` | |
| GET | `/property-types` | |
| GET | `/banners` | Đã lọc: đang bật, dự án công khai, có ảnh; sắp xếp theo thứ tự |
| GET | `/blog?category&tag` · `/blog/categories` · `/blog/:slug` | Bài hẹn giờ chưa đến giờ không hiển thị |
| GET | `/pages/*path` | Trang tĩnh doanh nghiệp |
| GET | `/settings/public` | Chỉ khóa được đánh dấu công khai |
| GET | `/sitemap` | Dữ liệu cho sitemap (loại bỏ nội dung demo) |
| POST | `/contact`, `/inquiries` | `{ name, email, phone?, message, consent: true, intent?, source?, projectSlug?, propertySlug?, website (honeypot), elapsedMs }` → 202. 5 lần/10 phút/IP. |
| POST | `/newsletter` | `{ email }` → 202 |
| GET | `/health`, `/health/ready` | Liveness / readiness (kiểm tra DB) |

## Admin (cần đăng nhập + quyền)

| Tài nguyên | Endpoint | Quyền |
|---|---|---|
| Dự án | `GET/POST /admin/projects`, `GET/PATCH/DELETE /admin/projects/:id`, `GET /admin/projects/preview/:slug` | `content:read`, `projects:write`; đổi trạng thái xuất bản cần `content:publish` |
| Banner dự án | trường `banner` trong body dự án: `{ enabled, useProjectImage, imageId, mobileImageId, label, title, description, imageAlt, position, expectedBannerUpdatedAt }` | `projects:write` |
| Banner | `GET/POST /admin/banners`, `GET/PATCH/DELETE /admin/banners/:id` (`position` để sắp xếp, `isActive` để bật/tắt) | `banners:write` |
| Căn hộ | `/admin/properties[...]` (giá dạng chuỗi VND) | `properties:write` |
| Bài viết | `/admin/blog/posts[...]`, `/admin/blog/categories[...]` | `blog:write` |
| Trang | `GET/POST /admin/pages`, `PATCH /admin/pages/:id` | `pages:write` |
| Media | `POST /admin/media/upload` (multipart `file`, `alt`; ảnh JPG/PNG/WebP/AVIF ≤ `MAX_UPLOAD_MB` → WebP, video MP4/MOV/WebM ≤ `MAX_VIDEO_MB` lưu nguyên bản), `GET /admin/media?type=image|video`, `GET /admin/media`, `GET /admin/media/:id/usage`, `PATCH/DELETE /admin/media/:id` (409 nếu đang được dùng) | `media:write` |
| Khách hàng | `GET /admin/leads?status&kind&assigneeId&q&from&to`, `POST /admin/leads`, `GET/PATCH /admin/leads/:id`, `DELETE` (lưu trữ), `GET /admin/leads/export` (CSV UTF-8) | `leads:read`, `leads:write`, `leads:export` |
| Cài đặt | `GET/PUT /admin/settings` (`{ values: { key: value } }`) | `settings:write` |
| Người dùng | `GET/POST /admin/users`, `PATCH /admin/users/:id`, `GET /admin/users/roles`, `GET /admin/users/assignable` | `users:manage` (assignable: `leads:read`) |
| Nhật ký | `GET /admin/audit-logs?entityType&entityId&action` | `audit:read` |
| AI SEO | `GET /admin/ai/status` → `{ seo, model, limits }`; `POST /admin/ai/seo-suggest` `{ kind: post|project|property, title, summary?, content?, context? }` → `{ seoTitle ≤60, seoDescription ≤160, keywords[], imageAlt }` (không lưu gì; 10 lượt/phút; gọi Gemini Interactions API, quá tải thì thử lại một lần với `GEMINI_FALLBACK_MODEL`; lỗi `AI_DISABLED` 503 / `AI_UNAVAILABLE` 502) | `content:read` + quyền ghi của loại nội dung |

Nhân viên vai trò `sales` chỉ thấy lead được giao cho mình hoặc chưa giao.

## Webhook FE (do BE gọi)

`POST {FRONTEND_REVALIDATE_URL}` header `x-revalidate-secret`, body `{ "tags": ["projects", "banners", …] }`.
