-- A townhouse or premises can stand outside any project; it then has its
-- own place on the map.
ALTER TABLE "properties" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "properties" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "properties" ADD COLUMN "longitude" DECIMAL(10,7);
