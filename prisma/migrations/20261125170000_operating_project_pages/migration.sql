-- What the developers publish about three operating projects, for their
-- pages (monarchy.com.vn, sunpropertygroup.vn). Only filled where still
-- empty: whatever Admin typed stays.
-- Admin only saves photos that are in the media library.
INSERT INTO "media_assets" ("id", "storage", "key", "url", "mime_type", "size_bytes", "width", "height", "alt", "updated_at")
VALUES
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/ho-boi.webp', '/images/projects/monarchy-apartments/tien-ich/ho-boi.webp', 'image/webp', 169056, 1400, 935, 'Hồ bơi ngoài trời The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/sanh-le-tan.webp', '/images/projects/monarchy-apartments/tien-ich/sanh-le-tan.webp', 'image/webp', 47150, 1400, 935, 'Sảnh lễ tân The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/san-choi-tre-em.webp', '/images/projects/monarchy-apartments/tien-ich/san-choi-tre-em.webp', 'image/webp', 176164, 1400, 935, 'Sân chơi trẻ em The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/phong-gym.webp', '/images/projects/monarchy-apartments/tien-ich/phong-gym.webp', 'image/webp', 53228, 620, 410, 'Phòng gym The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/mam-non.webp', '/images/projects/monarchy-apartments/tien-ich/mam-non.webp', 'image/webp', 81592, 1400, 935, 'Trường mầm non The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/bai-do-xe.webp', '/images/projects/monarchy-apartments/tien-ich/bai-do-xe.webp', 'image/webp', 33138, 620, 410, 'Bãi đỗ xe The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/k-market.webp', '/images/projects/monarchy-apartments/tien-ich/k-market.webp', 'image/webp', 153812, 1400, 935, 'K-Market The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/highlands-coffee.webp', '/images/projects/monarchy-apartments/tien-ich/highlands-coffee.webp', 'image/webp', 74884, 1067, 800, 'Highlands Coffee The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/nuong-han-quoc.webp', '/images/projects/monarchy-apartments/tien-ich/nuong-han-quoc.webp', 'image/webp', 179090, 1400, 934, 'Quán nướng Hàn Quốc The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/paris-levain.webp', '/images/projects/monarchy-apartments/tien-ich/paris-levain.webp', 'image/webp', 164802, 1400, 935, 'Paris Levain The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/ho-boi-tren-cao.webp', '/images/projects/monarchy-apartments/tien-ich/ho-boi-tren-cao.webp', 'image/webp', 147134, 1400, 934, 'Hồ bơi nhìn từ trên cao The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/monarchy-apartments/tien-ich/quan-ca-phe.webp', '/images/projects/monarchy-apartments/tien-ich/quan-ca-phe.webp', 'image/webp', 110672, 1400, 934, 'Quán cà phê The Monarchy', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-ponte-residence/phoi-canh-ven-song.webp', '/images/projects/sun-ponte-residence/phoi-canh-ven-song.webp', 'image/webp', 432530, 1600, 900, 'Phối cảnh Sun Ponte Residence', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-ponte-residence/phoi-canh-hai-toa.webp', '/images/projects/sun-ponte-residence/phoi-canh-hai-toa.webp', 'image/webp', 323502, 1600, 900, 'Phối cảnh Sun Ponte Residence', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-ponte-residence/phoi-canh-dem.webp', '/images/projects/sun-ponte-residence/phoi-canh-dem.webp', 'image/webp', 273284, 1500, 844, 'Phối cảnh Sun Ponte Residence', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-panoma/phoi-canh-ven-song.webp', '/images/projects/sun-panoma/phoi-canh-ven-song.webp', 'image/webp', 137126, 1200, 715, 'Phối cảnh Sun Panoma', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-panoma/phoi-canh-hoang-hon.webp', '/images/projects/sun-panoma/phoi-canh-hoang-hon.webp', 'image/webp', 114620, 1200, 800, 'Phối cảnh Sun Panoma', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/sun-panoma/phoi-canh-dem.webp', '/images/projects/sun-panoma/phoi-canh-dem.webp', 'image/webp', 206036, 1600, 900, 'Phối cảnh Sun Panoma', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
ON CONFLICT ("key") DO NOTHING;

