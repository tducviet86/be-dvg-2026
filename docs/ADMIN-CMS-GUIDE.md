# Hướng dẫn sử dụng Admin CMS

Địa chỉ: `https://datvanggroup.vn/admin` (đăng nhập bằng tài khoản do quản trị viên cấp).

## Vai trò

| Vai trò | Được làm |
|---|---|
| Quản trị hệ thống (`admin`) | Mọi thứ: người dùng, cài đặt, xuất dữ liệu khách hàng, nhật ký |
| Biên tập nội dung (`editor`) | Dự án, căn hộ, banner, bài viết, trang, thư viện ảnh, xuất bản/gỡ xuất bản |
| Tư vấn viên (`sales`) | Xem nội dung; xử lý khách hàng được giao hoặc chưa giao |

Đăng nhập sai 5 lần liên tiếp ⇒ tài khoản tạm khóa 15 phút. Phiên tự gia hạn khi đang làm việc; đóng trình duyệt lâu (14 ngày) cần đăng nhập lại.

## Dự án

1. **Dự án → Thêm mới**. Nhập tên, bấm *Tạo đường dẫn từ tên*.
2. **Nhóm dự án**: chọn một hoặc nhiều — *Dự án đang triển khai*, *Dự án đang vận hành*, *Mua bán*, *Cho thuê*. Nhóm quyết định dự án xuất hiện ở `/du-an/trien-khai`, `/du-an/van-hanh` và trang `/cho-thue/du-an/...`.
3. **Trạng thái xuất bản**: *Bản nháp* (chỉ admin thấy) hoặc *Đã xuất bản* (hiển thị trên website, sitemap).
4. **Hình ảnh**: *Tải ảnh lên* (JPG/PNG/WebP/AVIF, tối đa 8 MB; hệ thống tự nén WebP và xóa metadata) hoặc *Chọn từ thư viện*. Luôn nhập *Mô tả ảnh (alt)*.
5. **Nội dung giới thiệu**: các đoạn cách nhau 1 dòng trống; *Điểm nổi bật* mỗi dòng `Tiêu đề | Nội dung`.
6. **Nguồn thông tin & bản quyền ảnh**: ghi nguồn khi dùng thông tin/ảnh của chủ đầu tư.
7. **SEO**: tiêu đề ~50–60 ký tự, mô tả ~140–160 ký tự (để trống sẽ dùng tên và mô tả ngắn).
8. **Xem trước trên website**: với bản đã lưu, mở bản nháp đúng như sẽ hiển thị (trang có nhãn "Đang xem trước", không được Google lập chỉ mục).
9. **Đổi đường dẫn**: địa chỉ cũ tự chuyển hướng vĩnh viễn (308) sang địa chỉ mới.
10. **Xóa** = lưu trữ: dự án ngừng hiển thị, banner liên kết bị gỡ. Không thể lưu trữ khi dự án còn căn hộ.

## Banner trang chủ

**Cách 1 — trong form dự án** (khuyến nghị cho banner dự án): bật *Hiển thị dự án trên Banner trang chủ*, chọn dùng ảnh đại diện hoặc ảnh riêng (desktop + mobile), tiêu đề/mô tả (để trống dùng tên dự án), thứ tự; xem trước Desktop/Mobile. Tắt công tắc ⇒ banner ngừng hiển thị, nội dung banner vẫn được giữ.

**Cách 2 — mục Banner**: danh sách mọi banner (ảnh, loại NORMAL/PROJECT, dự án, trạng thái, thứ tự). Dùng mũi tên để đổi thứ tự, biểu tượng mắt để bật/tắt, *Thêm mới* để tạo banner thường hoặc banner dự án.

Hai cách cùng chỉnh **một** bản ghi. Mỗi dự án chỉ có một banner. Nếu người khác vừa sửa banner, hệ thống yêu cầu tải lại thay vì ghi đè. Banner dự án chỉ hiển thị khi dự án *Đã xuất bản*.

## Căn hộ

Chọn dự án, loại căn, diện tích, phòng; **hình thức** (cho thuê / mua bán / ký gửi) và **tình trạng**. Giá nhập theo **triệu đồng** (12,5 = 12.500.000 đ), lưu dưới dạng số nguyên VND. Bật *Căn mẫu / dữ liệu minh họa* cho dữ liệu chưa xác minh — website sẽ ghi "Căn mẫu", không lập chỉ mục và không đưa vào sitemap. Video: YouTube, MP4/WebM HTTPS hoặc `/images/...mp4`.

## Bài viết

Chọn chuyên mục, nhập mô tả ngắn và nội dung (văn bản thuần, đoạn cách nhau 1 dòng trống). Bài cần nội dung trước khi xuất bản. *Thời điểm xuất bản* ở tương lai = hẹn giờ.

## Khách hàng (lead)

Mọi form trên website gửi về đây. Lọc theo trạng thái, tìm theo tên/email/điện thoại/công ty. Mở yêu cầu để: đổi trạng thái (Mới → Đang tư vấn → Hoàn tất / Không phù hợp), mức ưu tiên, **người phụ trách**, lịch liên hệ, ghi chú nội bộ. Thông tin khách đã gửi (tên, email, nội dung) không chỉnh sửa được. *Xuất CSV* (chỉ quản trị) được ghi nhật ký — lưu file ở nơi an toàn, xóa khi không còn cần.

## Cài đặt & người dùng

- **Cài đặt**: thông tin doanh nghiệp đã xác minh (pháp nhân, hotline, email, địa chỉ, mạng xã hội, SEO mặc định).
- **Người dùng** (quản trị): tạo tài khoản (mật khẩu ≥ 12 ký tự), đổi vai trò, vô hiệu hóa — phiên của người bị vô hiệu hóa kết thúc ngay.

## Tạo tài khoản quản trị đầu tiên (kỹ thuật)

```bash
ADMIN_EMAIL=ten@datvanggroup.vn ADMIN_NAME="Họ Tên" ADMIN_PASSWORD='<mật khẩu mạnh>' npm run admin:create
```
Chạy trong container/job của BE-DVG với `DATABASE_URL` production; không lưu mật khẩu vào file hay lịch sử shell (dùng biến môi trường tạm hoặc trình quản lý bí mật).
