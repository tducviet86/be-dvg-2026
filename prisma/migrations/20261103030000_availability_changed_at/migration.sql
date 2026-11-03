-- When a unit's availability last changed (rented units leave the site after a few days).
ALTER TABLE "properties" ADD COLUMN "availability_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Existing units: their last edit is the latest the availability can have changed.
UPDATE "properties" SET "availability_changed_at" = "updated_at";
