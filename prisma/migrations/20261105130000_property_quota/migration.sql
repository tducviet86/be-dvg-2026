-- A unit's sales quota ("Quỹ nước ngoài"), and Capital Square towers C1 and C4 by name.
ALTER TABLE "properties" ADD COLUMN "quota" TEXT;

UPDATE "projects" SET "towers" = (
    SELECT jsonb_agg(
      CASE tower->>'name'
        WHEN 'C4' THEN tower || '{"note":"The Queens"}'::jsonb
        ELSE tower
      END)
    FROM jsonb_array_elements("towers") AS tower)
  || '[{"name":"C1","status":"Đang mở bán","note":"The Times"}]'::jsonb
WHERE "slug" = 'capital-square' AND jsonb_array_length("towers") > 0
  AND NOT "towers" @> '[{"name":"C1"}]'::jsonb;
