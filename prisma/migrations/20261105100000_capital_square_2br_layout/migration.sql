-- Capital Square: 3D layout of the 2-bedroom unit (also used for 2PN +1), on the
-- unit types and in the photo album; a separate "2 PN +1" unit type.
INSERT INTO "media_assets" ("id", "storage", "key", "url", "mime_type", "size_bytes", "width", "height", "alt", "updated_at")
VALUES (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/layout-can-2pn.webp', '/images/projects/capital-square/layout-can-2pn.webp', 'image/webp', 100880, 1230, 1099, 'Mặt bằng 3D căn 2 phòng ngủ Capital Square', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
ON CONFLICT ("key") DO NOTHING;

UPDATE "projects" SET
  "unit_types" = (
    SELECT jsonb_agg(entry ORDER BY position, part)
    FROM jsonb_array_elements("unit_types") WITH ORDINALITY AS t(row, position)
    CROSS JOIN LATERAL (
      SELECT CASE WHEN row->>'name' = 'Căn 2 phòng ngủ' AND NOT row ? 'image'
               THEN row || '{"image":"/images/projects/capital-square/layout-can-2pn.webp"}'::jsonb
               ELSE row END AS entry, 0 AS part
      UNION ALL
      SELECT '{"name":"Căn 2 phòng ngủ +1","area":"Khoảng 77,69–77,84 m²","image":"/images/projects/capital-square/layout-can-2pn.webp"}'::jsonb, 1
      WHERE row->>'name' = 'Căn 2 phòng ngủ'
    ) AS parts),
  "photos" = "photos" || '[{"group":"Căn hộ mẫu","image":"/images/projects/capital-square/layout-can-2pn.webp"}]'::jsonb
WHERE "slug" = 'capital-square' AND jsonb_array_length("unit_types") > 0;
