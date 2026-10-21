# Di chuyển dữ liệu

## 1. Phân loại nội dung hiện có

| Nội dung | Nguồn | Phân loại | Xử lý |
|---|---|---|---|
| 8 dự án: tên, slug, nhóm, khu vực, URL nguồn | `FE-DVG/src/data/home-projects.ts` | **Thông tin công khai có trích nguồn** — cần doanh nghiệp xác nhận vai trò với từng dự án | `prisma/data/legacy-content.json` → `npm run import:legacy` (mặc định **DRAFT**) |
| Văn bản giới thiệu, điểm nổi bật, loại sản phẩm | như trên | Nội dung biên tập — cần duyệt | Import cùng dự án |
| Tọa độ 3 dự án (Monarchy, Panoma, Ponte) | `project-locations.ts`, "Google Maps links supplied by the company" | **Dữ liệu doanh nghiệp cung cấp** | Import, giữ 7 chữ số thập phân |
| Ảnh phối cảnh `public/images/projects/*.jpg` | Tải từ website chủ đầu tư (`reports/project-image-sources.json`) | **Cần xác nhận quyền sử dụng** | Import dạng `EXTERNAL` (phục vụ bởi FE); thay bằng ảnh có quyền qua CMS |
| Hướng dẫn thuê theo dự án | `rental-content.ts` | Nội dung biên tập | Import vào `projects.rental_*` |
| 9 trang doanh nghiệp | `src/lib/pages.ts` | Nội dung biên tập; nhiều đoạn tự ghi "minh họa" | Import vào `static_pages` (DRAFT) — **phải duyệt lại** |
| 3 banner trang chủ | `src/data/index.ts` | Trình bày | Import (banner thường) |
| 24 căn hộ, giá, diện tích | sinh bằng vòng lặp (`isDemo: true`) | **DEMO** | Chỉ `npm run seed:demo` (bị chặn khi `NODE_ENV=production`), luôn `is_demo = true` |
| 12 bài viết | sinh từ danh sách tiêu đề | **DEMO** | Chỉ seed demo, `is_demo = true` (noindex, ngoài sitemap) |
| 20 khách hàng, 5 người dùng mẫu | mock | **DEMO** | **Không import** |
| 8 lời chia sẻ ("Nhân vật hư cấu") | mock | **Hư cấu** | **Không import**, đã gỡ khỏi FE |
| Hotline `0911 29 69 79` | mặc định trong code FE + FAQ | **Chưa xác minh** | Xác minh rồi nhập ở Cài đặt / `NEXT_PUBLIC_COMPANY_PHONE` |

Snapshot được tạo một lần bằng `npx tsx scripts/export-fe-content.ts <đường-dẫn-FE>` trên mã FE trước khi gỡ mock (commit `380a2b8` của FE-DVG). Hai file JSON ghi rõ phân loại và nguồn gốc (`provenance`).

## 2. Lệnh

```bash
npm run db:migrate          # prisma migrate deploy
npm run db:seed             # dữ liệu tham chiếu: vai trò, quyền, nhóm dự án, loại căn, chuyên mục — chạy mọi môi trường
npm run import:legacy       # nội dung cũ → DRAFT (an toàn chạy lại: không ghi đè bản ghi đã tồn tại)
npm run import:legacy -- --publish   # chỉ sau khi doanh nghiệp duyệt
npm run seed:demo           # CHỈ development/staging preview
ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… npm run admin:create
```

Mỗi lần import ghi `audit_logs` (`import.legacy`). Không có mật khẩu/bí mật nào trong seed.

## 3. Quy trình đưa dữ liệu thật lên production

1. Staging: migrate → seed → `import:legacy` (DRAFT).
2. Doanh nghiệp duyệt từng dự án/trang trong Admin (dùng *Xem trước*), sửa nội dung, thay ảnh có quyền, rồi xuất bản từng mục.
3. Nhập căn hộ thật qua Admin (hoặc script import riêng khi có file nguồn: kiểm tra trùng `slug`/`unit_code`, quy đổi giá về VND số nguyên, liên kết `project_id`, `is_demo = false`).
4. Kiểm tra: `GET /api/v1/sitemap` không chứa nội dung demo; mọi dự án đã xuất bản có ảnh, mô tả, SEO.
5. Production: chỉ migrate + seed + tạo admin; nội dung được nhập/xuất bản qua Admin (hoặc dump có kiểm soát từ staging cho các bảng nội dung).

## 4. Dữ liệu thật còn thiếu (cần doanh nghiệp cung cấp)

- Pháp nhân: tên công ty, mã số thuế, người đại diện, địa chỉ trụ sở, giờ làm việc.
- Hotline, email, Zalo, Facebook chính thức.
- Vai trò thực tế của Đất Vàng Group với từng dự án (phân phối, vận hành, ký gửi…) và thông tin pháp lý được phép công bố.
- Ảnh dự án có quyền sử dụng (hoặc văn bản cho phép dùng ảnh của chủ đầu tư).
- Danh mục căn hộ thật: mã căn, diện tích, giá (VND), tình trạng, ảnh, người liên hệ.
- Bài viết, đội ngũ, đối tác thật; chính sách bảo mật / điều khoản đã được tư vấn pháp lý.
- Danh sách nhân sự cần tài khoản Admin và vai trò.
