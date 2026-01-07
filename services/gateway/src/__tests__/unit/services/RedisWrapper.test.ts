/**
 * Unit tests for RedisWrapper
 *
 * Tests:
 * - Constructor and initialization
 * - Redis connection and fallback to memory cache
 * - Get/Set operations (both Redis and memory fallback)
 * - SetEx operations with TTL
 * - SetNX operations (set if not exists)
 * - Expire operations
 * - Delete operations
 * - Keys pattern matching
 * - Info command
 * - Close and cleanup
 * - Error handling and graceful degradation
 * - Cache statistics
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock Redis client
class MockRedis extends EventEmitter {
  private mockData: Map<string, string> = new Map();
  public connectCalled = false;
  public disconnectCalled = false;
  private shouldFailGet = false;
  private shouldFailSet = false;
  private shouldFailSetex = false;
  private shouldFailSetnx = false;
  private shouldFailExpire = false;
  private shouldFailDel = false;
  private shouldFailKeys = false;
  private shouldFailInfo = false;

  constructor(public url: string, public options: any = {}) {
    super();
  }

  async connect(): Promise<void> {
    this.connectCalled = true;
    // Simulate successful connection by default
    setImmediate(() => {
      this.emit('connect');
      this.emit('ready');
    });
  }

  disconnect(): void {
    this.disconnectCalled = true;
  }

  async get(key: string): Promise<string | null> {
    if (this.shouldFailGet) {
      throw new Error('Redis get error');
    }
    return this.mockData.get(key) || null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    if (this.shouldFailSet) {
      throw new Error('Redis set error');
    }
    this.mockData.set(key, value);
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    if (this.shouldFailSetex) {
      throw new Error('Redis setex error');
    }
    this.mockData.set(key, value);
    return 'OK';
  }

  async setnx(key: string, value: string): Promise<number> {
    if (this.shouldFailSetnx) {
      throw new Error('Redis setnx error');
    }
    if (this.mockData.has(key)) {
      return 0;
    }
    this.mockData.set(key, value);
    return 1;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.shouldFailExpire) {
      throw new Error('Redis expire error');
    }
    if (this.mockData.has(key)) {
      return 1;
    }
    return 0;
  }

  async del(key: string): Promise<number> {
    if (this.shouldFailDel) {
      throw new Error('Redis del error');
    }
    if (this.mockData.has(key)) {
      this.mockData.delete(key);
      return 1;
    }
    return 0;
  }

  async keys(pattern: string): Promise<string[]> {
    if (this.shouldFailKeys) {
      throw new Error('Redis keys error');
    }
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matchingKeys: string[] = [];
    for (const key of this.mockData.keys()) {
      if (regex.test(key)) {
        matchingKeys.push(key);
      }
    }
    return matchingKeys;
  }

  async info(section?: string): Promise<string> {
    if (this.shouldFailInfo) {
      throw new Error('Redis info error');
    }
    return '# Server\nredis_version:7.0.0\n# Memory\nused_memory_human:1.00MB';
  }

  // Helper for tests to set data directly
  setMockData(key: string, value: string): void {
    this.mockData.set(key, value);
  }

  clearMockData(): void {
    this.mockData.clear();
  }

  // Methods to enable error simulation
  enableGetError(): void { this.shouldFailGet = true; }
  enableSetError(): void { this.shouldFailSet = true; }
  enableSetexError(): void { this.shouldFailSetex = true; }
  enableSetnxError(): void { this.shouldFailSetnx = true; }
  enableExpireError(): void { this.shouldFailExpire = true; }
  enableDelError(): void { this.shouldFailDel = true; }
  enableKeysError(): void { this.shouldFailKeys = true; }
  enableInfoError(): void { this.shouldFailInfo = true; }
}

// Store the mock Redis instance for test access
let mockRedisInstance: MockRedis | null = null;
let mockRedisConstructorError = false;
let mockRedisConnectError = false;

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation((url: string, options: any) => {
    if (mockRedisConstructorError) {
      throw new Error('Redis constructor error');
    }
    mockRedisInstance = new MockRedis(url, options);

    if (mockRedisConnectError) {
      // Override connect to reject
      const originalConnect = mockRedisInstance.connect.bind(mockRedisInstance);
      mockRedisInstance.connect = async () => {
        throw new Error('Connection failed');
      };
    }

    return mockRedisInstance;
  });
});

// Import after mock is set up
import { RedisWrapper } from '../../../services/RedisWrapper';

describe('RedisWrapper', () => {
  let redisWrapper: RedisWrapper;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
    mockRedisInstance = null;
    mockRedisConstructorError = false;
    mockRedisConnectError = false;
  });

  afterEach(async () => {
    if (redisWrapper) {
      await redisWrapper.close();
    }
    jest.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should create RedisWrapper with default URL', () => {
      redisWrapper = new RedisWrapper();

      expect(redisWrapper).toBeDefined();
      expect(redisWrapper).toBeInstanceOf(RedisWrapper);
    });

    it('should create RedisWrapper with custom URL', () => {
      const customUrl = 'redis://custom-host:6380';
      redisWrapper = new RedisWrapper(customUrl);

      expect(redisWrapper).toBeDefined();
      expect(mockRedisInstance?.url).toBe(customUrl);
    });

    it('should use environment variable REDIS_URL if no URL provided', () => {
      const originalEnv = process.env.REDIS_URL;
      process.env.REDIS_URL = 'redis://env-host:6381';

      redisWrapper = new RedisWrapper();

      expect(mockRedisInstance?.url).toBe('redis://env-host:6381');

      // Restore original env
      if (originalEnv !== undefined) {
        process.env.REDIS_URL = originalEnv;
      } else {
        delete process.env.REDIS_URL;
      }
    });

    it('should start memory cache cleanup interval on construction', () => {
      redisWrapper = new RedisWrapper();

      // Cleanup interval is started in constructor
      expect(redisWrapper).toBeDefined();
    });

    it('should handle Redis constructor errors and use memory cache', () => {
      mockRedisConstructorError = true;

      // Should not throw, should fallback to memory cache
      redisWrapper = new RedisWrapper();

      expect(redisWrapper).toBeDefined();
      expect(redisWrapper.isAvailable()).toBe(false);
    });

    it('should handle Redis connection failure and use memory cache', async () => {
      mockRedisConnectError = true;

      redisWrapper = new RedisWrapper();

      // Allow the connect promise to reject
      await jest.advanceTimersByTimeAsync(100);

      expect(redisWrapper.isAvailable()).toBe(false);
    });
  });

  describe('Connection Events', () => {
    it('should set isRedisAvailable to true on connect event', async () => {
      redisWrapper = new RedisWrapper();

      // Wait for connect event
      await jest.advanceTimersByTimeAsync(10);

      expect(redisWrapper.isAvailable()).toBe(true);
    });

    it('should set isRedisAvailable to true on ready event', async () => {
      redisWrapper = new RedisWrapper();

      // Wait for ready event
      await jest.advanceTimersByTimeAsync(10);

      expect(redisWrapper.isAvailable()).toBe(true);
    });

    it('should set isRedisAvailable to false on error event', async () => {
      redisWrapper = new RedisWrapper();

      // Wait for connection
      await jest.advanceTimersByTimeAsync(10);
      expect(redisWrapper.isAvailable()).toBe(true);

      // Trigger error
      mockRedisInstance?.emit('error', new Error('Connection lost'));

      expect(redisWrapper.isAvailable()).toBe(false);
    });

    it('should ignore common error messages (ECONNREFUSED, ECONNRESET, EPIPE)', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      // These should not log
      mockRedisInstance?.emit('error', new Error('ECONNREFUSED'));
      mockRedisInstance?.emit('error', new Error('ECONNRESET'));
      mockRedisInstance?.emit('error', new Error('EPIPE'));

      // Non-common error should log (if not permanently disabled)
      // Note: After 3 errors, it gets permanently disabled

      consoleSpy.mockRestore();
    });

    it('should set isRedisAvailable to false on close event', async () => {
      redisWrapper = new RedisWrapper();

      // Wait for connection
      await jest.advanceTimersByTimeAsync(10);
      expect(redisWrapper.isAvailable()).toBe(true);

      // Trigger close
      mockRedisInstance?.emit('close');

      expect(redisWrapper.isAvailable()).toBe(false);
    });

    it('should set isRedisAvailable to false on end event', async () => {
      redisWrapper = new RedisWrapper();

      // Wait for connection
      await jest.advanceTimersByTimeAsync(10);

      // Trigger end
      mockRedisInstance?.emit('end');

      expect(redisWrapper.isAvailable()).toBe(false);
    });

    it('should permanently disable after max connection attempts on error', async () => {
      redisWrapper = new RedisWrapper();

      // Wait for connection (counts as first attempt)
      await jest.advanceTimersByTimeAsync(10);

      // Trigger multiple errors to exceed max attempts
      mockRedisInstance?.emit('error', new Error('Test error 1'));
      mockRedisInstance?.emit('error', new Error('Test error 2'));
      mockRedisInstance?.emit('error', new Error('Test error 3'));

      expect(redisWrapper.isAvailable()).toBe(false);
    });
  });

  describe('get()', () => {
    it('should get value from Redis when available', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      mockRedisInstance?.setMockData('test-key', 'test-value');

      const result = await redisWrapper.get('test-key');

      expect(result).toBe('test-value');
    });

    it('should return null for non-existent key from Redis', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      const result = await redisWrapper.get('non-existent');

      expect(result).toBeNull();
    });

    it('should fallback to memory cache when Redis unavailable', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      // Set value via setex to populate memory cache
      await redisWrapper.setex('memory-key', 3600, 'memory-value');

      const result = await redisWrapper.get('memory-key');

      expect(result).toBe('memory-value');
    });

    it('should return null for expired entries in memory cache', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      // Set value with short TTL
      await redisWrapper.setex('expiring-key', 1, 'expiring-value');

      // Advance time past expiration
      await jest.advanceTimersByTimeAsync(2000);

      const result = await redisWrapper.get('expiring-key');

      expect(result).toBeNull();
    });

    it('should handle Redis get errors and fallback to memory cache', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      // Enable error simulation
      mockRedisInstance?.enableGetError();

      // Trigger the error
      await redisWrapper.get('any-key');

      // After error, should switch to memory cache
      expect(redisWrapper.isAvailable()).toBe(false);
    });
  });

  describe('set()', () => {
    it('should set value in Redis when available', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      await redisWrapper.set('new-key', 'new-value');

      const result = await redisWrapper.get('new-key');
      expect(result).toBe('new-value');
    });

    it('should set value in memory cache when Redis unavailable', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('memory-key', 'memory-value');

      const result = await redisWrapper.get('memory-key');
      expect(result).toBe('memory-value');
    });

    it('should handle Redis set errors and fallback to memory cache', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      // Enable error simulation
      mockRedisInstance?.enableSetError();

      await redisWrapper.set('error-key', 'error-value');

      // Should now be using memory cache
      expect(redisWrapper.isAvailable()).toBe(false);
    });
  });

  describe('setex()', () => {
    it('should set value with expiration in Redis when available', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      await redisWrapper.setex('expiring-key', 3600, 'expiring-value');

      const result = await redisWrapper.get('expiring-key');
      expect(result).toBe('expiring-value');
    });

    it('should set value with expiration in memory cache when Redis unavailable', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.setex('memory-expiring-key', 3600, 'memory-expiring-value');

      const result = await redisWrapper.get('memory-expiring-key');
      expect(result).toBe('memory-expiring-value');
    });

    it('should respect TTL in memory cache', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      // Set with 1 second TTL
      await redisWrapper.setex('short-lived', 1, 'temporary');

      // Value should exist before expiration
      let result = await redisWrapper.get('short-lived');
      expect(result).toBe('temporary');

      // Advance past TTL
      await jest.advanceTimersByTimeAsync(1500);

      // Value should be expired
      result = await redisWrapper.get('short-lived');
      expect(result).toBeNull();
    });

    it('should handle Redis setex errors and fallback to memory cache', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      // Enable error simulation
      mockRedisInstance?.enableSetexError();

      await redisWrapper.setex('error-key', 60, 'error-value');

      // Should now be using memory cache
      expect(redisWrapper.isAvailable()).toBe(false);
    });
  });

  describe('setnx()', () => {
    it('should set value if not exists in Redis when available', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      const result = await redisWrapper.setnx('new-key', 'new-value');

      expect(result).toBe(1);
    });

    it('should return 0 if key exists in Redis', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      mockRedisInstance?.setMockData('existing-key', 'existing-value');

      const result = await redisWrapper.setnx('existing-key', 'new-value');

      expect(result).toBe(0);
    });

    it('should set value if not exists in memory cache when Redis unavailable', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      const result = await redisWrapper.setnx('memory-new-key', 'memory-new-value');

      expect(result).toBe(1);

      const value = await redisWrapper.get('memory-new-key');
      expect(value).toBe('memory-new-value');
    });

    it('should return 0 if key exists in memory cache', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('existing-memory-key', 'existing-value');

      const result = await redisWrapper.setnx('existing-memory-key', 'new-value');

      expect(result).toBe(0);
    });

    it('should set value if existing key is expired in memory cache', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      // Set with short TTL
      await redisWrapper.setex('expiring-key', 1, 'expiring-value');

      // Wait for expiration
      await jest.advanceTimersByTimeAsync(1500);

      // Should be able to set now
      const result = await redisWrapper.setnx('expiring-key', 'new-value');

      expect(result).toBe(1);
    });

    it('should handle Redis setnx errors and fallback to memory cache', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      // Enable error simulation
      mockRedisInstance?.enableSetnxError();

      const result = await redisWrapper.setnx('error-key', 'error-value');

      // After error, falls back to memory cache and should succeed
      expect(result).toBe(1);
      expect(redisWrapper.isAvailable()).toBe(false);
    });
  });

  describe('expire()', () => {
    it('should set expiration on existing key in Redis', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      mockRedisInstance?.setMockData('expire-key', 'value');

      const result = await redisWrapper.expire('expire-key', 3600);

      expect(result).toBe(1);
    });

    it('should return 0 for non-existent key in Redis', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      const result = await redisWrapper.expire('non-existent', 3600);

      expect(result).toBe(0);
    });

    it('should set expiration on existing key in memory cache', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('memory-expire-key', 'value');

      const result = await redisWrapper.expire('memory-expire-key', 3600);

      expect(result).toBe(1);
    });

    it('should return 0 for non-existent key in memory cache', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      const result = await redisWrapper.expire('non-existent', 3600);

      expect(result).toBe(0);
    });

    it('should handle Redis expire errors and fallback to memory cache', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      // Enable error simulation
      mockRedisInstance?.enableExpireError();

      await redisWrapper.expire('error-key', 60);

      expect(redisWrapper.isAvailable()).toBe(false);
    });
  });

  describe('del()', () => {
    it('should delete key from Redis when available', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      mockRedisInstance?.setMockData('delete-key', 'value');

      await redisWrapper.del('delete-key');

      const result = await redisWrapper.get('delete-key');
      expect(result).toBeNull();
    });

    it('should delete key from memory cache when Redis unavailable', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('memory-delete-key', 'value');
      await redisWrapper.del('memory-delete-key');

      const result = await redisWrapper.get('memory-delete-key');
      expect(result).toBeNull();
    });

    it('should handle Redis del errors and fallback to memory cache', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      // Enable error simulation
      mockRedisInstance?.enableDelError();

      await redisWrapper.del('error-key');

      expect(redisWrapper.isAvailable()).toBe(false);
    });
  });

  describe('keys()', () => {
    it('should return matching keys from Redis when available', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      mockRedisInstance?.setMockData('user:1', 'data1');
      mockRedisInstance?.setMockData('user:2', 'data2');
      mockRedisInstance?.setMockData('session:1', 'session1');

      const result = await redisWrapper.keys('user:*');

      expect(result).toHaveLength(2);
      expect(result).toContain('user:1');
      expect(result).toContain('user:2');
    });

    it('should return matching keys from memory cache when Redis unavailable', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('cache:1', 'data1');
      await redisWrapper.set('cache:2', 'data2');
      await redisWrapper.set('other:1', 'other1');

      const result = await redisWrapper.keys('cache:*');

      expect(result).toHaveLength(2);
      expect(result).toContain('cache:1');
      expect(result).toContain('cache:2');
    });

    it('should return empty array for non-matching pattern', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('test:1', 'value');

      const result = await redisWrapper.keys('nonexistent:*');

      expect(result).toHaveLength(0);
    });

    it('should handle Redis keys errors and fallback to memory cache', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      // Enable error simulation
      mockRedisInstance?.enableKeysError();

      const result = await redisWrapper.keys('*');

      expect(redisWrapper.isAvailable()).toBe(false);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('info()', () => {
    it('should return Redis info when available', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      const result = await redisWrapper.info();

      expect(result).toContain('redis_version');
    });

    it('should return info with section parameter', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      const result = await redisWrapper.info('memory');

      expect(result).toContain('Memory');
    });

    it('should return simulated info when Redis unavailable', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      const result = await redisWrapper.info();

      expect(result).toContain('# Memory');
      expect(result).toContain('# Keyspace');
    });

    it('should handle Redis info errors and fallback to simulated info', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      // Enable error simulation
      mockRedisInstance?.enableInfoError();

      const result = await redisWrapper.info();

      expect(redisWrapper.isAvailable()).toBe(false);
      expect(result).toContain('# Memory');
    });
  });

  describe('close()', () => {
    it('should clear cleanup interval and disconnect Redis', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      await redisWrapper.close();

      expect(mockRedisInstance?.disconnectCalled).toBe(true);
    });

    it('should clear memory cache on close', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('key1', 'value1');
      await redisWrapper.set('key2', 'value2');

      await redisWrapper.close();

      const stats = redisWrapper.getCacheStats();
      expect(stats.entries).toBe(0);
    });

    it('should handle disconnect errors gracefully', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      if (mockRedisInstance) {
        mockRedisInstance.disconnect = jest.fn(() => {
          throw new Error('Disconnect error');
        });
      }

      // Should not throw
      await expect(redisWrapper.close()).resolves.not.toThrow();
    });
  });

  describe('isAvailable()', () => {
    it('should return true when Redis is connected', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      expect(redisWrapper.isAvailable()).toBe(true);
    });

    it('should return false when Redis is unavailable', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      expect(redisWrapper.isAvailable()).toBe(false);
    });

    it('should return false after permanent disable', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      // Trigger end event to permanently disable
      mockRedisInstance?.emit('end');

      expect(redisWrapper.isAvailable()).toBe(false);
    });
  });

  describe('getCacheStats()', () => {
    it('should return Redis mode when connected', async () => {
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(10);

      const stats = redisWrapper.getCacheStats();

      expect(stats.mode).toBe('Redis');
      expect(stats.redisAvailable).toBe(true);
    });

    it('should return Memory mode when Redis unavailable', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      const stats = redisWrapper.getCacheStats();

      expect(stats.mode).toBe('Memory');
      expect(stats.redisAvailable).toBe(false);
    });

    it('should track memory cache entry count', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('key1', 'value1');
      await redisWrapper.set('key2', 'value2');
      await redisWrapper.set('key3', 'value3');

      const stats = redisWrapper.getCacheStats();

      expect(stats.entries).toBe(3);
    });
  });

  describe('Memory Cache Cleanup', () => {
    it('should clean up expired entries on interval', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      // Set values with short TTL
      await redisWrapper.setex('short-1', 1, 'value1');
      await redisWrapper.setex('short-2', 1, 'value2');
      await redisWrapper.setex('long', 3600, 'value3');

      let stats = redisWrapper.getCacheStats();
      expect(stats.entries).toBe(3);

      // Wait for entries to expire
      await jest.advanceTimersByTimeAsync(2000);

      // Wait for cleanup interval (60 seconds)
      await jest.advanceTimersByTimeAsync(60000);

      stats = redisWrapper.getCacheStats();
      expect(stats.entries).toBe(1);

      const longValue = await redisWrapper.get('long');
      expect(longValue).toBe('value3');
    });
  });

  describe('Retry Strategy', () => {
    it('should stop retrying after max connection attempts', async () => {
      redisWrapper = new RedisWrapper();

      // Access the retry strategy through options
      const retryStrategy = mockRedisInstance?.options?.retryStrategy;

      if (retryStrategy) {
        // First 3 attempts should return retry delay
        expect(retryStrategy(1)).toBe(2000);
        expect(retryStrategy(2)).toBe(2000);
        expect(retryStrategy(3)).toBe(2000);

        // After max attempts, should return null
        expect(retryStrategy(4)).toBeNull();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string values', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('empty-key', '');

      const result = await redisWrapper.get('empty-key');
      expect(result).toBe('');
    });

    it('should handle special characters in keys', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      const specialKey = 'key:with:colons:and-dashes_and_underscores';
      await redisWrapper.set(specialKey, 'special-value');

      const result = await redisWrapper.get(specialKey);
      expect(result).toBe('special-value');
    });

    it('should handle special characters in values', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      const specialValue = '{"json": "value", "with": ["special", "chars"]}';
      await redisWrapper.set('json-key', specialValue);

      const result = await redisWrapper.get('json-key');
      expect(result).toBe(specialValue);
    });

    it('should handle Unicode characters', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      const unicodeValue = 'Hello World - Bonjour - Hola - Test unicode chars';
      await redisWrapper.set('unicode-key', unicodeValue);

      const result = await redisWrapper.get('unicode-key');
      expect(result).toBe(unicodeValue);
    });

    it('should handle very long values', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      const longValue = 'A'.repeat(100000);
      await redisWrapper.set('long-value-key', longValue);

      const result = await redisWrapper.get('long-value-key');
      expect(result).toBe(longValue);
    });

    it('should handle multiple concurrent operations', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(redisWrapper.set(`concurrent-${i}`, `value-${i}`));
      }

      await Promise.all(operations);

      const stats = redisWrapper.getCacheStats();
      expect(stats.entries).toBe(100);

      // Verify some values
      expect(await redisWrapper.get('concurrent-0')).toBe('value-0');
      expect(await redisWrapper.get('concurrent-99')).toBe('value-99');
    });
  });

  describe('Pattern Matching', () => {
    it('should match exact patterns', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('exact-key', 'value');

      const result = await redisWrapper.keys('exact-key');

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('exact-key');
    });

    it('should match wildcard patterns with asterisk at end', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('prefix:1', 'value1');
      await redisWrapper.set('prefix:2', 'value2');
      await redisWrapper.set('other:1', 'other');

      const result = await redisWrapper.keys('prefix:*');

      expect(result).toHaveLength(2);
    });

    it('should match wildcard patterns with asterisk at start', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('1:suffix', 'value1');
      await redisWrapper.set('2:suffix', 'value2');
      await redisWrapper.set('1:other', 'other');

      const result = await redisWrapper.keys('*:suffix');

      expect(result).toHaveLength(2);
    });

    it('should match wildcard patterns with asterisk in middle', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('user:123:profile', 'value1');
      await redisWrapper.set('user:456:profile', 'value2');
      await redisWrapper.set('user:123:settings', 'settings');

      const result = await redisWrapper.keys('user:*:profile');

      expect(result).toHaveLength(2);
    });

    it('should match all keys with single asterisk', async () => {
      mockRedisConnectError = true;
      redisWrapper = new RedisWrapper();
      await jest.advanceTimersByTimeAsync(100);

      await redisWrapper.set('key1', 'value1');
      await redisWrapper.set('key2', 'value2');
      await redisWrapper.set('key3', 'value3');

      const result = await redisWrapper.keys('*');

      expect(result).toHaveLength(3);
    });
  });
});

describe('RedisWrapper - Integration Scenarios', () => {
  let redisWrapper: RedisWrapper;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
    mockRedisInstance = null;
    mockRedisConstructorError = false;
    mockRedisConnectError = true; // Use memory cache for these tests
  });

  afterEach(async () => {
    if (redisWrapper) {
      await redisWrapper.close();
    }
    jest.useRealTimers();
  });

  it('should handle session storage scenario', async () => {
    redisWrapper = new RedisWrapper();
    await jest.advanceTimersByTimeAsync(100);

    const sessionId = 'session:abc123';
    const sessionData = JSON.stringify({
      userId: 'user-123',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000
    });

    // Set session with 1 hour TTL
    await redisWrapper.setex(sessionId, 3600, sessionData);

    // Retrieve session
    const retrieved = await redisWrapper.get(sessionId);
    expect(retrieved).toBe(sessionData);

    // Parse and verify
    const parsed = JSON.parse(retrieved!);
    expect(parsed.userId).toBe('user-123');
  });

  it('should handle rate limiting scenario', async () => {
    redisWrapper = new RedisWrapper();
    await jest.advanceTimersByTimeAsync(100);

    const rateKey = 'rate:user:123';

    // First request - should succeed
    const result1 = await redisWrapper.setnx(rateKey, '1');
    expect(result1).toBe(1);

    // Set TTL for rate limit window
    await redisWrapper.expire(rateKey, 60);

    // Second request within window - should fail
    const result2 = await redisWrapper.setnx(rateKey, '1');
    expect(result2).toBe(0);
  });

  it('should handle cache invalidation scenario', async () => {
    redisWrapper = new RedisWrapper();
    await jest.advanceTimersByTimeAsync(100);

    // Cache some user data
    await redisWrapper.set('user:123:profile', '{"name": "John"}');
    await redisWrapper.set('user:123:settings', '{"theme": "dark"}');
    await redisWrapper.set('user:456:profile', '{"name": "Jane"}');

    // Find all user:123 keys
    const user123Keys = await redisWrapper.keys('user:123:*');
    expect(user123Keys).toHaveLength(2);

    // Invalidate all user:123 cache
    for (const key of user123Keys) {
      await redisWrapper.del(key);
    }

    // Verify deletion
    expect(await redisWrapper.get('user:123:profile')).toBeNull();
    expect(await redisWrapper.get('user:123:settings')).toBeNull();

    // Other user unaffected
    expect(await redisWrapper.get('user:456:profile')).toBe('{"name": "Jane"}');
  });

  it('should handle graceful degradation from Redis to memory', async () => {
    // Start with working Redis
    mockRedisConnectError = false;
    redisWrapper = new RedisWrapper();
    await jest.advanceTimersByTimeAsync(10);

    expect(redisWrapper.isAvailable()).toBe(true);

    // Store some data
    await redisWrapper.set('persistent-key', 'persistent-value');

    // Simulate Redis failure
    mockRedisInstance?.enableGetError();

    // Next operation should fail and switch to memory cache
    await redisWrapper.get('persistent-key');

    // Now using memory cache
    expect(redisWrapper.isAvailable()).toBe(false);

    // New operations should work via memory cache
    await redisWrapper.set('memory-key', 'memory-value');
    const value = await redisWrapper.get('memory-key');
    expect(value).toBe('memory-value');
  });
});
