# Thiết kế cơ sở dữ liệu (PostgreSQL)

Nguồn chuẩn: `prisma/schema.prisma` và `prisma/migrations/*`. Quy ước: khóa chính UUID, tên bảng/cột `snake_case`, `created_at`/`updated_at` mọi bảng nghiệp vụ.

## Nhóm bảng

| Nhóm | Bảng | Ghi chú |
|---|---|---|
| Người dùng & quyền | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`, `audit_logs` | Quyền là mã (`projects:write`…), vai trò là dữ liệu: `admin`, `editor`, `sales`. `sessions` lưu **hash** refresh token, `family_id` để thu hồi theo chuỗi. |
| Media | `media_assets` | `storage` = S3 / LOCAL / EXTERNAL (ảnh cũ trong `public/images` của FE). `checksum` sha256, kích thước, alt. |
| Dự án | `projects`, `project_categories`, `project_category_links`, `project_images`, `project_amenities`, `project_highlights`, `slug_redirects` | Phân loại **nhiều-nhiều** (triển khai, vận hành, mua bán, cho thuê có thể chồng lấp). `stage` (giai đoạn kinh doanh) tách khỏi `status` (xuất bản). |
| Căn hộ | `properties`, `property_types`, `property_images`, `property_amenities` | `for_rent`/`for_sale`/`is_consignment` độc lập; `availability` (còn trống, đã cho thuê…); `is_demo` cho dữ liệu minh họa. |
| Banner | `banners` | Nguồn duy nhất cho banner trang chủ (NORMAL / PROJECT). |
| Nội dung | `blog_posts`, `blog_categories`, `blog_tags`, `blog_post_tags`, `static_pages`, `site_settings` | `published_at` ở tương lai = hẹn giờ xuất bản. `static_pages.path` là đường dẫn URL (vd `gioi-thieu/doi-ngu`). |
| Khách hàng | `leads`, `newsletter_subscribers` | `kind` = CONTACT / INQUIRY (gộp ContactSubmission + Inquiry), `status`, `priority`, `assignee_id` → `users`. IP chỉ lưu dạng hash có salt. |

## Tiền tệ, số đo, tọa độ

- Tiền VND: `BIGINT` (đồng, số nguyên) — `rent_price_vnd`, `sale_price_vnd`, `deposit_vnd`, `management_fee_vnd`, `budget_*_vnd`. API trả về dạng chuỗi số để không mất chính xác. **Không dùng số thực.**
- Diện tích: `DECIMAL(8,2)` (căn hộ), `DECIMAL(14,2)` (dự án) — m².
- Tọa độ: `DECIMAL(10,7)` (giữ đủ 7 chữ số thập phân của Google Maps; migration `map_coordinate_precision`).

## Toàn vẹn dữ liệu

Khóa ngoại với hành vi rõ ràng:
- `properties.project_id` → `RESTRICT` (không lưu trữ dự án còn căn hộ — kiểm tra ở service).
- `banners.project_id` → `CASCADE` + `UNIQUE` (một banner mỗi dự án).
- Ảnh trong gallery → `RESTRICT` trên `media_assets` (không xóa ảnh đang dùng; API trả 409 kèm số chỗ sử dụng).
- `leads.assignee_id`, `audit_logs.actor_id` → `SET NULL`.

CHECK constraint thêm bằng SQL trong migration `init`:
- `banners_type_project_check`: `type = 'PROJECT'` ⇔ `project_id IS NOT NULL`.
- `banners_image_check`: banner NORMAL bắt buộc có ảnh.
- `properties_amounts_check`, `properties_listing_check` (ít nhất cho thuê hoặc bán), `*_slug_check` (slug hợp lệ), `users_email_lower_check`.

Chỉ mục: theo trạng thái xuất bản + thứ tự (`projects(status, deleted_at, sort_order)`, `blog_posts(status, deleted_at, published_at)`, `properties(status, deleted_at, project_id)`), `leads(status, created_at)`, `audit_logs(entity_type, entity_id)`, `slug_redirects(entity_type, from_slug) UNIQUE`.

## Trạng thái xuất bản

`PublishStatus = DRAFT | PUBLISHED | ARCHIVED`. Điều kiện công khai (dùng chung, `common/utils/content.ts`): `status = PUBLISHED AND deleted_at IS NULL AND published_at <= now()`. Căn hộ còn yêu cầu dự án của nó công khai; banner dự án yêu cầu dự án công khai.

## Đổi slug

Khi slug dự án/căn hộ/bài viết thay đổi, slug cũ được ghi vào `slug_redirects` (trỏ theo ID thực thể, nên chuỗi đổi tên nhiều lần luôn dẫn tới slug hiện tại). Slug được dùng lại cho bản ghi mới thì redirect cũ bị xóa.

## Migration

| Migration | Nội dung |
|---|---|
| `20261021040623_init` | Toàn bộ schema + CHECK constraint |
| `20261021040725_property_search_text` | Cột tìm kiếm không dấu cho căn hộ |
| `20261021045817_map_coordinate_precision` | Tăng độ chính xác tọa độ (mở rộng kiểu, không mất dữ liệu) |

Chiến lược: chỉ dùng `prisma migrate deploy` ở staging/production; migration chỉ được **mở rộng** (thêm cột nullable/có default, thêm bảng) trong cùng bản phát hành với code mới; xóa/đổi tên cột theo 2 bước (expand → contract) ở hai lần phát hành. Xem `DEPLOYMENT-GUIDE.md`.
