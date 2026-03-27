-- AlterTable: Add repeatable field group columns to field_schemas
ALTER TABLE "field_schemas" ADD COLUMN "isRepeatable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maxRepeat" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "groupKey" TEXT;
