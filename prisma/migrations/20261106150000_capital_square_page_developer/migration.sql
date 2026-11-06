-- The apartments page of Capital Square names the same developer.
UPDATE "static_pages"
SET "sections" = replace(
  "sections"::text,
  'Capital Square 2 do Công ty TNHH Mega Assets và Capital Square 3 do Công ty TNHH Bất động sản SIH làm chủ đầu tư.',
  'Tập đoàn BRG làm chủ đầu tư.'
)::jsonb
WHERE "path" = 'du-an/capital-square/can-ho';
