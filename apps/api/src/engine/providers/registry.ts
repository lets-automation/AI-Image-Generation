import { prisma } from "../../config/database.js";
import { logger } from "../../utils/logger.js";
import type { BaseProvider } from "./base.js";
import { openaiProvider } from "./openai.js";
import { ideogramProvider } from "./ideogram.js";
import { CircuitBreaker } from "../../resilience/circuit-breaker.js";
import type { QualityTier } from "@ep/shared";

/**
 * Provider Registry
 *
 * Maps quality tiers to AI providers via the ModelPricing database table.
 * Integrates circuit breakers to skip unhealthy providers.
 * Falls back through the priority chain when a provider is down.
 *
 * Currently only OpenAI is registered. To add a new provider:
 * 1. Create a class extending BaseProvider in this directory
 * 2. Register it in the PROVIDERS map below
 * 3. Add the API key to .env and config/index.ts
 * 4. Create ModelPricing entries via the admin UI
 */

// Provider instances by name
// Admins add model entries referencing these provider names
const PROVIDERS: Record<string, BaseProvider> = {
  openai: openaiProvider,
  ideogram: ideogramProvider,
};

// Circuit breakers per provider (lazy-initialized)
const circuitBreakers = new Map<string, CircuitBreaker>();

function getCircuitBreaker(providerName: string): CircuitBreaker {
  if (!circuitBreakers.has(providerName)) {
    circuitBreakers.set(providerName, new CircuitBreaker(providerName));
  }
  return circuitBreakers.get(providerName)!;
}

export interface ResolvedProvider {
  provider: BaseProvider;
  modelId: string;
  creditCost: number;
  config: Record<string, unknown>;
  circuitBreaker: CircuitBreaker;
}

/**
 * Get the best available provider for a quality tier.
 *
 * Queries ModelPricing table for active providers, sorted by priority.
 * Skips providers with open circuit breakers.
 * Returns the first healthy, configured provider.
 *
 * @throws Error if no provider is available
 */
export async function getProviderForTier(
  tier: QualityTier
): Promise<ResolvedProvider> {
  // Get all active pricing entries for this tier, ordered by priority
  const pricingEntries = await prisma.modelPricing.findMany({
    where: { qualityTier: tier, isActive: true },
    orderBy: { priority: "asc" },
  });

  if (pricingEntries.length === 0) {
    throw new Error(`No active model pricing configured for tier ${tier}`);
  }

  for (const entry of pricingEntries) {
    const provider = PROVIDERS[entry.providerName];
    if (!provider) {
      logger.warn({ providerName: entry.providerName }, "Unknown provider name in ModelPricing");
      continue;
    }

    if (!provider.isConfigured()) {
      logger.debug({ providerName: entry.providerName }, "Provider not configured, skipping");
      continue;
    }

    const cb = getCircuitBreaker(entry.providerName);
    if (!cb.canExecute()) {
      logger.info(
        { providerName: entry.providerName, state: cb.getState() },
        "Circuit breaker open, skipping provider"
      );
      continue;
    }

    return {
      provider,
      modelId: entry.modelId,
      creditCost: entry.creditCost,
      config: (entry.config ?? {}) as Record<string, unknown>,
      circuitBreaker: cb,
    };
  }

  throw new Error(
    `All providers for tier ${tier} are unavailable (circuit breaker open or not configured)`
  );
}

/**
 * Get all provider health statuses for admin dashboard.
 */
export async function getAllProviderHealth(): Promise<
  Array<{
    name: string;
    displayName: string;
    configured: boolean;
    circuitState: string;
    health: { healthy: boolean; latencyMs: number; message?: string } | null;
  }>
> {
  const results = [];

  for (const [name, provider] of Object.entries(PROVIDERS)) {
    const cb = getCircuitBreaker(name);
    let health = null;

    if (provider.isConfigured()) {
      try {
        health = await provider.healthCheck();
      } catch {
        health = { healthy: false, latencyMs: 0, message: "Health check threw" };
      }
    }

    results.push({
      name,
      displayName: provider.displayName,
      configured: provider.isConfigured(),
      circuitState: cb.getState(),
      health,
    });
  }

  return results;
}

/**
 * Reset a provider's circuit breaker (admin action).
 */
export function resetCircuitBreaker(providerName: string): void {
  const cb = circuitBreakers.get(providerName);
  if (cb) {
    cb.reset();
    logger.info({ providerName }, "Circuit breaker reset by admin");
  }
}

export { PROVIDERS, circuitBreakers };
