-- Capital Square tower C1 (The Times): its floor plans from the developer's
-- drawings and its model units. A plan list already holding C1 is kept.
INSERT INTO "media_assets" ("id", "storage", "key", "url", "mime_type", "size_bytes", "width", "height", "alt", "updated_at")
VALUES
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c1-tang-9-25.webp', '/images/projects/capital-square/mat-bang-c1-tang-9-25.webp', 'image/webp', 100000, 960, 530, 'Mặt bằng Tòa C1 · Tầng 9-12, 14-25', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c1-tang-5-8.webp', '/images/projects/capital-square/mat-bang-c1-tang-5-8.webp', 'image/webp', 100000, 960, 530, 'Mặt bằng Tòa C1 · Tầng 5-8', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c1-tang-12a.webp', '/images/projects/capital-square/mat-bang-c1-tang-12a.webp', 'image/webp', 100000, 960, 530, 'Mặt bằng Tòa C1 · Tầng 12A', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
ON CONFLICT ("key") DO NOTHING;

UPDATE "projects"
SET "floor_plans" = "floor_plans" || '[{"name":"Tòa C1 · Tầng 9-12, 14-25","tower":"C1","image":"/images/projects/capital-square/mat-bang-c1-tang-9-25.webp"},{"name":"Tòa C1 · Tầng 5-8","tower":"C1","image":"/images/projects/capital-square/mat-bang-c1-tang-5-8.webp"},{"name":"Tòa C1 · Tầng 12A","tower":"C1","image":"/images/projects/capital-square/mat-bang-c1-tang-12a.webp"}]'::jsonb
WHERE "slug" = 'capital-square'
  AND "floor_plans"::text NOT LIKE '%mat-bang-c1-%';

INSERT INTO "properties" (
  "id", "slug", "name", "project_id", "property_type_id", "unit_code", "tower", "floor_note",
  "for_rent", "for_sale", "availability", "status", "published_at", "location",
  "area_m2", "bedrooms", "bathrooms", "furnishing", "cover_image_id", "description", "updated_at")
SELECT gen_random_uuid(), v.slug, v.name, p."id", t."id", v.code, v.tower, v.note,
  false, true, 'AVAILABLE', 'PUBLISHED', CURRENT_TIMESTAMP AT TIME ZONE 'UTC', p."location",
  v.area, v.beds, v.baths, 'ROUGH', m."id", v.description, CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
FROM (VALUES
  ('can-mau-c1-06-capital-square', 'Căn mẫu C1-06 1 PN', 'C1-06', 'C1', 'Tầng 5-12, 12A, 14-25', 47.43, 1, 1, '1pn', '/images/projects/capital-square/layout-can-1pn.webp', 'Căn mẫu 1 PN vị trí 06 tòa C1 (The Times), Capital Square, áp dụng cho tầng 5-12, 12A, 14-25. Diện tích thông thủy 47,43 m², tim tường 52,5 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c1-06a-capital-square', 'Căn mẫu C1-06A 1 PN', 'C1-06A', 'C1', 'Tầng 5-12, 12A, 14-25', 45.01, 1, 1, '1pn', '/images/projects/capital-square/layout-can-1pn.webp', 'Căn mẫu 1 PN vị trí 06A tòa C1 (The Times), Capital Square, áp dụng cho tầng 5-12, 12A, 14-25. Diện tích thông thủy 45,01 m², tim tường 48,54 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c1-08-capital-square', 'Căn mẫu C1-08 2 PN', 'C1-08', 'C1', 'Tầng 5-12, 12A, 14-25', 66.15, 2, 2, '2pn', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN vị trí 08 tòa C1 (The Times), Capital Square, áp dụng cho tầng 5-12, 12A, 14-25. Diện tích thông thủy 66,15 m², tim tường 71,65 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c1-09-capital-square', 'Căn mẫu C1-09 2 PN', 'C1-09', 'C1', 'Tầng 5-12, 12A, 14-25', 65.93, 2, 2, '2pn', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN vị trí 09 tòa C1 (The Times), Capital Square, áp dụng cho tầng 5-12, 12A, 14-25. Diện tích thông thủy 65,93 m², tim tường 71,57 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c1-10-capital-square', 'Căn mẫu C1-10 2 PN +1', 'C1-10', 'C1', 'Tầng 5-12, 12A, 14-25', 78.39, 2, 2, '2pn-plus', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN +1 vị trí 10 tòa C1 (The Times), Capital Square, áp dụng cho tầng 5-12, 12A, 14-25. Diện tích thông thủy 78,39 m², tim tường 85,08 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c1-05-capital-square', 'Căn mẫu C1-05 3 PN', 'C1-05', 'C1', 'Tầng 9-12, 12A, 14-25', 119.71, 3, 2, '3pn', '/images/projects/capital-square/layout-can-3pn.webp', 'Căn mẫu 3 PN vị trí 05 tòa C1 (The Times), Capital Square, áp dụng cho tầng 9-12, 12A, 14-25. Diện tích thông thủy 119,71 m², tim tường 127,94 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c1-05-t5-capital-square', 'Căn mẫu C1-05 2 PN', 'C1-05-T5', 'C1', 'Tầng 5-8', 72.26, 2, 2, '2pn', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN vị trí 05 tòa C1 (The Times), Capital Square, áp dụng cho tầng 5-8. Diện tích thông thủy 72,26 m², tim tường 77,93 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c1-03a-capital-square', 'Căn mẫu C1-03A 1 PN', 'C1-03A', 'C1', 'Tầng 5-8', 46.12, 1, 1, '1pn', '/images/projects/capital-square/layout-can-1pn.webp', 'Căn mẫu 1 PN vị trí 03A tòa C1 (The Times), Capital Square, áp dụng cho tầng 5-8. Diện tích thông thủy 46,12 m², tim tường 49,96 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c1-03-capital-square', 'Căn mẫu C1-03 2 PN', 'C1-03', 'C1', 'Tầng 5-12, 14-25', 65.82, 2, 2, '2pn', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN vị trí 03 tòa C1 (The Times), Capital Square, áp dụng cho tầng 5-12, 14-25. Diện tích thông thủy 65,82 m², tim tường 71,55 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c1-02-capital-square', 'Căn mẫu C1-02 2 PN', 'C1-02', 'C1', 'Tầng 5-12, 12A, 14-25', 65.82, 2, 2, '2pn', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN vị trí 02 tòa C1 (The Times), Capital Square, áp dụng cho tầng 5-12, 12A, 14-25. Diện tích thông thủy 65,82 m², tim tường 71,39 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.'),
  ('can-mau-c1-01-capital-square', 'Căn mẫu C1-01 2 PN +1', 'C1-01', 'C1', 'Tầng 5-12, 12A, 14-25', 78.45, 2, 2, '2pn-plus', '/images/projects/capital-square/layout-can-2pn.webp', 'Căn mẫu 2 PN +1 vị trí 01 tòa C1 (The Times), Capital Square, áp dụng cho tầng 5-12, 12A, 14-25. Diện tích thông thủy 78,45 m², tim tường 85,08 m². Bố cục theo mặt bằng điển hình của chủ đầu tư, thông tin từng căn sẽ được xác nhận khi tư vấn.')
) AS v(slug, name, code, tower, note, area, beds, baths, type, cover, description)
JOIN "projects" p ON p."slug" = 'capital-square'
JOIN "property_types" t ON t."code" = v.type
LEFT JOIN "media_assets" m ON m."key" = v.cover
ON CONFLICT ("slug") DO NOTHING;
