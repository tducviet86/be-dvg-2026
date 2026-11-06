-- Capital Square: tower C3 (Royal Place) hands over a year after the others.
UPDATE "projects"
SET "towers" = (
  SELECT jsonb_agg(
    CASE WHEN x.e->>'name' = 'C3' AND NOT x.e ? 'handover' THEN x.e || '{"handover":"Quý IV/2028"}'::jsonb ELSE x.e END
    ORDER BY x.ord)
  FROM jsonb_array_elements("towers") WITH ORDINALITY AS x(e, ord))
WHERE "slug" = 'capital-square'
  AND jsonb_typeof("towers") = 'array'
  AND jsonb_array_length("towers") > 0;
