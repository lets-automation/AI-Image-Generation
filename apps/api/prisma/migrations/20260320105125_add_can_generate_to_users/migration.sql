-- Add canGenerate column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "canGenerate" BOOLEAN NOT NULL DEFAULT true;
