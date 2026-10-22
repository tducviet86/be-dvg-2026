-- CreateTable
CREATE TABLE "translations" (
    "id" UUID NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "source_hash" CHAR(64) NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "model" VARCHAR(60),
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "translations_locale_source_hash_key" ON "translations"("locale", "source_hash");
