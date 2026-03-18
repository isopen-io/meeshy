import Redis from 'ioredis';
import { enhancedLogger } from '../utils/logger-enhanced';
import { CircuitBreakerFactory, circuitBreakerManager, CircuitState } from '../utils/circuitBreaker';

const logger = enhancedLogger.child({ module: 'CacheStore' });

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

export type CacheStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  expire(key: string, seconds: number): Promise<boolean>;
  publish(channel: string, message: string): Promise<number>;
  info(section?: string): Promise<string>;
  isAvailable(): boolean;
  close(): Promise<void>;
  getNativeClient(): Redis | null;
};

export class RedisCacheStore implements CacheStore {
  private redis: Redis | null = null;
  private memoryCache: Map<string, MemoryCacheEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private redisConnected = false;
  private circuitBreaker = CircuitBreakerFactory.createRedisBreaker();

  constructor(redisUrl?: string) {
    const url = redisUrl ?? process.env.REDIS_URL;

    if (url) {
      this.initializeRedis(url);
    }

    this.startMemoryCacheCleanup();
    circuitBreakerManager.register('cacheStore', this.circuitBreaker);
  }

  private initializeRedis(url: string): void {
    try {
      this.redis = new Redis(url, {
        retryStrategy: (times: number) => {
          if (times > 3) {
            logger.warn('Max connection attempts reached, switching to memory cache');
            return null;
          }
          return 2000;
        },
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      this.redis.on('connect', () => {
        this.redisConnected = true;
      });

      this.redis.on('ready', () => {
        logger.info('Redis ready');
        this.redisConnected = true;
      });

      this.redis.on('error', (error) => {
        const suppressedErrors = ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT'];
        if (!suppressedErrors.some(code => error.message.includes(code))) {
          logger.warn('Redis error', { error: error.message });
        }
        this.redisConnected = false;
      });

      this.redis.on('close', () => {
        this.redisConnected = false;
      });

      this.redis.on('end', () => {
        this.redisConnected = false;
      });

      this.redis.connect().catch(() => {
        logger.warn('Redis connection failed, using memory cache');
        this.redisConnected = false;
      });
    } catch {
      logger.warn('Redis initialization failed, using memory cache');
      this.redis = null;
      this.redisConnected = false;
    }
  }

  private startMemoryCacheCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.expiresAt < now) {
          this.memoryCache.delete(key);
        }
      }
    }, 60000);
  }

  private getMemory(key: string): string | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.value;
  }

  private setMemory(key: string, value: string, ttlSeconds?: number): void {
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds ? ttlSeconds * 1000 : 3600000),
    });
  }

  async get(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        const value = await this.circuitBreaker.execute(() => this.redis!.get(key));
        return value;
      } catch {
        // fall through to memory
      }
    }
    return this.getMemory(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.redis) {
      try {
        await this.circuitBreaker.execute(() => {
          if (ttlSeconds) {
            return this.redis!.set(key, value, 'EX', ttlSeconds);
          }
          return this.redis!.set(key, value);
        });
        return;
      } catch {
        // fall through to memory
      }
    }
    this.setMemory(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.circuitBreaker.execute(() => this.redis!.del(key));
        return;
      } catch {
        // fall through to memory
      }
    }
    this.memoryCache.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    if (this.redis) {
      try {
        const result = await this.circuitBreaker.execute(() => this.redis!.keys(pattern));
        return result as string[];
      } catch {
        // fall through to memory
      }
    }

    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matching: string[] = [];
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        matching.push(key);
      }
    }
    return matching;
  }

  async setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (this.redis) {
      try {
        if (ttlSeconds) {
          const result = await this.circuitBreaker.execute(
            () => this.redis!.set(key, value, 'EX', ttlSeconds, 'NX')
          );
          return result === 'OK';
        }
        const result = await this.circuitBreaker.execute(() => this.redis!.setnx(key, value));
        return result === 1;
      } catch {
        // fall through to memory
      }
    }

    const existing = this.getMemory(key);
    if (existing !== null) {
      return false;
    }
    this.setMemory(key, value, ttlSeconds);
    return true;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (this.redis) {
      try {
        const result = await this.circuitBreaker.execute(() => this.redis!.expire(key, seconds));
        return result === 1;
      } catch {
        // fall through to memory
      }
    }

    const entry = this.memoryCache.get(key);
    if (!entry) return false;

    this.memoryCache.set(key, {
      value: entry.value,
      expiresAt: Date.now() + seconds * 1000,
    });
    return true;
  }

  async publish(channel: string, message: string): Promise<number> {
    if (this.redis) {
      try {
        const result = await this.circuitBreaker.execute(
          () => this.redis!.publish(channel, message)
        );
        return result as number;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  async info(section?: string): Promise<string> {
    if (this.redis) {
      try {
        const result = await this.circuitBreaker.execute(() => this.redis!.info(section));
        return result as string;
      } catch {
        // fall through to simulated info
      }
    }

    return `# Memory\nused_memory_human:${(this.memoryCache.size * 100 / 1024).toFixed(2)}KB\n# Keyspace\ndb0:keys=${this.memoryCache.size}`;
  }

  isAvailable(): boolean {
    return this.redis !== null && this.circuitBreaker.getStats().state !== CircuitState.OPEN;
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.redis) {
      try {
        this.redis.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this.redis = null;
    }

    this.memoryCache.clear();
    logger.info('CacheStore closed');
  }

  getNativeClient(): Redis | null {
    return this.redis;
  }
}

let sharedInstance: CacheStore | null = null;

export function getCacheStore(): CacheStore {
  if (!sharedInstance) {
    sharedInstance = new RedisCacheStore();
  }
  return sharedInstance;
}

export function resetCacheStore(): void {
  if (sharedInstance) {
    sharedInstance.close();
    sharedInstance = null;
  }
}
