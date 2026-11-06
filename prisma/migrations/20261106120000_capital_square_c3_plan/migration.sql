-- Capital Square tower C3 (Royal Place): its floor plan and model units. A plan
-- list already holding C3, or a tower note set in Admin, is kept.
INSERT INTO "media_assets" ("id", "storage", "key", "url", "mime_type", "size_bytes", "width", "height", "alt", "updated_at")
VALUES
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c3-tang-5-23.webp', '/images/projects/capital-square/mat-bang-c3-tang-5-23.webp', 'image/webp', 100000, 1160, 755, 'Mặt bằng Tòa C3 · Tầng 5-12, 14-23', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
ON CONFLICT ("key") DO NOTHING;

UPDATE "projects"
SET "floor_plans" = "floor_plans" || '[{"name":"Tòa C3 · Tầng 5-12, 14-23","tower":"C3","image":"/images/projects/capital-square/mat-bang-c3-tang-5-23.webp"}]'::jsonb
WHERE "slug" = 'capital-square'
  AND "floor_plans"::text NOT LIKE '%mat-bang-c3-%';

UPDATE "projects"
SET "towers" = (
  SELECT jsonb_agg(
    CASE WHEN x.e->>'name' = 'C3' AND NOT x.e ? 'note' THEN x.e || '{"note":"Royal Place"}'::jsonb ELSE x.e END
    ORDER BY x.ord)
  FROM jsonb_array_elements("towers") WITH ORDINALITY AS x(e, ord))
WHERE "slug" = 'capital-square'
  AND jsonb_typeof("towers") = 'array'
  AND jsonb_array_length("towers") > 0;

INSERT INTO "properties" (
  "id", "slug", "name", "project_id", "property_type_id", "unit_code", "tower", "floor_note",
  "for_rent", "for_sale", "availability", "status", "published_at", "location",
  "area_m2", "bedrooms", "bathrooms", "furnishing", "cover_image_id", "description", "updated_at")
SELECT gen_random_uuid(), v.slug, v.name, p."id", t."id", v.code, v.tower, v.note,
  false, true, 'AVAILABLE', 'PUBLISHED', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', p."location",
  v.area, v.beds, v.baths, 'ROUGH', m."id", v.description, CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
FROM (VALUES
  ('can-mau-c3-06-capital-square-c3-06', 'Căn mẫu C3-06 1 PN', 'C3-06', 'C3', 'Tầng 5-12, 14-23', 47.43, 1, 1, '1pn', '/images/projects/capital-square/layout-can-1pn.webp', 'Căn mẫu 1 PN vị trí 06 tòa C3 (Royal Place), Capital Square, áp dụng cho tầng 5-12, 14-23. Diện tích thông thủy 47,43 m², tim tường 52,50 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c3-06a-capital-square-c3-06a', 'Căn mẫu C3-06A 1 PN', 'C3-06A', 'C3', 'Tầng 5-12, 14-23', 45.01, 1, 1, '1pn', '/images/projects/capital-square/layout-can-1pn.webp', 'Căn mẫu 1 PN vị trí 06A tòa C3 (Royal Place), Capital Square, áp dụng cho tầng 5-12, 14-23. Diện tích thông thủy 45,01 m², tim tường 48,54 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c3-08-capital-square-c3-08', 'Căn mẫu C3-08 2 PN', 'C3-08', 'C3', 'Tầng 5-12, 14-23', 66.16, 2, 2, '2pn', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN vị trí 08 tòa C3 (Royal Place), Capital Square, áp dụng cho tầng 5-12, 14-23. Diện tích thông thủy 66,16 m², tim tường 71,65 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c3-09-capital-square-c3-09', 'Căn mẫu C3-09 2 PN', 'C3-09', 'C3', 'Tầng 5-12, 14-23', 65.93, 2, 2, '2pn', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN vị trí 09 tòa C3 (Royal Place), Capital Square, áp dụng cho tầng 5-12, 14-23. Diện tích thông thủy 65,93 m², tim tường 71,57 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c3-10-capital-square-c3-10', 'Căn mẫu C3-10 2 PN +1', 'C3-10', 'C3', 'Tầng 5-12, 14-23', 78.51, 2, 2, '2pn-plus', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN +1 vị trí 10 tòa C3 (Royal Place), Capital Square, áp dụng cho tầng 5-12, 14-23. Diện tích thông thủy 78,51 m², tim tường 85,11 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c3-05-capital-square-c3-05', 'Căn mẫu C3-05 3 PN', 'C3-05', 'C3', 'Tầng 5-12, 14-23', 119.71, 3, 2, '3pn', '/images/projects/capital-square/layout-can-3pn.webp', 'Căn mẫu 3 PN vị trí 05 tòa C3 (Royal Place), Capital Square, áp dụng cho tầng 5-12, 14-23. Diện tích thông thủy 119,71 m², tim tường 127,94 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c3-03-capital-square-c3-03', 'Căn mẫu C3-03 2 PN', 'C3-03', 'C3', 'Tầng 5-12, 14-23', 65.82, 2, 2, '2pn', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN vị trí 03 tòa C3 (Royal Place), Capital Square, áp dụng cho tầng 5-12, 14-23. Diện tích thông thủy 65,82 m², tim tường 71,55 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c3-02-capital-square-c3-02', 'Căn mẫu C3-02 2 PN', 'C3-02', 'C3', 'Tầng 5-12, 14-23', 65.82, 2, 2, '2pn', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN vị trí 02 tòa C3 (Royal Place), Capital Square, áp dụng cho tầng 5-12, 14-23. Diện tích thông thủy 65,82 m², tim tường 71,39 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c3-01-capital-square-c3-01', 'Căn mẫu C3-01 2 PN +1', 'C3-01', 'C3', 'Tầng 5-12, 14-23', 78.45, 2, 2, '2pn-plus', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN +1 vị trí 01 tòa C3 (Royal Place), Capital Square, áp dụng cho tầng 5-12, 14-23. Diện tích thông thủy 78,45 m², tim tường 85,11 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.')
) AS v(slug, name, code, tower, note, area, beds, baths, type, cover, description)
JOIN "projects" p ON p."slug" = 'capital-square'
JOIN "property_types" t ON t."code" = v.type
LEFT JOIN "media_assets" m ON m."key" = v.cover
ON CONFLICT ("slug") DO NOTHING;
