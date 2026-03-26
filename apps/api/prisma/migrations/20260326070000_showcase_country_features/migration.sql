-- CreateEnum
CREATE TYPE "ShowcaseStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: Add country to users
ALTER TABLE "users" ADD COLUMN "country" TEXT;

-- AlterTable: Add showcase fields to generations
ALTER TABLE "generations" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "showcaseStatus" "ShowcaseStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "showcaseReviewedBy" TEXT,
ADD COLUMN "showcaseReviewedAt" TIMESTAMP(3),
ADD COLUMN "showcaseRejectionReason" TEXT,
ADD COLUMN "showcaseCategoryId" TEXT,
ADD COLUMN "showcaseTargetCountries" JSONB;

-- AlterTable: Add targetCountries to festival_calendar
ALTER TABLE "festival_calendar" ADD COLUMN "targetCountries" JSONB;

-- CreateIndex
CREATE INDEX "generations_isPublic_status_idx" ON "generations"("isPublic", "status");
CREATE INDEX "generations_showcaseStatus_idx" ON "generations"("showcaseStatus");

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_showcaseCategoryId_fkey" FOREIGN KEY ("showcaseCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
