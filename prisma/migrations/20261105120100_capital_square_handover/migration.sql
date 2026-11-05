-- Handover written as text ("Quý IV/2027"); Capital Square units are handed over rough.
ALTER TABLE "projects" ADD COLUMN "handover_note" TEXT;

UPDATE "projects" SET "handover_note" = 'Quý IV/2027' WHERE "slug" = 'capital-square';

UPDATE "properties" SET "furnishing" = 'ROUGH'
WHERE "project_id" IN (SELECT "id" FROM "projects" WHERE "slug" = 'capital-square');
