-- The towers of the three rental projects, so a unit can say which one it
-- is in (Admin picks it from "Các tòa"; cards show "Tòa B · Tầng 26").
-- Only filled where "Các tòa" is still empty: towers typed in Admin stay.
UPDATE "projects" SET "towers" = '[{"name": "A"}, {"name": "B"}]'::jsonb
WHERE "slug" = 'monarchy-apartments' AND "towers" = '[]'::jsonb;

UPDATE "projects" SET "towers" = '[{"name": "T1"}, {"name": "T2"}]'::jsonb
WHERE "slug" = 'sun-ponte-residence' AND "towers" = '[]'::jsonb;

UPDATE "projects" SET "towers" = '[{"name": "P1"}, {"name": "P2"}]'::jsonb
WHERE "slug" = 'sun-panoma' AND "towers" = '[]'::jsonb;
