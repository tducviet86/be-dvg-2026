-- "Căn mẫu" read "Sample unit" and "2 PN +1" came out as "2 bedrooms +1",
-- "2 卧室 +1"…: the AI translations of those strings are removed, so the site
-- has them translated again with the new glossary. Staff corrections stay.
DELETE FROM "translations"
WHERE NOT "reviewed"
  AND (("locale" = 'en' AND "source" ~* 'căn mẫu|[0-9] ?PN ?\+ ?[0-9]')
    OR ("locale" IN ('ko', 'zh') AND "source" ~ '[0-9] ?PN ?\+ ?[0-9]'));
