-- Add razorpaySubscriptionId to subscriptions table for recurring billing
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "razorpaySubscriptionId" TEXT;

-- Create unique index on razorpaySubscriptionId
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_razorpaySubscriptionId_key" ON "subscriptions"("razorpaySubscriptionId");