UPDATE "projects" SET "developer" = 'Công ty CP Đầu tư Phát triển Nhà Đà Nẵng (NDN)'
WHERE "slug" = 'monarchy-apartments' AND coalesce("developer", '') = '';
UPDATE "projects" SET "scale" = 'Khu đất 9.000 m², mật độ xây dựng 40%, block A 18 tầng và block B 33 tầng'
WHERE "slug" = 'monarchy-apartments' AND coalesce("scale", '') = '';
UPDATE "projects" SET "total_units" = 800
WHERE "slug" = 'monarchy-apartments' AND "total_units" IS NULL;
UPDATE "projects" SET "connections" = '[{"place": "Sân bay quốc tế Đà Nẵng", "time": "Khoảng 5 phút"}, {"place": "Cầu Rồng", "time": "Khoảng 5 phút"}, {"place": "Công viên APEC", "time": "Khoảng 5 phút"}, {"place": "Bãi biển Mỹ Khê", "time": "Khoảng 10 phút"}]'::jsonb
WHERE "slug" = 'monarchy-apartments' AND "connections" = '[]'::jsonb;
UPDATE "projects" SET "photos" = '[{"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/ho-boi.webp", "title": "Hồ bơi ngoài trời", "note": "Trong khuôn viên nội khu."}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/sanh-le-tan.webp", "title": "Sảnh lễ tân", "note": "Có nhân viên lễ tân tại sảnh tòa nhà."}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/san-choi-tre-em.webp", "title": "Sân chơi trẻ em", "note": "Khu vui chơi ngoài trời ngay chân tòa nhà."}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/phong-gym.webp", "title": "Phòng gym", "note": "Alpha Fitness & Yoga."}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/mam-non.webp", "title": "Trường mầm non", "note": "Nằm ngay trong khuôn viên dự án."}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/bai-do-xe.webp", "title": "Bãi đỗ xe", "note": "Bãi đỗ xe trong tòa nhà."}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/k-market.webp", "title": "K-Market", "note": "Ngay sảnh tầng 1: thực phẩm Hàn Quốc, đồ khô, trái cây nhập khẩu."}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/highlands-coffee.webp", "title": "Highlands Coffee", "note": "Ở khối đế, hợp để gặp gỡ hoặc làm việc."}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/nuong-han-quoc.webp", "title": "Quán nướng Hàn Quốc", "note": "Mr. Noh và các quán nướng ngay dưới sảnh."}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/paris-levain.webp", "title": "Paris Levain", "note": "Bánh và cà phê kiểu Pháp, sảnh tầng 1 tòa A."}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/ho-boi-tren-cao.webp"}, {"group": "Tiện ích", "image": "/images/projects/monarchy-apartments/tien-ich/quan-ca-phe.webp"}]'::jsonb
WHERE "slug" = 'monarchy-apartments' AND "photos" = '[]'::jsonb;
UPDATE "projects" SET "source_url" = 'https://monarchy.com.vn'
WHERE "slug" = 'monarchy-apartments' AND coalesce("source_url", '') IN ('', 'https://monarchydanang.com.vn/gioi-thieu/');
INSERT INTO "project_amenities" ("id", "project_id", "name", "sort_order")
SELECT gen_random_uuid(), p."id", a."name", a."i"
FROM "projects" p, (VALUES ('Hồ bơi ngoài trời', 0), ('Sảnh lễ tân', 1), ('Sân chơi trẻ em', 2), ('Phòng gym', 3), ('Trường mầm non', 4), ('Bãi đỗ xe', 5), ('K-Market', 6), ('Highlands Coffee', 7), ('WinMart+ đối diện tòa nhà', 8), ('K-Food tầng 1', 9), ('Tiệm ăn Mẹ Nhí đối diện tòa nhà', 10), ('Starbucks', 11), ('Phúc Long, khoảng 3 phút đi xe', 12)) AS a("name", "i")
WHERE p."slug" = 'monarchy-apartments'
  AND NOT EXISTS (SELECT 1 FROM "project_amenities" x WHERE x."project_id" = p."id");

UPDATE "projects" SET "developer" = 'Sun Property (thành viên Sun Group)'
WHERE "slug" IN ('sun-ponte-residence', 'sun-panoma') AND coalesce("developer", '') = '';
UPDATE "projects" SET "scale" = 'Khoảng 1,6 ha, khu cao tầng The Ponte và khu thấp tầng The Rio'
WHERE "slug" = 'sun-ponte-residence' AND coalesce("scale", '') = '';
UPDATE "projects" SET "photos" = '[{"group": "Phối cảnh", "image": "/images/projects/sun-ponte-residence/phoi-canh-ven-song.webp"}, {"group": "Phối cảnh", "image": "/images/projects/sun-ponte-residence/phoi-canh-hai-toa.webp"}, {"group": "Phối cảnh", "image": "/images/projects/sun-ponte-residence/phoi-canh-dem.webp"}]'::jsonb
WHERE "slug" = 'sun-ponte-residence' AND "photos" = '[]'::jsonb;
UPDATE "projects" SET "scale" = 'Sun Cosmo Residence rộng khoảng 3,5 ha, hai tháp Panoma 1 và Panoma 2'
WHERE "slug" = 'sun-panoma' AND coalesce("scale", '') = '';
UPDATE "projects" SET "photos" = '[{"group": "Phối cảnh", "image": "/images/projects/sun-panoma/phoi-canh-ven-song.webp"}, {"group": "Phối cảnh", "image": "/images/projects/sun-panoma/phoi-canh-hoang-hon.webp"}, {"group": "Phối cảnh", "image": "/images/projects/sun-panoma/phoi-canh-dem.webp"}]'::jsonb
WHERE "slug" = 'sun-panoma' AND "photos" = '[]'::jsonb;
