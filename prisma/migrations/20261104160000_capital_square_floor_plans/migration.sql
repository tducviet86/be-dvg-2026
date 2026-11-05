-- Capital Square floor plans per tower: C4 and C6 from the developer's sale kit,
-- C7, S3 and S4 from public copies of the developer's drawings. (The earlier
-- "C4" plans 3 and 4 were in fact tower C6.) A list edited in Admin is kept.
INSERT INTO "media_assets" ("id", "storage", "key", "url", "mime_type", "size_bytes", "width", "height", "alt", "updated_at")
VALUES
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c4-tang-11-27.webp', '/images/projects/capital-square/mat-bang-c4-tang-11-27.webp', 'image/webp', 122996, 1646, 805, 'Mặt bằng Tòa C4 · Tầng 11-12, 14-27', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c4-tang-5-10.webp', '/images/projects/capital-square/mat-bang-c4-tang-5-10.webp', 'image/webp', 126670, 1646, 825, 'Mặt bằng Tòa C4 · Tầng 5-10', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c6-tang-11-27.webp', '/images/projects/capital-square/mat-bang-c6-tang-11-27.webp', 'image/webp', 121906, 1673, 805, 'Mặt bằng Tòa C6 · Tầng 11-12, 14-27', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c6-tang-5-10.webp', '/images/projects/capital-square/mat-bang-c6-tang-5-10.webp', 'image/webp', 125212, 1673, 825, 'Mặt bằng Tòa C6 · Tầng 5-10', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c7-tang-11-27.webp', '/images/projects/capital-square/mat-bang-c7-tang-11-27.webp', 'image/webp', 81326, 1125, 552, 'Mặt bằng Tòa C7 · Tầng 11-12, 14-27', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-c7-tang-5-10.webp', '/images/projects/capital-square/mat-bang-c7-tang-5-10.webp', 'image/webp', 84984, 1125, 557, 'Mặt bằng Tòa C7 · Tầng 5-10', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-s4-tang-5-24.webp', '/images/projects/capital-square/mat-bang-s4-tang-5-24.webp', 'image/webp', 155762, 1200, 848, 'Mặt bằng Tòa S4 · Tầng 5-12, 14-24', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-s4-tang-12a.webp', '/images/projects/capital-square/mat-bang-s4-tang-12a.webp', 'image/webp', 151052, 1200, 848, 'Mặt bằng Tòa S4 · Tầng 12A', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'EXTERNAL', '/images/projects/capital-square/mat-bang-s3-tang-5-24.webp', '/images/projects/capital-square/mat-bang-s3-tang-5-24.webp', 'image/webp', 153818, 1160, 790, 'Mặt bằng Tòa S3 · Tầng 5-12, 14-24', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
ON CONFLICT ("key") DO NOTHING;

UPDATE "projects"
SET "floor_plans" = '[{"name":"Tòa C4 · Tầng 11-12, 14-27","tower":"C4","image":"/images/projects/capital-square/mat-bang-c4-tang-11-27.webp"},{"name":"Tòa C4 · Tầng 5-10","tower":"C4","image":"/images/projects/capital-square/mat-bang-c4-tang-5-10.webp"},{"name":"Tòa C6 · Tầng 11-12, 14-27","tower":"C6","image":"/images/projects/capital-square/mat-bang-c6-tang-11-27.webp"},{"name":"Tòa C6 · Tầng 5-10","tower":"C6","image":"/images/projects/capital-square/mat-bang-c6-tang-5-10.webp"},{"name":"Tòa C7 · Tầng 11-12, 14-27","tower":"C7","image":"/images/projects/capital-square/mat-bang-c7-tang-11-27.webp"},{"name":"Tòa C7 · Tầng 5-10","tower":"C7","image":"/images/projects/capital-square/mat-bang-c7-tang-5-10.webp"},{"name":"Tòa S4 · Tầng 5-12, 14-24","tower":"S4","image":"/images/projects/capital-square/mat-bang-s4-tang-5-24.webp"},{"name":"Tòa S4 · Tầng 12A","tower":"S4","image":"/images/projects/capital-square/mat-bang-s4-tang-12a.webp"},{"name":"Tòa S3 · Tầng 5-12, 14-24","tower":"S3","image":"/images/projects/capital-square/mat-bang-s3-tang-5-24.webp"}]'::jsonb
WHERE "slug" = 'capital-square'
  AND ("floor_plans" = '[]'::jsonb OR "floor_plans"::text LIKE '%mat-bang-c4-1.webp%');

DELETE FROM "media_assets" WHERE "key" LIKE '/images/projects/capital-square/mat-bang-c4-_.webp';
