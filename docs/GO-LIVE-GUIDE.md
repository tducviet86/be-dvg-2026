# Hướng dẫn đưa website Đất Vàng Group lên thị trường

Tài liệu này dành cho chủ dự án: mỗi bước ghi rõ **ai làm**, **cần chuẩn bị gì** và **cách kiểm tra đã xong**. Làm theo thứ tự.

---

## Bước 0 — Bật AI viết SEO trên máy dev (5 phút)

1. Lấy khóa Gemini tại https://aistudio.google.com/apikey (đăng nhập Google → *Create API key*).
2. Mở file `BE-DVG/.env`, thêm hai dòng:
   ```
   GEMINI_API_KEY=<dán khóa của bạn>
   GEMINI_MODEL=gemini-3.8-flash
   GEMINI_FALLBACK_MODEL=gemini-3.5-flash
   ```
   - API gọi Gemini qua **Interactions API** (`/v1beta/interactions`) — khóa AI Studio dạng mới (`AQ.…`) chỉ dùng được endpoint này.
   - Khi model chính quá tải (Google trả 503/429), API tự thử lại **một lần** với `GEMINI_FALLBACK_MODEL`.
   - `gemini-3.8-flash`: model ổn định, nhanh, chi phí thấp — khuyến nghị cho SEO.
   - Muốn chất lượng câu chữ cao hơn có thể thử `gemini-4-argon` (chậm và đắt hơn). Model có hậu tố `-preview` có thể bị tắt bất cứ lúc nào, không nên dùng cho production.
3. Khởi động lại API (`npm run start:dev` trong `BE-DVG`).
4. Kiểm tra: Admin → Bài viết → Thêm mới → nhập tiêu đề, sapo, nội dung → mục **Hiển thị trên Google** → **Tạo gợi ý** → xem trước như kết quả Google → **Áp dụng vào form** → **Lưu**.

> Chỉ ghi khóa vào `.env` (không commit). **Không** ghi vào `.env.example` — file đó được đưa lên Git.
> Khóa chỉ nằm ở máy chủ API, không bao giờ gửi xuống trình duyệt. Không gửi khóa qua chat/email; nếu lỡ lộ, vào AI Studio xóa khóa và tạo khóa mới.
> Nên đặt **giới hạn chi tiêu / hạn mức** cho dự án Google Cloud chứa khóa. API đã giới hạn 10 lượt gợi ý/phút/người và ghi nhật ký mỗi lượt (`ai.seo_suggest`).

---

## Bước 1 — Chuẩn bị tài khoản và hạ tầng (doanh nghiệp + kỹ thuật)

| Hạng mục | Gợi ý | Ghi chú |
|---|---|---|
| Tên miền `datvanggroup.vn` | Quyền quản lý DNS | Cần để trỏ website, xác minh Google |
| CDN / HTTPS / DNS | Cloudflare (gói Free đủ dùng) | Chuyển nameserver tên miền về Cloudflare |
| Máy chủ chạy ứng dụng | VPS 2 vCPU / 4 GB RAM (vd Vultr Singapore, Viettel IDC, VNG Cloud) hoặc Render/Railway/Fly.io | Chạy 2 container: web (FE) + API (BE) |
| PostgreSQL | Dịch vụ managed (Neon, Supabase, DigitalOcean, VNG Cloud…) có backup tự động | Tạo 2 user: `dvg_app` (đọc/ghi dữ liệu) và `dvg_migrate` (đổi cấu trúc) |
| Kho ảnh/video | **Cloudflare R2** (không tính phí băng thông tải xuống — lợi cho video) | Bucket `dvg-media`, gắn tên miền `media.datvanggroup.vn` |
| Khóa Gemini | Google AI Studio | Tạo khóa riêng cho production, đặt hạn mức |
| Email nhận khách hàng (tùy chọn) | Google Workspace / Zoho | Hiện xem khách hàng trong Admin; email báo tự động là bước sau |

**Xong khi:** có đủ thông tin đăng nhập ở bảng trên, lưu trong trình quản lý mật khẩu (1Password, Bitwarden…).

