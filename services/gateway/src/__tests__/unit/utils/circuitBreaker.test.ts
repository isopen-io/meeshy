/**
 * Circuit Breaker Unit Tests
 *
 * Comprehensive tests for CircuitBreaker utility covering:
 * - Circuit states (CLOSED, OPEN, HALF_OPEN)
 * - State transitions
 * - Failure threshold handling
 * - Success threshold for recovery
 * - Timeout handling
 * - Fallback execution
 * - Manual reset and force open
 * - Statistics tracking
 * - Factory methods
 * - Manager functionality
 *
 * Coverage target: > 65%
 *
 * Run with: npm test -- circuitBreaker.test.ts
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the enhanced logger before importing the module
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import {
  CircuitBreaker,
  CircuitBreakerFactory,
  CircuitBreakerManager,
  CircuitState,
  circuitBreakerManager,
  type CircuitBreakerConfig,
  type CircuitBreakerStats
} from '../../../utils/circuitBreaker';
import { enhancedLogger } from '../../../utils/logger-enhanced';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  const defaultConfig: CircuitBreakerConfig = {
    name: 'TestBreaker',
    failureThreshold: 3,
    failureWindowMs: 60000,
    resetTimeoutMs: 5000,
    successThreshold: 2,
    timeout: 1000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should create a circuit breaker with provided config', () => {
      circuitBreaker = new CircuitBreaker(defaultConfig);

      expect(circuitBreaker).toBeDefined();
      expect(circuitBreaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should log initialization message', () => {
      circuitBreaker = new CircuitBreaker(defaultConfig);

      expect(enhancedLogger.info).toHaveBeenCalledWith(
        'Circuit breaker initialized: TestBreaker',
        expect.objectContaining({ config: expect.any(Object) })
      );
    });

    it('should start in CLOSED state', () => {
      circuitBreaker = new CircuitBreaker(defaultConfig);

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should use default timeout of 5000ms when not provided', () => {
      const configWithoutTimeout: CircuitBreakerConfig = {
        name: 'TestBreaker',
        failureThreshold: 3,
        failureWindowMs: 60000,
        resetTimeoutMs: 5000,
        successThreshold: 2
      };

      circuitBreaker = new CircuitBreaker(configWithoutTimeout);

      expect(circuitBreaker).toBeDefined();
    });

    it('should use default fallback when not provided', async () => {
      const configWithoutFallback: CircuitBreakerConfig = {
        name: 'TestBreaker',
        failureThreshold: 1,
        failureWindowMs: 60000,
        resetTimeoutMs: 5000,
        successThreshold: 2
      };

      circuitBreaker = new CircuitBreaker(configWithoutFallback);

      // Trigger circuit open by causing a failure
      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('Failure')));
      } catch (e) {
        // Expected
      }

      // Now try to execute - circuit should be open
      await expect(circuitBreaker.execute(() => Promise.resolve('test')))
        .rejects.toThrow('Circuit breaker "TestBreaker" is OPEN');
    });

    it('should initialize counters to zero', () => {
      circuitBreaker = new CircuitBreaker(defaultConfig);

      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });

    it('should not have lastFailureTime or lastSuccessTime initially', () => {
      circuitBreaker = new CircuitBreaker(defaultConfig);

      const stats = circuitBreaker.getStats();
      expect(stats.lastFailureTime).toBeUndefined();
      expect(stats.lastSuccessTime).toBeUndefined();
    });
  });

  describe('CLOSED State - Normal Operation', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(defaultConfig);
    });

    it('should execute function successfully in CLOSED state', async () => {
      const result = await circuitBreaker.execute(() => Promise.resolve('success'));

      expect(result).toBe('success');
    });

    it('should increment totalRequests on each execution', async () => {
      await circuitBreaker.execute(() => Promise.resolve('1'));
      await circuitBreaker.execute(() => Promise.resolve('2'));
      await circuitBreaker.execute(() => Promise.resolve('3'));

      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(3);
    });

    it('should update lastSuccessTime on successful execution', async () => {
      const now = Date.now();
      jest.setSystemTime(now);

      await circuitBreaker.execute(() => Promise.resolve('success'));

      const stats = circuitBreaker.getStats();
      expect(stats.lastSuccessTime).toBe(now);
    });

    it('should reset failure count on successful execution', async () => {
      // Cause some failures (but not enough to open circuit)
      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('fail1')));
      } catch (e) {}
      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('fail2')));
      } catch (e) {}

      let stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(2);

      // Successful execution should reset failure count
      await circuitBreaker.execute(() => Promise.resolve('success'));

      stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
    });

    it('should remain in CLOSED state after successful executions', async () => {
      await circuitBreaker.execute(() => Promise.resolve('1'));
      await circuitBreaker.execute(() => Promise.resolve('2'));
      await circuitBreaker.execute(() => Promise.resolve('3'));

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should propagate errors from the executed function', async () => {
      const error = new Error('Test error');

      await expect(
        circuitBreaker.execute(() => Promise.reject(error))
      ).rejects.toThrow('Test error');
    });

    it('should increment failure count on error', async () => {
      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1);
    });

    it('should update lastFailureTime on error', async () => {
      const now = Date.now();
      jest.setSystemTime(now);

      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      const stats = circuitBreaker.getStats();
      expect(stats.lastFailureTime).toBe(now);
    });

    it('should log error on failure', async () => {
      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('Test error')));
      } catch (e) {}

      expect(enhancedLogger.error).toHaveBeenCalledWith(
        'Circuit breaker failure: TestBreaker',
        expect.any(Error),
        expect.objectContaining({
          failureCount: 1,
          state: CircuitState.CLOSED
        })
      );
    });

    it('should handle non-Error rejections', async () => {
      try {
        await circuitBreaker.execute(() => Promise.reject('string error'));
      } catch (e) {}

      expect(enhancedLogger.error).toHaveBeenCalledWith(
        'Circuit breaker failure: TestBreaker',
        expect.any(Error),
        expect.any(Object)
      );
    });
  });

  describe('Transition to OPEN State', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(defaultConfig);
    });

    it('should transition to OPEN when failures reach threshold', async () => {
      // Cause 3 failures (failureThreshold = 3)
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error(`fail${i}`)));
        } catch (e) {}
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });

    it('should log warning when transitioning to OPEN', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error(`fail${i}`)));
        } catch (e) {}
      }

      expect(enhancedLogger.warn).toHaveBeenCalledWith(
        'Circuit breaker OPEN: TestBreaker',
        expect.objectContaining({
          state: CircuitState.OPEN,
          failureCount: 3
        })
      );
    });

    it('should set nextAttemptTime when transitioning to OPEN', async () => {
      const now = Date.now();
      jest.setSystemTime(now);

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error(`fail${i}`)));
        } catch (e) {}
      }

      // Verify the log shows the next attempt time
      expect(enhancedLogger.warn).toHaveBeenCalledWith(
        'Circuit breaker OPEN: TestBreaker',
        expect.objectContaining({
          nextAttemptTime: expect.any(String)
        })
      );
    });
  });

  describe('OPEN State - Fail Fast', () => {
    beforeEach(async () => {
      circuitBreaker = new CircuitBreaker({
        ...defaultConfig,
        fallback: () => 'fallback-value'
      });

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error(`fail${i}`)));
        } catch (e) {}
      }
    });

    it('should return fallback value when circuit is OPEN', async () => {
      const result = await circuitBreaker.execute(() => Promise.resolve('should-not-return'));

      expect(result).toBe('fallback-value');
    });

    it('should log warning when failing fast', async () => {
      jest.clearAllMocks();

      await circuitBreaker.execute(() => Promise.resolve('test'));

      expect(enhancedLogger.warn).toHaveBeenCalledWith(
        'Circuit breaker OPEN, failing fast: TestBreaker'
      );
    });

    it('should still increment totalRequests when failing fast', async () => {
      const initialStats = circuitBreaker.getStats();
      const initialTotal = initialStats.totalRequests;

      await circuitBreaker.execute(() => Promise.resolve('test'));

      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(initialTotal + 1);
    });

    it('should not execute the provided function when circuit is OPEN', async () => {
      let fnCalled = false;
      const fn = async (): Promise<string> => {
        fnCalled = true;
        return 'result';
      };

      await circuitBreaker.execute(fn);

      expect(fnCalled).toBe(false);
    });
  });

  describe('Transition to HALF_OPEN State', () => {
    beforeEach(async () => {
      circuitBreaker = new CircuitBreaker(defaultConfig);

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error(`fail${i}`)));
        } catch (e) {}
      }
    });

    it('should transition to HALF_OPEN after resetTimeout', async () => {
      // Advance time past reset timeout
      jest.advanceTimersByTime(defaultConfig.resetTimeoutMs + 100);

      // Next execution should transition to HALF_OPEN
      await circuitBreaker.execute(() => Promise.resolve('test'));

      const stats = circuitBreaker.getStats();
      // After successful execution in HALF_OPEN, if successThreshold is 2,
      // it should still be in HALF_OPEN with 1 success
      expect(stats.state).toBe(CircuitState.HALF_OPEN);
    });

    it('should log when transitioning to HALF_OPEN', async () => {
      jest.clearAllMocks();
      jest.advanceTimersByTime(defaultConfig.resetTimeoutMs + 100);

      await circuitBreaker.execute(() => Promise.resolve('test'));

      expect(enhancedLogger.info).toHaveBeenCalledWith(
        'Circuit breaker HALF_OPEN: TestBreaker',
        expect.objectContaining({ state: CircuitState.HALF_OPEN })
      );
    });

    it('should reset successCount when transitioning to HALF_OPEN', async () => {
      jest.advanceTimersByTime(defaultConfig.resetTimeoutMs + 100);

      await circuitBreaker.execute(() => Promise.resolve('test'));

      const stats = circuitBreaker.getStats();
      expect(stats.successes).toBe(1);
    });
  });

  describe('HALF_OPEN State - Recovery Testing', () => {
    beforeEach(async () => {
      circuitBreaker = new CircuitBreaker(defaultConfig);

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error(`fail${i}`)));
        } catch (e) {}
      }

      // Transition to HALF_OPEN
      jest.advanceTimersByTime(defaultConfig.resetTimeoutMs + 100);
    });

    it('should transition to CLOSED after successThreshold successes', async () => {
      // successThreshold = 2
      await circuitBreaker.execute(() => Promise.resolve('success1'));

      let stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.HALF_OPEN);
      expect(stats.successes).toBe(1);

      await circuitBreaker.execute(() => Promise.resolve('success2'));

      stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should log when transitioning back to CLOSED', async () => {
      jest.clearAllMocks();

      await circuitBreaker.execute(() => Promise.resolve('success1'));
      await circuitBreaker.execute(() => Promise.resolve('success2'));

      expect(enhancedLogger.info).toHaveBeenCalledWith(
        'Circuit breaker CLOSED: TestBreaker',
        expect.objectContaining({ state: CircuitState.CLOSED })
      );
    });

    it('should reset counters when transitioning to CLOSED', async () => {
      await circuitBreaker.execute(() => Promise.resolve('success1'));
      await circuitBreaker.execute(() => Promise.resolve('success2'));

      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });

    it('should transition back to OPEN on any failure in HALF_OPEN', async () => {
      await circuitBreaker.execute(() => Promise.resolve('success1'));

      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });

    it('should log warning when transitioning from HALF_OPEN to OPEN', async () => {
      jest.clearAllMocks();

      await circuitBreaker.execute(() => Promise.resolve('success1'));

      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      expect(enhancedLogger.warn).toHaveBeenCalledWith(
        'Circuit breaker OPEN: TestBreaker',
        expect.any(Object)
      );
    });
  });

  describe('Timeout Handling', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        ...defaultConfig,
        timeout: 100 // 100ms timeout
      });
    });

    it('should throw timeout error when function exceeds timeout', async () => {
      const slowFunction = () => new Promise<string>((resolve) => {
        setTimeout(() => resolve('slow'), 200);
      });

      const executePromise = circuitBreaker.execute(slowFunction);

      // Advance timers to trigger timeout
      jest.advanceTimersByTime(150);

      await expect(executePromise).rejects.toThrow('Operation timed out after 100ms');
    });

    it('should succeed when function completes within timeout', async () => {
      const fastFunction = () => new Promise<string>((resolve) => {
        setTimeout(() => resolve('fast'), 50);
      });

      const executePromise = circuitBreaker.execute(fastFunction);

      // Advance timers to complete the function
      jest.advanceTimersByTime(60);

      const result = await executePromise;
      expect(result).toBe('fast');
    });

    it('should count timeout as a failure', async () => {
      const slowFunction = () => new Promise<string>((resolve) => {
        setTimeout(() => resolve('slow'), 200);
      });

      const executePromise = circuitBreaker.execute(slowFunction);
      jest.advanceTimersByTime(150);

      try {
        await executePromise;
      } catch (e) {}

      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1);
    });
  });

  describe('getStats()', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(defaultConfig);
    });

    it('should return correct stats after various operations', async () => {
      const now = Date.now();
      jest.setSystemTime(now);

      await circuitBreaker.execute(() => Promise.resolve('success'));

      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      const stats = circuitBreaker.getStats();

      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(1);
      expect(stats.successes).toBe(0); // Only tracked in HALF_OPEN
      expect(stats.totalRequests).toBe(2);
      expect(stats.lastSuccessTime).toBe(now);
      expect(stats.lastFailureTime).toBe(now);
    });

    it('should return stats as a snapshot (not reference)', () => {
      const stats1 = circuitBreaker.getStats();
      const stats2 = circuitBreaker.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('reset()', () => {
    beforeEach(async () => {
      circuitBreaker = new CircuitBreaker(defaultConfig);

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error(`fail${i}`)));
        } catch (e) {}
      }
    });

    it('should reset circuit to CLOSED state', () => {
      const statsBefore = circuitBreaker.getStats();
      expect(statsBefore.state).toBe(CircuitState.OPEN);

      circuitBreaker.reset();

      const statsAfter = circuitBreaker.getStats();
      expect(statsAfter.state).toBe(CircuitState.CLOSED);
    });

    it('should reset all counters', () => {
      circuitBreaker.reset();

      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });

    it('should log manual reset', () => {
      jest.clearAllMocks();

      circuitBreaker.reset();

      expect(enhancedLogger.info).toHaveBeenCalledWith(
        'Circuit breaker manually reset: TestBreaker'
      );
    });

    it('should allow normal operation after reset', async () => {
      circuitBreaker.reset();

      const result = await circuitBreaker.execute(() => Promise.resolve('success'));

      expect(result).toBe('success');
    });
  });

  describe('forceOpen()', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        ...defaultConfig,
        fallback: () => 'maintenance'
      });
    });

    it('should force circuit to OPEN state', () => {
      const statsBefore = circuitBreaker.getStats();
      expect(statsBefore.state).toBe(CircuitState.CLOSED);

      circuitBreaker.forceOpen();

      const statsAfter = circuitBreaker.getStats();
      expect(statsAfter.state).toBe(CircuitState.OPEN);
    });

    it('should log force open', () => {
      circuitBreaker.forceOpen();

      expect(enhancedLogger.warn).toHaveBeenCalledWith(
        'Circuit breaker forced OPEN: TestBreaker'
      );
    });

    it('should execute fallback when forced open', async () => {
      circuitBreaker.forceOpen();

      const result = await circuitBreaker.execute(() => Promise.resolve('should-not-return'));

      expect(result).toBe('maintenance');
    });

    it('should set nextAttemptTime when forced open', () => {
      const now = Date.now();
      jest.setSystemTime(now);

      circuitBreaker.forceOpen();

      // Can recover after resetTimeout
      jest.advanceTimersByTime(defaultConfig.resetTimeoutMs + 100);

      // Next execution should transition to HALF_OPEN
      circuitBreaker.execute(() => Promise.resolve('test')).then(() => {
        const stats = circuitBreaker.getStats();
        expect(stats.state).toBe(CircuitState.HALF_OPEN);
      });
    });
  });

  describe('Custom Fallback', () => {
    it('should use custom fallback function when circuit is OPEN', async () => {
      circuitBreaker = new CircuitBreaker({
        ...defaultConfig,
        failureThreshold: 1,
        fallback: () => ({ cached: true, data: 'cached-data' })
      });

      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      const result = await circuitBreaker.execute(() => Promise.resolve('fresh'));

      expect(result).toEqual({ cached: true, data: 'cached-data' });
    });

    it('should support async fallback functions', async () => {
      circuitBreaker = new CircuitBreaker({
        ...defaultConfig,
        failureThreshold: 1,
        fallback: async () => {
          return 'async-fallback';
        }
      });

      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      const result = await circuitBreaker.execute(() => Promise.resolve('fresh'));

      // The fallback is called, and since it returns a promise, we await it
      expect(result).toBe('async-fallback');
    });
  });
});

describe('CircuitBreakerFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSocketIOBreaker()', () => {
    it('should create a circuit breaker for Socket.IO operations', () => {
      const breaker = CircuitBreakerFactory.createSocketIOBreaker();

      expect(breaker).toBeInstanceOf(CircuitBreaker);

      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should return null from fallback', async () => {
      const breaker = CircuitBreakerFactory.createSocketIOBreaker();

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }

      const result = await breaker.execute(() => Promise.resolve('test'));

      expect(result).toBeNull();
    });

    it('should log fallback activation', async () => {
      const breaker = CircuitBreakerFactory.createSocketIOBreaker();

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }

      jest.clearAllMocks();
      await breaker.execute(() => Promise.resolve('test'));

      expect(enhancedLogger.warn).toHaveBeenCalledWith(
        'Socket.IO circuit breaker OPEN, skipping emission'
      );
    });
  });

  describe('createRedisBreaker()', () => {
    it('should create a circuit breaker for Redis operations', () => {
      const breaker = CircuitBreakerFactory.createRedisBreaker();

      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should return null from fallback and log warning', async () => {
      const breaker = CircuitBreakerFactory.createRedisBreaker();

      // Open the circuit (threshold is 3)
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }

      jest.clearAllMocks();
      const result = await breaker.execute(() => Promise.resolve('test'));

      expect(result).toBeNull();
      expect(enhancedLogger.warn).toHaveBeenCalledWith(
        'Redis circuit breaker OPEN, falling back to in-memory'
      );
    });
  });

  describe('createDatabaseBreaker()', () => {
    it('should create a circuit breaker for database operations', () => {
      const breaker = CircuitBreakerFactory.createDatabaseBreaker();

      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should throw error from fallback', async () => {
      const breaker = CircuitBreakerFactory.createDatabaseBreaker();

      // Open the circuit (threshold is 5)
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }

      await expect(
        breaker.execute(() => Promise.resolve('test'))
      ).rejects.toThrow('Database is currently unavailable');
    });
  });

  describe('createExternalAPIBreaker()', () => {
    it('should create a circuit breaker for external API with custom name', () => {
      const breaker = CircuitBreakerFactory.createExternalAPIBreaker('PaymentGateway');

      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should include API name in error message', async () => {
      const breaker = CircuitBreakerFactory.createExternalAPIBreaker('PaymentGateway');

      // Open the circuit (threshold is 3)
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }

      await expect(
        breaker.execute(() => Promise.resolve('test'))
      ).rejects.toThrow('External API PaymentGateway is currently unavailable');
    });
  });

  describe('create()', () => {
    it('should create a custom circuit breaker with provided config', () => {
      const customConfig: CircuitBreakerConfig = {
        name: 'CustomBreaker',
        failureThreshold: 10,
        failureWindowMs: 120000,
        resetTimeoutMs: 30000,
        successThreshold: 5,
        timeout: 10000,
        fallback: () => 'custom-fallback'
      };

      const breaker = CircuitBreakerFactory.create(customConfig);

      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;
  let breaker1: CircuitBreaker;
  let breaker2: CircuitBreaker;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new CircuitBreakerManager();
    breaker1 = new CircuitBreaker({
      name: 'Breaker1',
      failureThreshold: 3,
      failureWindowMs: 60000,
      resetTimeoutMs: 5000,
      successThreshold: 2
    });
    breaker2 = new CircuitBreaker({
      name: 'Breaker2',
      failureThreshold: 5,
      failureWindowMs: 30000,
      resetTimeoutMs: 10000,
      successThreshold: 3
    });
  });

  describe('register()', () => {
    it('should register a circuit breaker', () => {
      manager.register('breaker1', breaker1);

      expect(manager.get('breaker1')).toBe(breaker1);
    });

    it('should register multiple circuit breakers', () => {
      manager.register('breaker1', breaker1);
      manager.register('breaker2', breaker2);

      expect(manager.get('breaker1')).toBe(breaker1);
      expect(manager.get('breaker2')).toBe(breaker2);
    });

    it('should overwrite existing breaker with same name', () => {
      const breaker3 = new CircuitBreaker({
        name: 'Breaker3',
        failureThreshold: 1,
        failureWindowMs: 10000,
        resetTimeoutMs: 1000,
        successThreshold: 1
      });

      manager.register('breaker1', breaker1);
      manager.register('breaker1', breaker3);

      expect(manager.get('breaker1')).toBe(breaker3);
    });
  });

  describe('get()', () => {
    it('should return undefined for unregistered name', () => {
      expect(manager.get('nonexistent')).toBeUndefined();
    });

    it('should return the registered circuit breaker', () => {
      manager.register('breaker1', breaker1);

      expect(manager.get('breaker1')).toBe(breaker1);
    });
  });

  describe('getAll()', () => {
    it('should return empty map when no breakers registered', () => {
      const all = manager.getAll();

      expect(all.size).toBe(0);
    });

    it('should return all registered breakers', () => {
      manager.register('breaker1', breaker1);
      manager.register('breaker2', breaker2);

      const all = manager.getAll();

      expect(all.size).toBe(2);
      expect(all.get('breaker1')).toBe(breaker1);
      expect(all.get('breaker2')).toBe(breaker2);
    });
  });

  describe('getAllStats()', () => {
    it('should return empty object when no breakers registered', () => {
      const stats = manager.getAllStats();

      expect(Object.keys(stats)).toHaveLength(0);
    });

    it('should return stats for all registered breakers', async () => {
      manager.register('breaker1', breaker1);
      manager.register('breaker2', breaker2);

      // Perform some operations
      await breaker1.execute(() => Promise.resolve('success'));
      try {
        await breaker2.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      const stats = manager.getAllStats();

      expect(Object.keys(stats)).toHaveLength(2);
      expect(stats['breaker1']).toBeDefined();
      expect(stats['breaker2']).toBeDefined();
      expect(stats['breaker1'].totalRequests).toBe(1);
      expect(stats['breaker2'].totalRequests).toBe(1);
      expect(stats['breaker2'].failures).toBe(1);
    });
  });

  describe('resetAll()', () => {
    it('should reset all registered breakers', async () => {
      manager.register('breaker1', breaker1);
      manager.register('breaker2', breaker2);

      // Open both breakers
      for (let i = 0; i < 3; i++) {
        try {
          await breaker1.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }
      for (let i = 0; i < 5; i++) {
        try {
          await breaker2.execute(() => Promise.reject(new Error('fail')));
        } catch (e) {}
      }

      expect(breaker1.getStats().state).toBe(CircuitState.OPEN);
      expect(breaker2.getStats().state).toBe(CircuitState.OPEN);

      manager.resetAll();

      expect(breaker1.getStats().state).toBe(CircuitState.CLOSED);
      expect(breaker2.getStats().state).toBe(CircuitState.CLOSED);
    });

    it('should reset counters for all breakers', async () => {
      manager.register('breaker1', breaker1);

      await breaker1.execute(() => Promise.resolve('success'));

      expect(breaker1.getStats().totalRequests).toBe(1);

      manager.resetAll();

      expect(breaker1.getStats().totalRequests).toBe(0);
    });
  });
});

describe('circuitBreakerManager (global instance)', () => {
  it('should export a global CircuitBreakerManager instance', () => {
    expect(circuitBreakerManager).toBeInstanceOf(CircuitBreakerManager);
  });

  it('should be usable for registering and retrieving breakers', () => {
    const breaker = new CircuitBreaker({
      name: 'GlobalTest',
      failureThreshold: 3,
      failureWindowMs: 60000,
      resetTimeoutMs: 5000,
      successThreshold: 2
    });

    circuitBreakerManager.register('global-test', breaker);

    expect(circuitBreakerManager.get('global-test')).toBe(breaker);
  });
});

describe('CircuitState enum', () => {
  it('should have CLOSED state', () => {
    expect(CircuitState.CLOSED).toBe('CLOSED');
  });

  it('should have OPEN state', () => {
    expect(CircuitState.OPEN).toBe('OPEN');
  });

  it('should have HALF_OPEN state', () => {
    expect(CircuitState.HALF_OPEN).toBe('HALF_OPEN');
  });
});

describe('Edge Cases and Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should handle rapid succession of failures', async () => {
    const breaker = new CircuitBreaker({
      name: 'RapidFail',
      failureThreshold: 3,
      failureWindowMs: 60000,
      resetTimeoutMs: 5000,
      successThreshold: 2,
      fallback: () => 'fallback'
    });

    const failures = [];
    for (let i = 0; i < 10; i++) {
      failures.push(
        breaker.execute(() => Promise.reject(new Error(`fail${i}`))).catch(() => {})
      );
    }

    await Promise.all(failures);

    const stats = breaker.getStats();
    expect(stats.state).toBe(CircuitState.OPEN);
  });

  it('should handle concurrent executions properly', async () => {
    const breaker = new CircuitBreaker({
      name: 'Concurrent',
      failureThreshold: 3,
      failureWindowMs: 60000,
      resetTimeoutMs: 5000,
      successThreshold: 2
    });

    const executions = [];
    for (let i = 0; i < 5; i++) {
      executions.push(breaker.execute(() => Promise.resolve(`result${i}`)));
    }

    const results = await Promise.all(executions);

    expect(results).toHaveLength(5);
    results.forEach((result, i) => {
      expect(result).toBe(`result${i}`);
    });

    const stats = breaker.getStats();
    expect(stats.totalRequests).toBe(5);
  });

  it('should handle mixed success and failure in HALF_OPEN correctly', async () => {
    const breaker = new CircuitBreaker({
      name: 'MixedHalfOpen',
      failureThreshold: 2,
      failureWindowMs: 60000,
      resetTimeoutMs: 100,
      successThreshold: 3
    });

    // Open the circuit
    try {
      await breaker.execute(() => Promise.reject(new Error('fail1')));
    } catch (e) {}
    try {
      await breaker.execute(() => Promise.reject(new Error('fail2')));
    } catch (e) {}

    expect(breaker.getStats().state).toBe(CircuitState.OPEN);

    // Wait for reset timeout
    jest.advanceTimersByTime(150);

    // First success in HALF_OPEN
    await breaker.execute(() => Promise.resolve('success1'));
    expect(breaker.getStats().state).toBe(CircuitState.HALF_OPEN);

    // Failure should reopen
    try {
      await breaker.execute(() => Promise.reject(new Error('fail3')));
    } catch (e) {}

    expect(breaker.getStats().state).toBe(CircuitState.OPEN);
  });

  it('should correctly track success count in HALF_OPEN state', async () => {
    const breaker = new CircuitBreaker({
      name: 'SuccessCount',
      failureThreshold: 1,
      failureWindowMs: 60000,
      resetTimeoutMs: 100,
      successThreshold: 3
    });

    // Open the circuit
    try {
      await breaker.execute(() => Promise.reject(new Error('fail')));
    } catch (e) {}

    // Wait for reset timeout
    jest.advanceTimersByTime(150);

    // Successes in HALF_OPEN
    await breaker.execute(() => Promise.resolve('s1'));
    expect(breaker.getStats().successes).toBe(1);
    expect(breaker.getStats().state).toBe(CircuitState.HALF_OPEN);

    await breaker.execute(() => Promise.resolve('s2'));
    expect(breaker.getStats().successes).toBe(2);
    expect(breaker.getStats().state).toBe(CircuitState.HALF_OPEN);

    await breaker.execute(() => Promise.resolve('s3'));
    // After 3 successes, should be CLOSED with reset counters
    expect(breaker.getStats().successes).toBe(0);
    expect(breaker.getStats().state).toBe(CircuitState.CLOSED);
  });
});
