-- "2 PN +1" units, a note above a project's price list, and tower names.
INSERT INTO "property_types" ("id", "code", "name", "group", "sort_order")
VALUES (gen_random_uuid(), '2pn-plus', '2 phòng ngủ +1', 'apartment', 2)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "projects" ADD COLUMN "price_note" TEXT;

UPDATE "projects" SET
  "price_note" = 'Giá đã gồm VAT và kinh phí bảo trì, tính theo diện tích thông thủy. Giá có thể thay đổi theo từng thời điểm, vui lòng liên hệ để xác nhận.',
  "towers" = (
    SELECT jsonb_agg(
      CASE tower->>'name'
        WHEN 'C6' THEN tower || '{"note":"The Kings"}'::jsonb
        WHEN 'C7' THEN tower || '{"note":"Victory"}'::jsonb
        WHEN 'S4' THEN tower || '{"note":"Hudson"}'::jsonb
        ELSE tower
      END)
    FROM jsonb_array_elements("towers") AS tower)
WHERE "slug" = 'capital-square' AND jsonb_array_length("towers") > 0;
