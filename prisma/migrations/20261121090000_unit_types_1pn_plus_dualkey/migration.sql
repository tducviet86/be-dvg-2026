-- Two more apartment types: "1 phòng ngủ +1" and "Dualkey" (a 2-bedroom
-- apartment and a studio, each with its own door), placed among the others.
INSERT INTO "property_types" ("id", "code", "name", "group", "sort_order")
VALUES
  (gen_random_uuid(), '1pn-plus', '1 phòng ngủ +1', 'apartment', 2),
  (gen_random_uuid(), 'dualkey', 'Dualkey (2 PN + Studio)', 'apartment', 5)
ON CONFLICT ("code") DO NOTHING;

UPDATE "property_types" AS t SET "sort_order" = o.sort_order
FROM (VALUES
  ('studio', 0), ('1pn', 1), ('1pn-plus', 2), ('2pn', 3), ('2pn-plus', 4),
  ('dualkey', 5), ('3pn', 6), ('shophouse', 7), ('serviced', 8),
  ('penthouse', 9), ('nha-pho', 10), ('mat-bang', 11)
) AS o(code, sort_order)
WHERE t."code" = o.code;