### Tạo kho R2 cho ảnh/video
1. Cloudflare → R2 → *Create bucket* `dvg-media`.
2. *Settings → Custom domain* → `media.datvanggroup.vn` (để ảnh/video được phục vụ qua CDN).
3. *Manage R2 API Tokens* → quyền **Object Read & Write** chỉ cho bucket này → lưu *Access Key ID*, *Secret Access Key*, *endpoint* `https://<account-id>.r2.cloudflarestorage.com`.

---

## Bước 2 — Cấu hình biến môi trường production

**API (BE-DVG)** — đặt trong trình quản lý bí mật của nền tảng (không ghi vào code):

```
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://dvg_app:<mật-khẩu>@<host>:5432/dvg?schema=public&sslmode=require
APP_ORIGINS=https://datvanggroup.vn
SITE_URL=https://datvanggroup.vn
JWT_ACCESS_SECRET=<openssl rand -base64 48>
COOKIE_SECURE=true
TRUST_PROXY=1
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=dvg-media
S3_ACCESS_KEY_ID=<từ R2>
S3_SECRET_ACCESS_KEY=<từ R2>
MEDIA_PUBLIC_BASE_URL=https://media.datvanggroup.vn
MAX_UPLOAD_MB=8
MAX_VIDEO_MB=100
FRONTEND_REVALIDATE_URL=https://datvanggroup.vn/api/revalidate
REVALIDATE_SECRET=<openssl rand -hex 24>
IP_HASH_SALT=<openssl rand -hex 16>
GEMINI_API_KEY=<khóa production>
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash
```

**Website (FE-DVG)** — `API_INTERNAL_URL` và `MEDIA_REMOTE_PATTERNS` phải có **lúc build**:

```
API_INTERNAL_URL=http://<địa-chỉ-nội-bộ-của-API>:4000
NEXT_PUBLIC_SITE_URL=https://datvanggroup.vn
MEDIA_REMOTE_PATTERNS=https://media.datvanggroup.vn
REVALIDATE_SECRET=<giống BE>
NEXT_PUBLIC_COMPANY_PHONE=<hotline đã xác minh>
```

**Xong khi:** API khởi động không báo lỗi cấu hình (nếu thiếu/sai, API dừng và in rõ biến nào sai).

---

## Bước 3 — Đưa code lên Git và CI (kỹ thuật)

1. Tạo 2 repository riêng tư trên GitHub: `FE-DVG`, `BE-DVG`; push code.
2. CI đã có sẵn (`.github/workflows/ci.yml` ở mỗi repo): kiểm tra kiểu, lint, test, build, audit. Với FE, đặt biến `BE_REPOSITORY` để chạy luôn test end-to-end.

**Xong khi:** CI xanh trên nhánh `main`.

---

## Bước 4 — Triển khai lần đầu lên **staging** (kỹ thuật)

1. Build image (xem `DEPLOYMENT-GUIDE.md`): API (`--target runtime`), job migrate (`--target migrate`), web (truyền `API_INTERNAL_URL`, `NEXT_PUBLIC_SITE_URL`, `MEDIA_REMOTE_PATTERNS`).
2. Chạy job migrate: `npx prisma migrate deploy` (user `dvg_migrate`).
3. `npm run db:seed` — vai trò, quyền, danh mục.
4. `npm run import:legacy` — nhập nội dung cũ ở trạng thái **Bản nháp**.
5. Tạo quản trị viên đầu tiên:
   ```bash
   ADMIN_EMAIL=ten@datvanggroup.vn ADMIN_NAME="Họ Tên" ADMIN_PASSWORD='<mật khẩu ≥ 12 ký tự>' npm run admin:create
   ```
6. Trỏ `staging.datvanggroup.vn` vào web staging.

**Xong khi:** đăng nhập Admin staging được; tải ảnh + video lên căn hộ thấy hiển thị; nút **Tạo gợi ý** SEO hoạt động; `https://staging…/api/v1/health/ready` trả `{"status":"ok"}`.

---

## Bước 5 — Nhập và duyệt nội dung thật (doanh nghiệp)

