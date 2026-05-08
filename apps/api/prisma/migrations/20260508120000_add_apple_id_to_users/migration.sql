-- Add appleId column for Sign in with Apple.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "appleId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_appleId_key" ON "users"("appleId");
