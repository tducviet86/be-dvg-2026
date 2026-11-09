-- Korean FAQ said "지하 24~29층" (24–29 basement floors); the towers have 24–29
-- floors above ground. Marked reviewed so a later AI run does not replace it.
UPDATE "translations" SET "text" = '부지 약 6.14헥타르, 아파트 14개 동 및 상업 서비스 빌딩 1개 동, 지상 24~29층.', "reviewed" = true, "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "locale" = 'ko' AND "source" = 'Khu đất khoảng 6,14 ha, 14 tòa căn hộ và 1 tòa thương mại dịch vụ, cao 24–29 tầng.';
