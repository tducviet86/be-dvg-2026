# Technical SEO checklist

> Sẵn sàng kỹ thuật cho công cụ tìm kiếm **không** đảm bảo thứ hạng hay việc được lập chỉ mục. Gửi sitemap chỉ giúp Google/Bing phát hiện URL nhanh hơn.

## Đã triển khai (kiểm chứng bằng test tự động)

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| HTML render phía server cho mọi trang công khai (dự án, căn hộ, bài viết, banner) | ✅ | Banner dự án là `<a href>` thật trong HTML; `tests/journey.spec.ts` |
| URL thân thiện: `/du-an/{slug}`, `/cho-thue/{slug}`, `/blog/{slug}`, `/cho-thue/du-an/{slug}` | ✅ | Giữ nguyên route cũ |
| Mã trạng thái: 200 / 404 (không tồn tại, nháp, đã lưu trữ) / 308 (slug cũ) | ✅ | `journey.spec.ts` › renamed slugs |
| Canonical theo URL hiện tại; trang lọc `/cho-thue?…` → `noindex, follow` | ✅ | `generateMetadata` |
| Nội dung demo/nháp/xem trước → `noindex` và ngoài sitemap | ✅ | `site.spec.ts`, `journey.spec.ts` |
| `robots.txt` (chặn `/admin`, `/api/`) + `sitemap.xml` sinh từ DB, có `lastModified` | ✅ | `site.spec.ts` kiểm tra mọi URL trong sitemap trả 200, có `<h1>`, canonical, description |
| Metadata động: title, description, Open Graph (title, description, image), Twitter card | ✅ | Ưu tiên `seoTitle`/`seoDescription` nhập trong CMS |
| Structured data: `Organization` + `WebSite` (trang chủ), `BreadcrumbList` (mọi trang con), `Article` (bài viết), `CollectionPage`/`ItemList` (trang cho thuê) | ✅ | Không thêm review, rating, offer, giá hay thông tin doanh nghiệp chưa xác minh |
| Alt text ảnh (nhập trong CMS, có giá trị mặc định có nghĩa) | ✅ | |
| Admin `noindex` | ✅ | |
| Core Web Vitals (Lighthouse mobile, máy cục bộ, bản production) | ✅ | Trang chủ: Performance 89–92, LCP 3.4–3.7 s, CLS 0, TBT ≤ 60 ms; Accessibility / Best practices / SEO = 100. Trang dự án: 87 / 100 / 100 / 100 |

## Việc cần làm khi lên production

- [ ] Đặt `NEXT_PUBLIC_SITE_URL=https://datvanggroup.vn` (canonical, sitemap, JSON-LD) và build lại FE.
- [ ] Chuyển hướng `http://` → `https://` và `www` ↔ apex (một tên miền chuẩn duy nhất) ở CDN/proxy.
- [ ] Ảnh qua CDN (`MEDIA_PUBLIC_BASE_URL`, `MEDIA_REMOTE_PATTERNS`), cache dài hạn (key ảnh bất biến).
- [ ] Bổ sung `Organization.address`, `telephone`, `sameAs` **chỉ khi** có thông tin đã xác minh.
- [ ] Cân nhắc `RealEstateListing` cho căn hộ thật (không áp dụng cho căn demo) sau khi có dữ liệu giá/tình trạng thật — chỉ dùng thuộc tính đúng và kiểm tra bằng Rich Results Test.
- [ ] Kiểm tra structured data bằng https://search.google.com/test/rich-results và https://validator.schema.org.
- [ ] Đo lại Lighthouse/PageSpeed trên domain thật (CDN, HTTP/2, nén) và theo dõi CrUX.

## Google Search Console

1. Thêm property **Domain** `datvanggroup.vn`, xác minh bằng bản ghi DNS TXT (nhà cung cấp DNS).
2. *Sitemaps* → gửi `https://datvanggroup.vn/sitemap.xml`.
3. *URL Inspection* cho trang chủ và 1–2 dự án → *Request indexing*.
4. Theo dõi *Pages* (Indexed / Not indexed + lý do), *Core Web Vitals*, *Enhancements* (Breadcrumbs).
5. Khi đổi slug hàng loạt: kiểm tra báo cáo *Page with redirect*.

## Bing Webmaster Tools

Import từ Google Search Console (nhanh nhất) hoặc xác minh DNS; gửi cùng sitemap.

## Google Analytics 4

- Tạo property GA4 + Web data stream cho `https://datvanggroup.vn`.
- Chưa tích hợp vào mã nguồn: cần quyết định **banner đồng ý cookie** (thu thập dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP). Khuyến nghị: tải GA4 qua `next/script` (`afterInteractive`) **sau khi** người dùng đồng ý; theo dõi sự kiện `generate_lead` khi form trả 202.
- Không gửi email/điện thoại khách hàng vào GA.

## Chẩn đoán lập chỉ mục

- 404 bất ngờ: kiểm tra dự án đã *Đã xuất bản* và `published_at` ≤ hiện tại.
- Trang không cập nhật: kiểm tra log BE `revalidate failed` (sai `FRONTEND_REVALIDATE_URL` / `REVALIDATE_SECRET`); dữ liệu tự làm mới sau tối đa 5 phút.
- Trang bị `noindex`: dữ liệu demo (`is_demo`), trang lọc có query, hoặc đang ở chế độ xem trước.
