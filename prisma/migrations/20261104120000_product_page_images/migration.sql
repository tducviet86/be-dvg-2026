-- Project product pages: drop the "Nguồn thông tin" section, add the developers'
-- photos (files in FE-DVG/public/images/projects/) to the library, to each page
-- cover and to the matching sections. Text an editor changed is kept.

INSERT INTO "media_assets" ("id", "storage", "key", "url", "mime_type", "size_bytes", "width", "height", "alt", "updated_at")
VALUES
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/toan-canh-hoang-hon.webp', '/images/projects/capital-square/toan-canh-hoang-hon.webp', 'image/webp', 152310, 1600, 900, 'Capital Square lúc hoàng hôn bên sông Hàn', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/can-ho-noi-that.webp', '/images/projects/capital-square/can-ho-noi-that.webp', 'image/webp', 238010, 1600, 1143, 'Phòng khách căn hộ Capital Square', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/toan-canh-tren-cao.webp', '/images/projects/capital-square/toan-canh-tren-cao.webp', 'image/webp', 263968, 1600, 900, 'Capital Square nhìn từ trên cao', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/ven-song-han.webp', '/images/projects/capital-square/ven-song-han.webp', 'image/webp', 188726, 1600, 900, 'Các tòa tháp Capital Square bên sông Hàn', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/khoi-de-thuong-mai.webp', '/images/projects/capital-square/khoi-de-thuong-mai.webp', 'image/webp', 304286, 1600, 900, 'Khối đế thương mại Capital Square', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/trung-tam-thuong-mai.webp', '/images/projects/capital-square/trung-tam-thuong-mai.webp', 'image/webp', 313602, 1600, 900, 'Trung tâm thương mại Capital Square về đêm', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/park-boulevard.webp', '/images/projects/capital-square/park-boulevard.webp', 'image/webp', 337510, 1600, 900, 'Tuyến phố Park Boulevard', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/ket-noi.webp', '/images/projects/capital-square/ket-noi.webp', 'image/webp', 182422, 1000, 644, 'Capital Square giữa trung tâm Đà Nẵng', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/quang-truong-noi-khu.webp', '/images/projects/capital-square/quang-truong-noi-khu.webp', 'image/webp', 315372, 1600, 900, 'Quảng trường nội khu Capital Square', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/khu-vui-choi.webp', '/images/projects/capital-square/khu-vui-choi.webp', 'image/webp', 417984, 1600, 900, 'Khu vui chơi ngoài trời Capital Square', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/be-boi.webp', '/images/projects/capital-square/be-boi.webp', 'image/webp', 341756, 1600, 899, 'Bể bơi Capital Square', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/san-thuong.webp', '/images/projects/capital-square/san-thuong.webp', 'image/webp', 276284, 1600, 900, 'Vườn trên cao Capital Square', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/cac-toa-thap.webp', '/images/projects/sun-symphony-residence/cac-toa-thap.webp', 'image/webp', 230754, 1600, 900, 'Các tòa tháp Sun Symphony Residence', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/can-ho-noi-that.webp', '/images/projects/sun-symphony-residence/can-ho-noi-that.webp', 'image/webp', 194244, 1600, 1068, 'Không gian bên trong căn hộ Sun Symphony Residence', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/toan-canh.webp', '/images/projects/sun-symphony-residence/toan-canh.webp', 'image/webp', 101422, 1200, 675, 'Toàn cảnh Sun Symphony Residence bên sông Hàn', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/be-boi-trong-nha.webp', '/images/projects/sun-symphony-residence/be-boi-trong-nha.webp', 'image/webp', 125058, 1200, 675, 'Bể bơi bốn mùa trong nhà Sun Symphony Residence', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/toa-thap-nhin-cao.webp', '/images/projects/sun-symphony-residence/toa-thap-nhin-cao.webp', 'image/webp', 172250, 1600, 900, 'Tầng cao tòa tháp Symphony 5', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/tam-nhin-penthouse.webp', '/images/projects/sun-symphony-residence/tam-nhin-penthouse.webp', 'image/webp', 194794, 1600, 900, 'Ban công tầng cao nhìn sông Hàn', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/sky-villa.webp', '/images/projects/sun-symphony-residence/sky-villa.webp', 'image/webp', 88450, 1200, 675, 'Mặt cắt không gian căn thông tầng', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/san-vuon-tren-cao.webp', '/images/projects/sun-symphony-residence/san-vuon-tren-cao.webp', 'image/webp', 167346, 1200, 675, 'Sân vườn trên cao Sun Symphony Residence', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/ven-song.webp', '/images/projects/sun-symphony-residence/ven-song.webp', 'image/webp', 331340, 1600, 900, 'Khu thấp tầng ven sông Hàn của Sun Symphony Residence', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/the-sonata.webp', '/images/projects/sun-symphony-residence/the-sonata.webp', 'image/webp', 197442, 1500, 844, 'Phân khu The Sonata', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-symphony-residence/thap-tang-ven-song.webp', '/images/projects/sun-symphony-residence/thap-tang-ven-song.webp', 'image/webp', 148060, 1200, 779, 'Khu thấp tầng The Sonata dưới chân tòa tháp', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/cora-tower/hai-toa-thap.webp', '/images/projects/cora-tower/hai-toa-thap.webp', 'image/webp', 316416, 1600, 900, 'Hai tòa tháp Cora Tower', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/cora-tower/tam-nhin-ban-cong.webp', '/images/projects/cora-tower/tam-nhin-ban-cong.webp', 'image/webp', 246536, 1600, 900, 'Tầm nhìn từ ban công Cora Tower', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/cora-tower/vi-tri.webp', '/images/projects/cora-tower/vi-tri.webp', 'image/webp', 348414, 1440, 810, 'Cora Tower và nút giao trong Sun NeO City', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/cora-tower/toan-canh.webp', '/images/projects/cora-tower/toan-canh.webp', 'image/webp', 349030, 1600, 900, 'Cora Tower giữa khu đô thị Sun NeO City', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/cora-tower/kien-truc.webp', '/images/projects/cora-tower/kien-truc.webp', 'image/webp', 176810, 1600, 900, 'Kiến trúc hai tòa tháp Cora Tower', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/cora-tower/sun-neo-city.webp', '/images/projects/cora-tower/sun-neo-city.webp', 'image/webp', 308182, 1200, 800, 'Toàn cảnh khu đô thị Sun NeO City', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/cora-tower/tam-nhin-penthouse.webp', '/images/projects/cora-tower/tam-nhin-penthouse.webp', 'image/webp', 180768, 1600, 900, 'Tầm nhìn từ căn penthouse phía Nam Đà Nẵng', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/cora-tower/khoi-de-shophouse.webp', '/images/projects/cora-tower/khoi-de-shophouse.webp', 'image/webp', 103850, 1100, 620, 'Khối đế thương mại Cora Tower', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
ON CONFLICT ("key") DO NOTHING;

