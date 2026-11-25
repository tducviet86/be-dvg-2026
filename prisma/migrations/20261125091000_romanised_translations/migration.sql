-- Korean and Chinese texts stored as pinyin, Vietnamese without accents or
-- English (three lowercase Latin words in a row): removed, so the site has
-- them translated again. Staff corrections stay.
DELETE FROM "translations"
WHERE "locale" IN ('ko', 'zh') AND NOT "reviewed" AND "text" <> "source"
  AND "text" ~ '(^|[^[:alnum:]_@./-])[a-z]+([ ,]+[a-z]+){2,}([^[:alnum:]_@./-]|$)';
