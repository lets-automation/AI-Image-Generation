-- AlterTable: Make appleProductId nullable on subscription_plans
-- This allows creating web-only plans that use only Razorpay.
ALTER TABLE "subscription_plans" ALTER COLUMN "appleProductId" DROP NOT NULL;