Danh sách đầy đủ ở `DATA-MIGRATION.md` §4. Tối thiểu trước khi mở:
- [ ] Thông tin pháp nhân, hotline, email, địa chỉ → Admin › **Cài đặt**.
- [ ] Từng dự án: duyệt nội dung, vai trò của Đất Vàng, thay ảnh bằng ảnh **có quyền sử dụng**, bấm **Tạo gợi ý** SEO → duyệt → **Xuất bản**.
- [ ] Căn hộ thật: ảnh/video thực tế, giá (VND), tình trạng; **tắt** "Căn mẫu" cho căn thật.
- [ ] Banner trang chủ: chọn dự án nổi bật (form dự án → *Hiển thị trên Banner trang chủ*).
- [ ] Bài viết: ít nhất 3–5 bài thật; dùng AI gợi ý SEO cho từng bài.
- [ ] Trang **Chính sách bảo mật** và **Điều khoản** đã được tư vấn pháp lý (Nghị định 13/2023 về dữ liệu cá nhân, vì website thu thập số điện thoại/email khách).
- [ ] Tạo tài khoản cho nhân viên (Admin › **Người dùng**) với vai trò Biên tập / Tư vấn.
- [ ] Không còn nội dung demo được xuất bản: Admin › Căn hộ/Bài viết lọc "Đã xuất bản" và kiểm tra nhãn *Căn mẫu*/*Minh họa*.

**Xong khi:** người phụ trách nội dung ký duyệt bản staging.

---

## Bước 6 — Kiểm tra trước khi mở (kỹ thuật + doanh nghiệp)

- [ ] Gửi thử form Liên hệ → thấy trong Admin › Khách hàng.
- [ ] Đổi slug một dự án thử → đường dẫn cũ tự chuyển sang mới.
- [ ] Xem trên điện thoại thật (iPhone + Android): trang chủ, dự án, căn hộ, video.
- [ ] PageSpeed Insights (https://pagespeed.web.dev) cho trang chủ và 1 dự án: Performance ≥ 85 trên mobile.
- [ ] Rich Results Test (https://search.google.com/test/rich-results) cho trang chủ và 1 bài viết.
- [ ] Backup DB: bật tự động và **thử khôi phục 1 lần** vào DB tạm.

---

## Bước 7 — Mở chính thức (production)

1. Lặp lại Bước 4 trên môi trường production (DB, bucket, khóa riêng — **không** chạy `seed:demo`).
2. Chuyển nội dung đã duyệt: xuất bản lại trên production (hoặc chuyển dữ liệu có kiểm soát từ staging).
3. Trỏ `datvanggroup.vn` (và `www` → chuyển về tên miền chính) vào web production; bật HTTPS, HTTP → HTTPS.
4. Smoke test: trang chủ, 1 dự án, `/sitemap.xml`, `/robots.txt`, đăng nhập Admin, gửi form.

## Bước 8 — Sau khi mở (tuần đầu)

- [ ] **Google Search Console**: thêm property *Domain* (xác minh bằng bản ghi DNS TXT trên Cloudflare) → gửi `https://datvanggroup.vn/sitemap.xml` → *Kiểm tra URL* trang chủ và các dự án chính → *Yêu cầu lập chỉ mục*.
- [ ] **Bing Webmaster Tools**: nhập từ Search Console.
- [ ] **Google Analytics 4** (tùy chọn): cần banner đồng ý cookie trước khi gắn — báo kỹ thuật làm khi quyết định.
- [ ] **Google Business Profile** cho văn phòng Đà Nẵng (tăng hiển thị trên Google Maps).
- [ ] Theo dõi Admin › Khách hàng hằng ngày; phân công cho tư vấn viên.
- [ ] Xem lại Search Console sau 2–4 tuần: trang đã lập chỉ mục, từ khóa có hiển thị, lỗi Core Web Vitals. Gửi sitemap **không** đảm bảo Google lập chỉ mục hay xếp hạng ngay.

---

## Việc nên làm tiếp (không chặn việc mở website)

| Việc | Lợi ích |
|---|---|
| Email báo khách hàng mới cho tư vấn viên | Phản hồi khách nhanh hơn |
| Tải video thẳng lên R2 (presigned URL) + dịch vụ phát video (Cloudflare Stream) | Video lớn, xem mượt trên di động |
| Hotline/Zalo trên website đọc từ Admin › Cài đặt | Đổi số không cần build lại |
| MFA cho tài khoản quản trị, tự đổi mật khẩu | An toàn hơn |
| AI gợi ý SEO tự động khi lưu nếu ô SEO trống | Đỡ thao tác cho biên tập |
