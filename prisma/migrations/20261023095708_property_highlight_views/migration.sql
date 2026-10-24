-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "highlight" TEXT;

-- CreateTable
CREATE TABLE "property_view_days" (
    "property_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "property_view_days_pkey" PRIMARY KEY ("property_id","day")
);

-- CreateIndex
CREATE INDEX "property_view_days_day_idx" ON "property_view_days"("day");

-- AddForeignKey
ALTER TABLE "property_view_days" ADD CONSTRAINT "property_view_days_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
