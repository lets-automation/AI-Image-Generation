-- Migration: Remove old monetization (Wallet/Transaction/CoinPlan) and add Apple Subscription system

-- ─── DROP OLD MONETIZATION ────────────────────────────────

-- Drop foreign keys first
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_walletId_fkey";
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_userId_fkey";

-- Drop old tables
DROP TABLE IF EXISTS "transactions";
DROP TABLE IF EXISTS "wallets";
DROP TABLE IF EXISTS "coin_plans";

-- Drop old enums
DROP TYPE IF EXISTS "TransactionType";
DROP TYPE IF EXISTS "TransactionStatus";

-- ─── RENAME coinCost → creditCost ─────────────────────────

ALTER TABLE "generations" RENAME COLUMN "coinCost" TO "creditCost";
ALTER TABLE "model_pricing" RENAME COLUMN "coinCost" TO "creditCost";

-- ─── ADD generationHash COLUMN ────────────────────────────

ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "generationHash" TEXT;
CREATE INDEX IF NOT EXISTS "generations_generationHash_idx" ON "generations"("generationHash");

-- ─── CREATE SUBSCRIPTION ENUMS ────────────────────────────

CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'BILLING_RETRY', 'GRACE_PERIOD', 'REVOKED', 'CANCELLED');
CREATE TYPE "SubscriptionEventType" AS ENUM ('INITIAL_BUY', 'RENEWAL', 'CANCEL', 'REFUND', 'GRACE_PERIOD_START', 'BILLING_RETRY_START', 'EXPIRE', 'REVOKE', 'UPGRADE', 'DOWNGRADE');
CREATE TYPE "SubscriptionProvider" AS ENUM ('APPLE', 'GOOGLE');

-- ─── CREATE SUBSCRIPTION TABLES ───────────────────────────

CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appleProductId" TEXT NOT NULL,
    "googleProductId" TEXT,
    "weeklyCredits" INTEGER NOT NULL,
    "tierAccess" "QualityTier"[],
    "priceInr" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "provider" "SubscriptionProvider" NOT NULL DEFAULT 'APPLE',
    "originalTransactionId" TEXT NOT NULL,
    "latestTransactionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "autoRenewEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRenewalDate" TIMESTAMP(3),
    "nextExpectedRenewalDate" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "pendingPlanId" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'Production',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "notificationId" TEXT,
    "eventType" "SubscriptionEventType" NOT NULL,
    "transactionId" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_balances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "weeklyCredits" INTEGER NOT NULL,
    "usedCredits" INTEGER NOT NULL DEFAULT 0,
    "remainingCredits" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_balances_pkey" PRIMARY KEY ("id")
);

-- ─── UNIQUE INDEXES ───────────────────────────────────────

CREATE UNIQUE INDEX "subscription_plans_appleProductId_key" ON "subscription_plans"("appleProductId");
CREATE UNIQUE INDEX "subscription_plans_googleProductId_key" ON "subscription_plans"("googleProductId");
CREATE UNIQUE INDEX "subscriptions_originalTransactionId_key" ON "subscriptions"("originalTransactionId");
CREATE UNIQUE INDEX "subscription_events_notificationId_key" ON "subscription_events"("notificationId");

-- ─── INDEXES ──────────────────────────────────────────────

CREATE INDEX "subscriptions_userId_idx" ON "subscriptions"("userId");
CREATE INDEX "subscriptions_originalTransactionId_idx" ON "subscriptions"("originalTransactionId");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

CREATE INDEX "subscription_events_subscriptionId_idx" ON "subscription_events"("subscriptionId");
CREATE INDEX "subscription_events_notificationId_idx" ON "subscription_events"("notificationId");

CREATE INDEX "subscription_balances_userId_isClosed_idx" ON "subscription_balances"("userId", "isClosed");
CREATE INDEX "subscription_balances_subscriptionId_idx" ON "subscription_balances"("subscriptionId");
CREATE INDEX "subscription_balances_periodEnd_idx" ON "subscription_balances"("periodEnd");

-- ─── FOREIGN KEYS ─────────────────────────────────────────

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscription_balances" ADD CONSTRAINT "subscription_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_balances" ADD CONSTRAINT "subscription_balances_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
