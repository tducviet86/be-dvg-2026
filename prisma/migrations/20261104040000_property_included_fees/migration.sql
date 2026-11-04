-- Costs the rent already covers (water, electricity, management, internet, parking).
ALTER TABLE "properties" ADD COLUMN "included_fees" TEXT[] DEFAULT ARRAY[]::TEXT[];
