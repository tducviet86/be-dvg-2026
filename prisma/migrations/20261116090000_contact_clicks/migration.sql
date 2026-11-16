-- Taps on the site's call, Zalo and WhatsApp links, one row each, for
-- Admin › Tổng quan. No visitor data is stored (no IP, no device).
CREATE TABLE "contact_clicks" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "target" VARCHAR(64),
    "property_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_clicks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_clicks_created_at_idx" ON "contact_clicks"("created_at");

ALTER TABLE "contact_clicks" ADD CONSTRAINT "contact_clicks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
