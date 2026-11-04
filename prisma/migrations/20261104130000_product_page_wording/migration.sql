-- Project product pages: the text no longer names where the facts came from.

UPDATE "static_pages"
SET "sections" = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("sections"::text,
      'Trang chính thức của dự án công bố sổ đỏ sở hữu lâu dài. Theo CafeLand, Capital Square 2', 'Dự án được công bố có sổ đỏ sở hữu lâu dài. Capital Square 2'),
      'chưa được công bố trong các nguồn chúng tôi có. Hãy liên hệ để được kiểm tra khi có thông tin từ chủ đầu tư.', 'đang được cập nhật. Hãy liên hệ để được kiểm tra khi có thông tin từ chủ đầu tư.'),
      'Theo VietnamFinance, căn Penthouse và Garden House có bể bơi riêng', 'Căn Penthouse và Garden House được giới thiệu có bể bơi riêng'),
      'trong danh mục sản phẩm do Sun Property công bố.', 'trong danh mục sản phẩm của dự án.'),
      'chưa có trong các nguồn chúng tôi tham khảo.', 'đang được cập nhật.'),
      'Theo CafeLand, cư dân khu đô thị', 'Cư dân khu đô thị'),
      'CafeLand có nêu loại Duplex khoảng 200 m².', 'Dự án được giới thiệu có loại Duplex khoảng 200 m².')::jsonb,
    "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "path" LIKE 'du-an/%/%'
  AND "sections"::text ~* 'cafeland|vietnamfinance|các nguồn chúng tôi|do Sun Property công bố|Trang chính thức của dự án';
