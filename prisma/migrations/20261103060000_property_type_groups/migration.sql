-- Property types fall in three groups: Căn hộ, Nhà phố, Mặt bằng.
ALTER TABLE "property_types" ADD COLUMN "group" TEXT NOT NULL DEFAULT 'apartment';

-- The list (also in prisma/reference-data.ts): shophouse joins the apartments;
-- townhouses (projects Euro Village 1, 2, Phúc Lộc Viên…) and commercial
-- premises get their own groups.
INSERT INTO "property_types" ("id", "code", "name", "group", "sort_order") VALUES
  (gen_random_uuid(), 'studio', 'Studio', 'apartment', 0),
  (gen_random_uuid(), '1pn', '1 phòng ngủ', 'apartment', 1),
  (gen_random_uuid(), '2pn', '2 phòng ngủ', 'apartment', 2),
  (gen_random_uuid(), '3pn', '3 phòng ngủ', 'apartment', 3),
  (gen_random_uuid(), 'shophouse', 'Shophouse', 'apartment', 4),
  (gen_random_uuid(), 'serviced', 'Căn hộ dịch vụ', 'apartment', 5),
  (gen_random_uuid(), 'penthouse', 'Penthouse', 'apartment', 6),
  (gen_random_uuid(), 'nha-pho', 'Nhà phố', 'townhouse', 7),
  (gen_random_uuid(), 'mat-bang', 'Mặt bằng', 'premises', 8)
ON CONFLICT ("code") DO UPDATE SET "group" = EXCLUDED."group", "sort_order" = EXCLUDED."sort_order";