UPDATE "static_pages" AS page
SET "cover_image_id" = (SELECT "id" FROM "media_assets" WHERE "key" = cover."url")
FROM (VALUES
  ('du-an/capital-square/can-ho', '/images/projects/capital-square/toan-canh-hoang-hon.webp'),
  ('du-an/capital-square/khong-gian-thuong-mai', '/images/projects/capital-square/khoi-de-thuong-mai.webp'),
  ('du-an/capital-square/tien-ich-noi-khu', '/images/projects/capital-square/quang-truong-noi-khu.webp'),
  ('du-an/sun-symphony-residence/can-ho-studio-1pn-1-2pn-3pn', '/images/projects/sun-symphony-residence/cac-toa-thap.webp'),
  ('du-an/sun-symphony-residence/penthouse-sky-villa', '/images/projects/sun-symphony-residence/toa-thap-nhin-cao.webp'),
  ('du-an/sun-symphony-residence/nha-pho-biet-thu', '/images/projects/sun-symphony-residence/ven-song.webp'),
  ('du-an/cora-tower/studio-1pn-1pn-1', '/images/projects/cora-tower/hai-toa-thap.webp'),
  ('du-an/cora-tower/can-ho-2pn-3pn', '/images/projects/cora-tower/toan-canh.webp'),
  ('du-an/cora-tower/penthouse-shophouse', '/images/projects/cora-tower/vi-tri.webp')
) AS cover("path", "url")
WHERE page."path" = cover."path" AND page."cover_image_id" IS NULL;

