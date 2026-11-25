-- The Hàn river had several Chinese names (汉江, 韩江, 翰江, "Han江"…): one for all.
UPDATE "translations" SET "text" = regexp_replace("text", '汉江|韩江|翰江|Han ?江|Han ?河', '瀚江', 'g'), "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "locale" = 'zh' AND "text" ~ '汉江|韩江|翰江|Han ?江|Han ?河';
