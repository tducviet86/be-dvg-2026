-- The project sales page: towers, grouped photos, sales policies, connections,
-- construction photos, video; a tower and a view on each unit.
ALTER TABLE "projects"
  ADD COLUMN "towers" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "photos" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "sales_policies" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "connections" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "progress_photos" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "video_url" TEXT,
  ADD COLUMN "scale" TEXT;
ALTER TABLE "properties"
  ADD COLUMN "tower" TEXT,
  ADD COLUMN "view_note" TEXT;

-- The floor plans on file belong to tower C4.
UPDATE "projects"
SET "floor_plans" = (SELECT jsonb_agg(plan || '{"tower":"C4"}'::jsonb) FROM jsonb_array_elements("floor_plans") AS plan)
WHERE "slug" = 'capital-square' AND jsonb_array_length("floor_plans") > 0;

UPDATE "projects" SET
  "towers" = '[{"name": "C4", "status": "Đang mở bán"}, {"name": "C6", "status": "Đang mở bán"}, {"name": "C7", "status": "Đang mở bán"}, {"name": "S4", "status": "Đang mở bán"}, {"name": "S3", "status": "Đang mở bán"}, {"name": "C3", "status": "Đang nhận booking"}]'::jsonb,
  "photos" = '[{"group": "Phối cảnh", "image": "/images/projects/capital-square/toan-canh-hoang-hon.webp"}, {"group": "Phối cảnh", "image": "/images/projects/capital-square/toan-canh-tren-cao.webp"}, {"group": "Phối cảnh", "image": "/images/projects/capital-square/ven-song-han.webp"}, {"group": "Phối cảnh", "image": "/images/projects/capital-square/khoi-de-thuong-mai.webp"}, {"group": "Phối cảnh", "image": "/images/projects/capital-square/trung-tam-thuong-mai.webp"}, {"group": "Phối cảnh", "image": "/images/projects/capital-square/park-boulevard.webp"}, {"group": "Phối cảnh", "image": "/images/projects/capital-square/ket-noi.webp"}, {"group": "Căn hộ mẫu", "image": "/images/projects/capital-square/can-ho-noi-that.webp"}, {"group": "Tiện ích", "image": "/images/projects/capital-square/quang-truong-noi-khu.webp"}, {"group": "Tiện ích", "image": "/images/projects/capital-square/be-boi.webp"}, {"group": "Tiện ích", "image": "/images/projects/capital-square/khu-vui-choi.webp"}, {"group": "Tiện ích", "image": "/images/projects/capital-square/san-thuong.webp"}]'::jsonb,
  "connections" = '[{"place": "Vincom Plaza, cầu Rồng, chợ Cồn", "time": "Khoảng 5 phút"}, {"place": "Bảo tàng Đà Nẵng", "time": "Khoảng 5 phút"}, {"place": "Sân bay quốc tế Đà Nẵng", "time": "Khoảng 15 phút"}]'::jsonb,
  "scale" = 'Khu đất khoảng 6,14 ha, 14 tòa căn hộ và 1 tòa thương mại dịch vụ, cao 24–29 tầng',
  "total_units" = COALESCE("total_units", 3391),
  "developer" = COALESCE("developer", 'Capital Square 2: Công ty TNHH Mega Assets. Capital Square 3: Công ty TNHH Bất động sản SIH'),
  "legal_status" = COALESCE("legal_status", 'Sổ đỏ sở hữu lâu dài. Hãy đối chiếu giấy tờ của đúng căn trước khi giao dịch.')
WHERE "slug" = 'capital-square';
UPDATE "projects" SET "photos" = '[{"group": "Phối cảnh", "image": "/images/projects/sun-symphony-residence/toan-canh.webp"}, {"group": "Phối cảnh", "image": "/images/projects/sun-symphony-residence/cac-toa-thap.webp"}, {"group": "Phối cảnh", "image": "/images/projects/sun-symphony-residence/ven-song.webp"}, {"group": "Phối cảnh", "image": "/images/projects/sun-symphony-residence/the-sonata.webp"}, {"group": "Phối cảnh", "image": "/images/projects/sun-symphony-residence/toa-thap-nhin-cao.webp"}, {"group": "Căn hộ mẫu", "image": "/images/projects/sun-symphony-residence/can-ho-noi-that.webp"}, {"group": "Căn hộ mẫu", "image": "/images/projects/sun-symphony-residence/sky-villa.webp"}, {"group": "Tiện ích", "image": "/images/projects/sun-symphony-residence/be-boi-trong-nha.webp"}, {"group": "Tiện ích", "image": "/images/projects/sun-symphony-residence/san-vuon-tren-cao.webp"}]'::jsonb WHERE "slug" = 'sun-symphony-residence';
UPDATE "projects" SET "photos" = '[{"group": "Phối cảnh", "image": "/images/projects/cora-tower/hai-toa-thap.webp"}, {"group": "Phối cảnh", "image": "/images/projects/cora-tower/kien-truc.webp"}, {"group": "Phối cảnh", "image": "/images/projects/cora-tower/toan-canh.webp"}, {"group": "Phối cảnh", "image": "/images/projects/cora-tower/vi-tri.webp"}, {"group": "Phối cảnh", "image": "/images/projects/cora-tower/sun-neo-city.webp"}, {"group": "Căn hộ mẫu", "image": "/images/projects/cora-tower/tam-nhin-ban-cong.webp"}]'::jsonb WHERE "slug" = 'cora-tower';

INSERT INTO "project_amenities" ("id", "project_id", "name", "sort_order")
SELECT gen_random_uuid(), p."id", a."name", a."position"
FROM (VALUES
  ('Quảng trường trên 2.000 m²', 0),
  ('Bể bơi 500 m²', 1),
  ('Hồ bơi trong nhà và ngoài trời', 2),
  ('Phòng Gym & Yoga', 3),
  ('Spa & Sauna', 4),
  ('Sky Lounge & Rooftop Bar', 5),
  ('Rooftop Garden', 6),
  ('Vườn nướng BBQ', 7),
  ('Đường chạy bộ nội khu', 8),
  ('Khu vui chơi trẻ em', 9),
  ('Sân tập Yoga và vườn thiền', 10)
) AS a("name", "position")
JOIN "projects" p ON p."slug" = 'capital-square'
WHERE NOT EXISTS (SELECT 1 FROM "project_amenities" x WHERE x."project_id" = p."id");