WITH section_image("path", "heading", "image") AS (VALUES
  ('du-an/capital-square/can-ho', 'Các loại căn', '/images/projects/capital-square/can-ho-noi-that.webp'),
  ('du-an/capital-square/can-ho', 'Quy mô dự án', '/images/projects/capital-square/toan-canh-tren-cao.webp'),
  ('du-an/capital-square/can-ho', 'Vị trí và tầm nhìn', '/images/projects/capital-square/ven-song-han.webp'),
  ('du-an/capital-square/khong-gian-thuong-mai', 'Trung tâm thương mại', '/images/projects/capital-square/trung-tam-thuong-mai.webp'),
  ('du-an/capital-square/khong-gian-thuong-mai', 'Tuyến phố Park Boulevard', '/images/projects/capital-square/park-boulevard.webp'),
  ('du-an/capital-square/khong-gian-thuong-mai', 'Kết nối xung quanh', '/images/projects/capital-square/ket-noi.webp'),
  ('du-an/capital-square/tien-ich-noi-khu', 'Không gian ngoài trời', '/images/projects/capital-square/khu-vui-choi.webp'),
  ('du-an/capital-square/tien-ich-noi-khu', 'Bể bơi và thư giãn', '/images/projects/capital-square/be-boi.webp'),
  ('du-an/capital-square/tien-ich-noi-khu', 'Trên tầng thượng', '/images/projects/capital-square/san-thuong.webp'),
  ('du-an/sun-symphony-residence/can-ho-studio-1pn-1-2pn-3pn', 'Các loại căn', '/images/projects/sun-symphony-residence/can-ho-noi-that.webp'),
  ('du-an/sun-symphony-residence/can-ho-studio-1pn-1-2pn-3pn', 'Vị trí và quy mô', '/images/projects/sun-symphony-residence/toan-canh.webp'),
  ('du-an/sun-symphony-residence/can-ho-studio-1pn-1-2pn-3pn', 'Tiện ích dành cho cư dân', '/images/projects/sun-symphony-residence/be-boi-trong-nha.webp'),
  ('du-an/sun-symphony-residence/penthouse-sky-villa', 'Penthouse', '/images/projects/sun-symphony-residence/tam-nhin-penthouse.webp'),
  ('du-an/sun-symphony-residence/penthouse-sky-villa', 'Sky Villa', '/images/projects/sun-symphony-residence/sky-villa.webp'),
  ('du-an/sun-symphony-residence/penthouse-sky-villa', 'Tiện ích dành cho cư dân', '/images/projects/sun-symphony-residence/san-vuon-tren-cao.webp'),
  ('du-an/sun-symphony-residence/nha-pho-biet-thu', 'Nhà phố', '/images/projects/sun-symphony-residence/the-sonata.webp'),
  ('du-an/sun-symphony-residence/nha-pho-biet-thu', 'Biệt thự', '/images/projects/sun-symphony-residence/thap-tang-ven-song.webp'),
  ('du-an/cora-tower/studio-1pn-1pn-1', 'Các loại căn', '/images/projects/cora-tower/tam-nhin-ban-cong.webp'),
  ('du-an/cora-tower/studio-1pn-1pn-1', 'Vị trí', '/images/projects/cora-tower/vi-tri.webp'),
  ('du-an/cora-tower/can-ho-2pn-3pn', 'Các loại căn', '/images/projects/cora-tower/tam-nhin-ban-cong.webp'),
  ('du-an/cora-tower/can-ho-2pn-3pn', 'Quy mô', '/images/projects/cora-tower/kien-truc.webp'),
  ('du-an/cora-tower/can-ho-2pn-3pn', 'Tiện ích quanh dự án', '/images/projects/cora-tower/sun-neo-city.webp'),
  ('du-an/cora-tower/penthouse-shophouse', 'Penthouse', '/images/projects/cora-tower/tam-nhin-penthouse.webp'),
  ('du-an/cora-tower/penthouse-shophouse', 'Shophouse', '/images/projects/cora-tower/khoi-de-shophouse.webp')
)
UPDATE "static_pages" AS page
SET "sections" = COALESCE((
      SELECT jsonb_agg(
        CASE WHEN si."image" IS NULL THEN e.section
             ELSE e.section || jsonb_build_object('image', si."image") END
        ORDER BY e.position)
      FROM jsonb_array_elements(page."sections") WITH ORDINALITY AS e(section, position)
      LEFT JOIN section_image AS si
        ON si."path" = page."path" AND si."heading" = e.section->>'heading'
      WHERE e.section->>'heading' <> 'Nguồn thông tin'
    ), '[]'::jsonb),
    "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE page."path" IN (SELECT DISTINCT "path" FROM section_image);
