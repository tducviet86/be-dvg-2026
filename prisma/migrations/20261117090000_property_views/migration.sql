-- One row per unit page view, for "Lượt xem gần đây" in Admin › Tổng quan.
-- No visitor data is stored (no IP, no user agent); rows older than 90 days
-- are removed by the API.
CREATE TABLE "property_views" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "device" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "property_views_created_at_idx" ON "property_views"("created_at");

ALTER TABLE "property_views" ADD CONSTRAINT "property_views_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
