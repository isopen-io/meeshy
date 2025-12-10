/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by stopping requests to failing services
 * Implements three states: CLOSED, OPEN, HALF_OPEN
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail fast
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 *
 * Use for:
 * - Socket.IO emissions
 * - Redis operations
 * - External API calls
 * - Database operations
 *
 * @module circuit-breaker
 */

import { enhancedLogger } from './logger-enhanced';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  /**
   * Number of failures before opening circuit
   */
  failureThreshold: number;

  /**
   * Time window for counting failures (ms)
   */
  failureWindowMs: number;

  /**
   * Time to wait before attempting recovery (ms)
   */
  resetTimeoutMs: number;

  /**
   * Number of successful requests to close circuit from half-open
   */
  successThreshold: number;

  /**
   * Request timeout (ms)
   */
  timeout?: number;

  /**
   * Name for logging
   */
  name: string;

  /**
   * Fallback function when circuit is open
   */
  fallback?: () => any;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttemptTime?: number;
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      timeout: 5000, // 5 seconds default
      fallback: () => {
        throw new Error(`Circuit breaker "${config.name}" is OPEN`);
      },
      ...config
    };

    enhancedLogger.info(`Circuit breaker initialized: ${this.config.name}`, {
      config: this.config
    });
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        enhancedLogger.warn(`Circuit breaker OPEN, failing fast: ${this.config.name}`);
        return this.config.fallback();
      }
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  private executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${this.config.timeout}ms`)),
          this.config.timeout
        )
      )
    ]);
  }

  /**
   * Handle successful execution
   */
  private onSuccess() {
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else {
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: unknown) {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    enhancedLogger.error(
      `Circuit breaker failure: ${this.config.name}`,
      error instanceof Error ? error : new Error(String(error)),
      {
        failureCount: this.failureCount,
        state: this.state
      }
    );

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionToOpen();
    }
  }

  /**
   * Transition to CLOSED state (normal operation)
   */
  private transitionToClosed() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;

    enhancedLogger.info(`Circuit breaker CLOSED: ${this.config.name}`, {
      state: this.state
    });
  }

  /**
   * Transition to OPEN state (failing fast)
   */
  private transitionToOpen() {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;

    enhancedLogger.warn(`Circuit breaker OPEN: ${this.config.name}`, {
      state: this.state,
      nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
      failureCount: this.failureCount
    });
  }

  /**
   * Transition to HALF_OPEN state (testing recovery)
   */
  private transitionToHalfOpen() {
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;

    enhancedLogger.info(`Circuit breaker HALF_OPEN: ${this.config.name}`, {
      state: this.state
    });
  }

  /**
   * Check if we should attempt to reset the circuit
   */
  private shouldAttemptReset(): boolean {
    return !!this.nextAttemptTime && Date.now() >= this.nextAttemptTime;
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime
    };
  }

  /**
   * Manually reset the circuit breaker (admin use)
   */
  reset() {
    this.transitionToClosed();
    this.totalRequests = 0;

    enhancedLogger.info(`Circuit breaker manually reset: ${this.config.name}`);
  }

  /**
   * Force circuit open (for maintenance)
   */
  forceOpen() {
    this.transitionToOpen();
    enhancedLogger.warn(`Circuit breaker forced OPEN: ${this.config.name}`);
  }
}

/**
 * Factory for creating pre-configured circuit breakers
 */
export class CircuitBreakerFactory {
  /**
   * Circuit breaker for Socket.IO operations
   */
  static createSocketIOBreaker(): CircuitBreaker {
    return new CircuitBreaker({
      name: 'SocketIO',
      failureThreshold: 5,
      failureWindowMs: 60000, // 1 minute
      resetTimeoutMs: 30000, // 30 seconds
      successThreshold: 2,
      timeout: 3000,
      fallback: () => {
        enhancedLogger.warn('Socket.IO circuit breaker OPEN, skipping emission');
        return null;
      }
    });
  }

  /**
   * Circuit breaker for Redis operations
   */
  static createRedisBreaker(): CircuitBreaker {
    return new CircuitBreaker({
      name: 'Redis',
      failureThreshold: 3,
      failureWindowMs: 30000, // 30 seconds
      resetTimeoutMs: 20000, // 20 seconds
      successThreshold: 3,
      timeout: 2000,
      fallback: () => {
        enhancedLogger.warn('Redis circuit breaker OPEN, falling back to in-memory');
        return null;
      }
    });
  }

  /**
   * Circuit breaker for database operations
   */
  static createDatabaseBreaker(): CircuitBreaker {
    return new CircuitBreaker({
      name: 'Database',
      failureThreshold: 5,
      failureWindowMs: 60000, // 1 minute
      resetTimeoutMs: 60000, // 1 minute
      successThreshold: 5,
      timeout: 10000,
      fallback: () => {
        throw new Error('Database is currently unavailable');
      }
    });
  }

  /**
   * Circuit breaker for external API calls
   */
  static createExternalAPIBreaker(apiName: string): CircuitBreaker {
    return new CircuitBreaker({
      name: `ExternalAPI:${apiName}`,
      failureThreshold: 3,
      failureWindowMs: 30000, // 30 seconds
      resetTimeoutMs: 60000, // 1 minute
      successThreshold: 2,
      timeout: 5000,
      fallback: () => {
        throw new Error(`External API ${apiName} is currently unavailable`);
      }
    });
  }

  /**
   * Create custom circuit breaker
   */
  static create(config: CircuitBreakerConfig): CircuitBreaker {
    return new CircuitBreaker(config);
  }
}

/**
 * Global circuit breaker manager
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Register a circuit breaker
   */
  register(name: string, breaker: CircuitBreaker) {
    this.breakers.set(name, breaker);
  }

  /**
   * Get circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return this.breakers;
  }

  /**
   * Get stats for all circuit breakers
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};

    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

/**
 * Global circuit breaker manager instance
 */
export const circuitBreakerManager = new CircuitBreakerManager();
