-- "Sổ đỏ sở hữu lâu dài" read differently in each place ("pink book"…): one
-- clear wording, marked reviewed so a later AI run does not replace it.
UPDATE "translations" SET "text" = 'Long-term ownership with a red book (land use right certificate).', "reviewed" = true, "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "locale" = 'en' AND "source" = 'Sổ đỏ sở hữu lâu dài.';
UPDATE "translations" SET "text" = 'Long-term ownership, red book (land use right certificate)', "reviewed" = true, "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "locale" = 'en' AND "source" = 'Sổ đỏ sở hữu lâu dài';
UPDATE "translations" SET "text" = '장기 소유, 레드북(토지사용권 증서).', "reviewed" = true, "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "locale" = 'ko' AND "source" = 'Sổ đỏ sở hữu lâu dài.';
UPDATE "translations" SET "text" = '장기 소유, 레드북(토지사용권 증서)', "reviewed" = true, "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "locale" = 'ko' AND "source" = 'Sổ đỏ sở hữu lâu dài';
UPDATE "translations" SET "text" = '长期产权，持红本（土地使用权证）。', "reviewed" = true, "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "locale" = 'zh' AND "source" = 'Sổ đỏ sở hữu lâu dài.';
UPDATE "translations" SET "text" = '长期产权，持红本（土地使用权证）', "reviewed" = true, "updated_at" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "locale" = 'zh' AND "source" = 'Sổ đỏ sở hữu lâu dài';
