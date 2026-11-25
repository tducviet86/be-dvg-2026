-- "10.750 tỷ" kept its Vietnamese thousands dot and read as 10.75 billion.
UPDATE "translations"
SET "text" = replace(replace(replace("text", '10.750十亿', '10.75万亿'), '10.500十亿', '10.5万亿'), '7.359十亿', '7.359万亿'), "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "locale" = 'zh' AND "source" ~ '(10\.750|10\.500|7\.359) tỷ' AND "text" ~ '(10\.750|10\.500|7\.359)十亿';
UPDATE "translations"
SET "text" = replace("text", '10.750 billion', '10.75 trillion'), "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "locale" = 'en' AND "source" LIKE '%10.750 tỷ%' AND "text" LIKE '%10.750 billion%';
