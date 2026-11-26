-- AI slips in the model-unit strings translated again: "bàn giao thô" read
-- as golf in Korean ("골프조적", "골프 쉘"…), and English "3D Model Model unit…",
-- "Floor plan Model unit…". Removed so the site translates them again with
-- the glossary. Staff corrections stay; Korean text about real golf stays.
DELETE FROM "translations"
WHERE NOT "reviewed"
  AND (("locale" = 'ko' AND "source" ~* 'thô' AND "text" ~ '골프')
    OR ("locale" = 'en' AND "text" ~ '^(3D Model Model unit|Floor [Pp]lan Model unit)'));
