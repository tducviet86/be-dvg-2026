-- Visitors never see a unit's real code or floor (public-unit.ts): each unit
-- gets a random public number, each project the letters before it, and each
-- tower its number of floors (for "tầng thấp / trung / cao").
ALTER TABLE "projects" ADD COLUMN "code_prefix" TEXT;
ALTER TABLE "properties" ADD COLUMN "public_number" INTEGER;
ALTER TABLE "properties" ADD COLUMN "public_search_text" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "properties_public_number_key" ON "properties"("public_number");

UPDATE "projects" SET "code_prefix" = v.prefix
FROM (VALUES ('monarchy-apartments', 'MN'), ('sun-ponte-residence', 'SP'), ('sun-panoma', 'PN'), ('azura-da-nang', 'AZ'),
             ('sam-tower', 'ST'), ('hiyori-garden-tower', 'HG'), ('capital-square', 'CS'), ('sun-symphony-residence', 'SS'),
             ('cora-tower', 'CT'), ('sun-saphia-residence', 'SA'), ('s-light-tower', 'SL'), ('fours-tower', 'FT'),
             ('da-nang-downtown', 'DD')) AS v(slug, prefix)
WHERE "projects"."slug" = v.slug AND "projects"."code_prefix" IS NULL;

-- Floors of each tower, where Admin has not set them.
UPDATE "projects" p SET "towers" = (
  SELECT jsonb_agg(CASE WHEN t ? 'floors' OR f.floors IS NULL THEN t ELSE t || jsonb_build_object('floors', f.floors) END ORDER BY i)
  FROM jsonb_array_elements(p."towers") WITH ORDINALITY AS e(t, i)
  LEFT JOIN (VALUES ('monarchy-apartments', 'A', 18), ('monarchy-apartments', 'B', 33), ('sun-ponte-residence', 'T1', 26),
                    ('sun-ponte-residence', 'T2', 26), ('sun-panoma', 'P1', 33), ('sun-panoma', 'P2', 27)) AS f(slug, tower, floors)
    ON f.slug = p."slug" AND f.tower = t->>'name')
WHERE p."slug" IN ('monarchy-apartments', 'sun-ponte-residence', 'sun-panoma') AND jsonb_array_length(p."towers") > 0;

-- A random five-digit number per unit, never twice.
DO $$
DECLARE r RECORD; n INTEGER;
BEGIN
  FOR r IN SELECT "id" FROM "properties" WHERE "public_number" IS NULL ORDER BY random() LOOP
    LOOP
      n := 10000 + floor(random() * 90000)::int;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "properties" WHERE "public_number" = n);
    END LOOP;
    UPDATE "properties" SET "public_number" = n WHERE "id" = r."id";
  END LOOP;
END $$;
