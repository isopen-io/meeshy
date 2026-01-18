/**
 * ZMQ Retry Handler with Circuit Breaker
 * Gère les retry et la logique de circuit breaker
 */

import { EventEmitter } from 'events';

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetTimeMs: number;
}

export interface RetryStats {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  circuitBreakerTrips: number;
  currentState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  lastFailureTimestamp: number;
}

interface PendingRequest {
  request: any;
  timestamp: number;
  retryCount: number;
}

export class ZmqRetryHandler extends EventEmitter {
  private config: RetryConfig;
  private pendingRequests: Map<string, PendingRequest> = new Map();

  // Circuit breaker state
  private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private circuitOpenTime: number = 0;

  private stats: RetryStats = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    circuitBreakerTrips: 0,
    currentState: 'CLOSED',
    lastFailureTimestamp: 0
  };

  constructor(config?: Partial<RetryConfig>) {
    super();
    this.config = {
      maxRetries: config?.maxRetries || 3,
      initialDelayMs: config?.initialDelayMs || 1000,
      maxDelayMs: config?.maxDelayMs || 30000,
      backoffMultiplier: config?.backoffMultiplier || 2,
      circuitBreakerThreshold: config?.circuitBreakerThreshold || 5,
      circuitBreakerResetTimeMs: config?.circuitBreakerResetTimeMs || 60000
    };
  }

  /**
   * Register a pending request for tracking
   */
  registerRequest(taskId: string, request: any): void {
    this.pendingRequests.set(taskId, {
      request,
      timestamp: Date.now(),
      retryCount: 0
    });
  }

  /**
   * Mark a request as successfully completed
   */
  markSuccess(taskId: string): void {
    const pending = this.pendingRequests.get(taskId);
    if (pending && pending.retryCount > 0) {
      this.stats.successfulRetries++;
    }
    this.pendingRequests.delete(taskId);

    // Reset circuit breaker on success
    if (this.circuitState === 'HALF_OPEN') {
      this.closeCircuit();
    }
    this.failureCount = 0;
  }

  /**
   * Mark a request as failed and determine retry strategy
   */
  async markFailure(taskId: string, error: string): Promise<boolean> {
    const pending = this.pendingRequests.get(taskId);
    if (!pending) {
      return false;
    }

    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.stats.lastFailureTimestamp = this.lastFailureTime;

    // Check circuit breaker
    if (this.failureCount >= this.config.circuitBreakerThreshold) {
      this.openCircuit();
    }

    // Don't retry if circuit is open
    if (this.circuitState === 'OPEN') {
      this.pendingRequests.delete(taskId);
      this.stats.failedRetries++;
      return false;
    }

    // Check if we should retry
    if (pending.retryCount >= this.config.maxRetries) {
      console.log(`[RetryHandler] Max retries reached for ${taskId}`);
      this.pendingRequests.delete(taskId);
      this.stats.failedRetries++;
      return false;
    }

    // Calculate backoff delay
    const delay = this.calculateBackoffDelay(pending.retryCount);
    pending.retryCount++;
    this.stats.totalRetries++;

    console.log(`[RetryHandler] Scheduling retry ${pending.retryCount}/${this.config.maxRetries} for ${taskId} in ${delay}ms`);

    // Schedule retry
    setTimeout(() => {
      this.emit('retry', {
        taskId,
        request: pending.request,
        retryCount: pending.retryCount
      });
    }, delay);

    return true;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(retryCount: number): number {
    const delay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, retryCount),
      this.config.maxDelayMs
    );
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    if (this.circuitState !== 'OPEN') {
      console.log('[RetryHandler] Circuit breaker OPEN');
      this.circuitState = 'OPEN';
      this.circuitOpenTime = Date.now();
      this.stats.circuitBreakerTrips++;
      this.stats.currentState = 'OPEN';
      this.emit('circuitOpen');

      // Schedule circuit reset
      setTimeout(() => {
        this.halfOpenCircuit();
      }, this.config.circuitBreakerResetTimeMs);
    }
  }

  /**
   * Move circuit to half-open state for testing
   */
  private halfOpenCircuit(): void {
    console.log('[RetryHandler] Circuit breaker HALF_OPEN');
    this.circuitState = 'HALF_OPEN';
    this.stats.currentState = 'HALF_OPEN';
    this.emit('circuitHalfOpen');
  }

  /**
   * Close the circuit breaker
   */
  private closeCircuit(): void {
    console.log('[RetryHandler] Circuit breaker CLOSED');
    this.circuitState = 'CLOSED';
    this.stats.currentState = 'CLOSED';
    this.failureCount = 0;
    this.emit('circuitClosed');
  }

  /**
   * Check if circuit breaker allows request
   */
  canSendRequest(): boolean {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.circuitState === 'OPEN') {
      const timeSinceOpen = Date.now() - this.circuitOpenTime;
      if (timeSinceOpen >= this.config.circuitBreakerResetTimeMs) {
        this.halfOpenCircuit();
      }
    }

    return this.circuitState !== 'OPEN';
  }

  /**
   * Get current circuit breaker state
   */
  getCircuitState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.circuitState;
  }

  /**
   * Get pending requests count
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Get retry statistics
   */
  getStats(): RetryStats {
    return {
      ...this.stats,
      currentState: this.circuitState
    };
  }

  /**
   * Cleanup old pending requests (older than timeout)
   */
  cleanupStaleRequests(timeoutMs: number = 300000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [taskId, pending] of this.pendingRequests.entries()) {
      if (now - pending.timestamp > timeoutMs) {
        this.pendingRequests.delete(taskId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RetryHandler] Cleaned ${cleaned} stale requests`);
    }

    return cleaned;
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.pendingRequests.clear();
    console.log('[RetryHandler] All pending requests cleared');
  }

  /**
   * Reset circuit breaker and stats
   */
  reset(): void {
    this.circuitState = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.circuitOpenTime = 0;
    this.stats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      circuitBreakerTrips: 0,
      currentState: 'CLOSED',
      lastFailureTimestamp: 0
    };
    console.log('[RetryHandler] Reset to initial state');
  }
}
