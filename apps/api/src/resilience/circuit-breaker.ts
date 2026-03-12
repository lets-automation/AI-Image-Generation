import { CIRCUIT_BREAKER } from "@ep/shared";
import { logger } from "../utils/logger.js";

/**
 * Circuit Breaker
 *
 * Prevents cascading failures by tracking provider error rates.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Provider is failing, requests are blocked for a cooldown period
 * - HALF_OPEN: After cooldown, allow a single probe request to test recovery
 *
 * Thresholds (from shared constants):
 * - FAILURE_THRESHOLD: 5 failures within window → open
 * - FAILURE_WINDOW_MS: 60 seconds rolling window
 * - OPEN_DURATION_MS: 30 seconds before trying again
 * - HALF_OPEN_MAX_REQUESTS: 1 probe request allowed
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: number[] = []; // timestamps of recent failures
  private lastOpenedAt = 0;
  private halfOpenAttempts = 0;
  private readonly providerName: string;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  /**
   * Check if a request can be executed.
   */
  canExecute(): boolean {
    this.pruneOldFailures();

    switch (this.state) {
      case "CLOSED":
        return true;

      case "OPEN": {
        // Check if cooldown period has elapsed
        const elapsed = Date.now() - this.lastOpenedAt;
        if (elapsed >= CIRCUIT_BREAKER.OPEN_DURATION_MS) {
          this.state = "HALF_OPEN";
          this.halfOpenAttempts = 0;
          logger.info({ provider: this.providerName }, "Circuit breaker → HALF_OPEN");
          return true;
        }
        return false;
      }

      case "HALF_OPEN":
        // Allow limited probe requests
        return this.halfOpenAttempts < CIRCUIT_BREAKER.HALF_OPEN_MAX_REQUESTS;
    }
  }

  /**
   * Record a successful execution.
   */
  onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      // Probe succeeded — close the circuit
      this.state = "CLOSED";
      this.failures = [];
      this.halfOpenAttempts = 0;
      logger.info({ provider: this.providerName }, "Circuit breaker → CLOSED (recovered)");
    }
  }

  /**
   * Record a failed execution.
   */
  onFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.pruneOldFailures();

    if (this.state === "HALF_OPEN") {
      // Probe failed — re-open
      this.state = "OPEN";
      this.lastOpenedAt = now;
      logger.warn({ provider: this.providerName }, "Circuit breaker → OPEN (probe failed)");
      return;
    }

    if (this.state === "CLOSED" && this.failures.length >= CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
      this.state = "OPEN";
      this.lastOpenedAt = now;
      logger.warn(
        { provider: this.providerName, failures: this.failures.length },
        "Circuit breaker → OPEN (threshold exceeded)"
      );
    }
  }

  /**
   * Record a half-open probe attempt.
   */
  onHalfOpenAttempt(): void {
    this.halfOpenAttempts++;
  }

  /**
   * Get current state.
   */
  getState(): CircuitState {
    this.pruneOldFailures();
    // Re-check if open should transition to half-open
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastOpenedAt;
      if (elapsed >= CIRCUIT_BREAKER.OPEN_DURATION_MS) {
        this.state = "HALF_OPEN";
        this.halfOpenAttempts = 0;
      }
    }
    return this.state;
  }

  /**
   * Get failure count within window.
   */
  getFailureCount(): number {
    this.pruneOldFailures();
    return this.failures.length;
  }

  /**
   * Force reset to CLOSED state (admin override).
   */
  reset(): void {
    this.state = "CLOSED";
    this.failures = [];
    this.halfOpenAttempts = 0;
    this.lastOpenedAt = 0;
  }

  /**
   * Remove failures older than the rolling window.
   */
  private pruneOldFailures(): void {
    const cutoff = Date.now() - CIRCUIT_BREAKER.FAILURE_WINDOW_MS;
    this.failures = this.failures.filter((ts) => ts > cutoff);
  }
}
