-- Migration: Replace Indian regional languages with international languages

-- Add new enum values
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'SPANISH';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'FRENCH';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'ARABIC';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'JAPANESE';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'CHINESE';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'KOREAN';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'PORTUGUESE';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'GERMAN';

-- Add batchId column for multi-language generation batches
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
CREATE INDEX IF NOT EXISTS "generations_batchId_idx" ON "generations"("batchId");

-- Note: PostgreSQL does not support removing enum values directly.
-- The old values (MARATHI, GUJARATI, TAMIL, TELUGU, KANNADA, BENGALI, PUNJABI, SANSKRIT)
-- will remain in the enum but are no longer used by the application.
-- Any existing generations with old language values will still be readable.
-- To fully remove them would require recreating the enum and rewriting the column,
-- which is risky and unnecessary since unused enum values have zero cost.
