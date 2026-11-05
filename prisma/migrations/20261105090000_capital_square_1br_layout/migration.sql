-- Capital Square: 3D layout of the 1-bedroom unit, on its unit type and in the photo album.
INSERT INTO "media_assets" ("id", "storage", "key", "url", "mime_type", "size_bytes", "width", "height", "alt", "updated_at")
VALUES (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/layout-can-1pn.webp', '/images/projects/capital-square/layout-can-1pn.webp', 'image/webp', 167456, 1340, 1124, 'Mặt bằng 3D căn 1 phòng ngủ Capital Square', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
ON CONFLICT ("key") DO NOTHING;

UPDATE "projects" SET
  "unit_types" = (
    SELECT jsonb_agg(
      CASE WHEN row->>'name' = 'Căn 1 phòng ngủ' AND NOT row ? 'image'
        THEN row || '{"image":"/images/projects/capital-square/layout-can-1pn.webp"}'::jsonb
        ELSE row END
      ORDER BY position)
    FROM jsonb_array_elements("unit_types") WITH ORDINALITY AS t(row, position)),
  "photos" = "photos" || '[{"group":"Căn hộ mẫu","image":"/images/projects/capital-square/layout-can-1pn.webp"}]'::jsonb
WHERE "slug" = 'capital-square' AND jsonb_array_length("unit_types") > 0;
