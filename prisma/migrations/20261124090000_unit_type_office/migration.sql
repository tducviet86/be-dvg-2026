-- Offices for rent get their own group ("Văn phòng"), after Mặt bằng; like
-- premises they have no bedrooms and may stand outside any project.
INSERT INTO "property_types" ("id", "code", "name", "group", "sort_order")
VALUES (gen_random_uuid(), 'van-phong', 'Văn phòng', 'office', 12)
ON CONFLICT ("code") DO NOTHING;
