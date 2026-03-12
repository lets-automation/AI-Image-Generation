-- Safe: convert language from enum to text (preserves existing data)
ALTER TABLE "generations" ALTER COLUMN "language" TYPE TEXT USING "language"::text;

-- Razorpay columns on subscription_plans
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "razorpayPlanId" TEXT;

-- Razorpay columns on subscriptions
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "razorpayOrderId" TEXT,
ADD COLUMN IF NOT EXISTS "razorpayPaymentId" TEXT,
ADD COLUMN IF NOT EXISTS "razorpaySignature" TEXT;

-- SystemLanguage table
CREATE TABLE IF NOT EXISTS "system_languages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "nativeLabel" TEXT NOT NULL,
    "script" TEXT NOT NULL DEFAULT 'Latin',
    "fontFamily" TEXT NOT NULL DEFAULT 'Noto Sans',
    "direction" TEXT NOT NULL DEFAULT 'ltr',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "system_languages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "system_languages_code_key" ON "system_languages"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_razorpayPlanId_key" ON "subscription_plans"("razorpayPlanId");

-- Seed default languages
INSERT INTO "system_languages" ("id", "code", "label", "nativeLabel", "script", "fontFamily", "direction", "isActive", "sortOrder", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'ENGLISH', 'English', 'English', 'Latin', 'Noto Sans', 'ltr', true, 0, NOW()),
  (gen_random_uuid()::text, 'HINDI', 'Hindi', 'हिन्दी', 'Devanagari', 'Noto Sans Devanagari', 'ltr', true, 1, NOW()),
  (gen_random_uuid()::text, 'SPANISH', 'Spanish', 'Español', 'Latin', 'Noto Sans', 'ltr', true, 2, NOW()),
  (gen_random_uuid()::text, 'FRENCH', 'French', 'Français', 'Latin', 'Noto Sans', 'ltr', true, 3, NOW()),
  (gen_random_uuid()::text, 'ARABIC', 'Arabic', 'العربية', 'Arabic', 'Noto Sans Arabic', 'rtl', true, 4, NOW()),
  (gen_random_uuid()::text, 'JAPANESE', 'Japanese', '日本語', 'CJK', 'Noto Sans JP', 'ltr', true, 5, NOW()),
  (gen_random_uuid()::text, 'CHINESE', 'Chinese', '中文', 'CJK', 'Noto Sans SC', 'ltr', true, 6, NOW()),
  (gen_random_uuid()::text, 'KOREAN', 'Korean', '한국어', 'Hangul', 'Noto Sans KR', 'ltr', true, 7, NOW()),
  (gen_random_uuid()::text, 'PORTUGUESE', 'Portuguese', 'Português', 'Latin', 'Noto Sans', 'ltr', true, 8, NOW()),
  (gen_random_uuid()::text, 'GERMAN', 'German', 'Deutsch', 'Latin', 'Noto Sans', 'ltr', true, 9, NOW())
ON CONFLICT ("code") DO NOTHING;

-- Drop old Language enum (no longer referenced)
DROP TYPE IF EXISTS "Language";
