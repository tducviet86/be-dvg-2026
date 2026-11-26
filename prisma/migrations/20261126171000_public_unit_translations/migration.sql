-- The public dictionary (/i18n/dictionary) lists every translated source:
-- texts of owners' units saved before their codes and floors were masked
-- (public-unit.ts) go, staff corrections too. The site translates the masked
-- texts again. Model units (with a floor note) keep their codes.
DELETE FROM "translations" t
USING "properties" p
WHERE coalesce(p."floor_note", '') = ''
  AND (
    (length(regexp_replace(coalesce(p."unit_code", ''), '[^0-9A-Za-z]', '', 'g')) >= 3
      AND t."source" ~* ('(^|[^[:alnum:]-])' || regexp_replace(p."unit_code", '([.+*?^$(){}|\[\]\\])', '\\\1', 'g') || '($|[^[:alnum:]])'))
    OR ((t."source" = p."name" OR t."source" = p."seo_title" OR t."source" = p."seo_description" OR strpos(p."description", t."source") > 0)
      AND t."source" ~* '(tầng|lầu)\s*[0-9]')
  );
