-- Project sales information: unit types, floor plans and the payment schedule.
ALTER TABLE "projects"
  ADD COLUMN "unit_types" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "floor_plans" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "payment_schedule" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "payment_note" TEXT;

-- Capital Square floor plans (capitalsquare.vn), in the media library.
INSERT INTO "media_assets" ("id", "storage", "key", "url", "mime_type", "size_bytes", "width", "height", "alt", "updated_at")
VALUES
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c4-1.webp', '/images/projects/capital-square/mat-bang-c4-1.webp', 'image/webp', 83428, 1026, 540, 'Mặt bằng tầng tòa C4 (1)', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c4-2.webp', '/images/projects/capital-square/mat-bang-c4-2.webp', 'image/webp', 85124, 1026, 537, 'Mặt bằng tầng tòa C4 (2)', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c4-3.webp', '/images/projects/capital-square/mat-bang-c4-3.webp', 'image/webp', 81726, 1026, 537, 'Mặt bằng tầng tòa C4 (3)', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c4-4.webp', '/images/projects/capital-square/mat-bang-c4-4.webp', 'image/webp', 83636, 1029, 540, 'Mặt bằng tầng tòa C4 (4)', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
ON CONFLICT ("key") DO NOTHING;

-- Starting data from the product pages. Prices and payment stay empty: the
-- sales team enters them in Admin.
UPDATE "projects" SET "unit_types" = '[{"name":"Căn 1 phòng ngủ","area":"Khoảng 34,1–47,7 m²"},{"name":"Căn 2 phòng ngủ","area":"Khoảng 67–93 m²"},{"name":"Căn 3 phòng ngủ","area":"Khoảng 91,5–128,3 m²"},{"name":"Căn Dual Key"}]'::jsonb WHERE "slug" = 'capital-square';
UPDATE "projects" SET "unit_types" = '[{"name":"Studio"},{"name":"Căn 1–3 phòng ngủ","area":"Khoảng 35,8–112,1 m²"},{"name":"Dual Front và Garden House"},{"name":"Penthouse và Sky Villa"},{"name":"Nhà phố The Sonata","area":"Khoảng 108–320 m²"},{"name":"Biệt thự The Sonata","area":"Khoảng 345–380 m²"}]'::jsonb WHERE "slug" = 'sun-symphony-residence';
UPDATE "projects" SET "unit_types" = '[{"name":"Studio","area":"Khoảng 34,7 m²"},{"name":"Căn 1 phòng ngủ và 1PN+1","area":"Khoảng 43,7–48,9 m²"},{"name":"Căn 2 phòng ngủ","area":"Khoảng 58–87,1 m²"},{"name":"Căn 3 phòng ngủ","area":"Khoảng 102,8 m²"},{"name":"Penthouse"},{"name":"Shophouse"}]'::jsonb WHERE "slug" = 'cora-tower';
UPDATE "projects" SET "floor_plans" = '[{"name":"Mặt bằng tầng tòa C4 (1)","image":"/images/projects/capital-square/mat-bang-c4-1.webp"},{"name":"Mặt bằng tầng tòa C4 (2)","image":"/images/projects/capital-square/mat-bang-c4-2.webp"},{"name":"Mặt bằng tầng tòa C4 (3)","image":"/images/projects/capital-square/mat-bang-c4-3.webp"},{"name":"Mặt bằng tầng tòa C4 (4)","image":"/images/projects/capital-square/mat-bang-c4-4.webp"}]'::jsonb WHERE "slug" = 'capital-square';

-- Photos for projects that have no gallery yet.
INSERT INTO "project_images" ("id", "project_id", "media_id", "sort_order")
SELECT gen_random_uuid(), p."id", m."id", g."position"
FROM (VALUES
  ('capital-square', '/images/projects/capital-square/toan-canh-hoang-hon.webp', 0),
  ('capital-square', '/images/projects/capital-square/can-ho-noi-that.webp', 1),
  ('capital-square', '/images/projects/capital-square/toan-canh-tren-cao.webp', 2),
  ('capital-square', '/images/projects/capital-square/quang-truong-noi-khu.webp', 3),
  ('capital-square', '/images/projects/capital-square/be-boi.webp', 4),
  ('capital-square', '/images/projects/capital-square/khoi-de-thuong-mai.webp', 5),
  ('capital-square', '/images/projects/capital-square/park-boulevard.webp', 6),
  ('capital-square', '/images/projects/capital-square/san-thuong.webp', 7),
  ('sun-symphony-residence', '/images/projects/sun-symphony-residence/toan-canh.webp', 0),
  ('sun-symphony-residence', '/images/projects/sun-symphony-residence/can-ho-noi-that.webp', 1),
  ('sun-symphony-residence', '/images/projects/sun-symphony-residence/cac-toa-thap.webp', 2),
  ('sun-symphony-residence', '/images/projects/sun-symphony-residence/be-boi-trong-nha.webp', 3),
  ('sun-symphony-residence', '/images/projects/sun-symphony-residence/san-vuon-tren-cao.webp', 4),
  ('sun-symphony-residence', '/images/projects/sun-symphony-residence/the-sonata.webp', 5),
  ('sun-symphony-residence', '/images/projects/sun-symphony-residence/sky-villa.webp', 6),
  ('cora-tower', '/images/projects/cora-tower/hai-toa-thap.webp', 0),
  ('cora-tower', '/images/projects/cora-tower/kien-truc.webp', 1),
  ('cora-tower', '/images/projects/cora-tower/tam-nhin-ban-cong.webp', 2),
  ('cora-tower', '/images/projects/cora-tower/toan-canh.webp', 3),
  ('cora-tower', '/images/projects/cora-tower/sun-neo-city.webp', 4)
) AS g("slug", "url", "position")
JOIN "projects" p ON p."slug" = g."slug"
JOIN "media_assets" m ON m."key" = g."url"
WHERE NOT EXISTS (SELECT 1 FROM "project_images" i WHERE i."project_id" = p."id");
