-- Units whose price leaves out VAT and the maintenance fund: Capital Square's foreign quota.
ALTER TABLE "properties" ADD COLUMN "price_excludes_fees" BOOLEAN NOT NULL DEFAULT false;

UPDATE "properties" SET
  "price_excludes_fees" = true,
  "description" = "description" || ' Giá chưa gồm VAT và kinh phí bảo trì.'
WHERE "quota" = 'Quỹ nước ngoài'
  AND "project_id" IN (SELECT "id" FROM "projects" WHERE "slug" = 'capital-square');

UPDATE "projects" SET "price_note" = 'Giá đã gồm VAT và kinh phí bảo trì, trừ các căn ghi "Chưa gồm VAT, KPBT". Giá tính theo diện tích thông thủy và có thể thay đổi theo từng thời điểm, vui lòng liên hệ để xác nhận.'
WHERE "slug" = 'capital-square' AND "price_note" LIKE 'Giá đã gồm VAT%';
