-- Where unit page views come from (Google, AI assistants, Zalo, Facebook…),
-- per unit and day. Views before this have no source.
CREATE TABLE "property_view_sources" (
    "property_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "property_view_sources_pkey" PRIMARY KEY ("property_id","day","source")
);

CREATE INDEX "property_view_sources_day_idx" ON "property_view_sources"("day");

ALTER TABLE "property_view_sources" ADD CONSTRAINT "property_view_sources_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
