import type Redis from 'ioredis';
import type { CacheStore } from './CacheStore';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { DELIVERY_QUEUE_PREFIX, DELIVERY_QUEUE_TTL_SECONDS } from '@meeshy/shared/types/delivery-queue';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'RedisDeliveryQueue' });

// Atomically read-all + delete in a single Redis round-trip.
// Using eval (Lua) instead of pipeline prevents duplicate delivery
// when two workers race to drain the same key simultaneously.
const DRAIN_LUA = `
local entries = redis.call('LRANGE', KEYS[1], 0, -1)
redis.call('DEL', KEYS[1])
return entries
`.trim();

function queueKey(userId: string): string {
  return `${DELIVERY_QUEUE_PREFIX}${userId}`;
}

const MEMORY_QUEUE_MAX_USERS = 1000;
const MEMORY_QUEUE_MAX_PER_USER = 50;

export class RedisDeliveryQueue {
  private memoryQueue: Map<string, QueuedMessagePayload[]> = new Map();

  constructor(private cacheStore: CacheStore) {}

  private getRedis(): Redis | null {
    return this.cacheStore.getNativeClient();
  }

  async enqueue(userId: string, entry: QueuedMessagePayload): Promise<void> {
    const redis = this.getRedis();
    const serialized = JSON.stringify(entry);

    if (redis) {
      try {
        const key = queueKey(userId);
        const pipeline = redis.pipeline();
        pipeline.rpush(key, serialized);
        pipeline.expire(key, DELIVERY_QUEUE_TTL_SECONDS);
        await pipeline.exec();
        return;
      } catch (error) {
        logger.warn('Redis enqueue failed, falling back to memory', { userId, error });
      }
    }

    // Evict oldest user bucket when global cap reached
    if (this.memoryQueue.size >= MEMORY_QUEUE_MAX_USERS && !this.memoryQueue.has(userId)) {
      const firstUser = this.memoryQueue.keys().next().value;
      /* istanbul ignore next -- Map always has a key when size >= 1000 */
      if (firstUser !== undefined) {
        logger.warn('Memory delivery queue at capacity, evicting oldest user', { evicted: firstUser });
        this.memoryQueue.delete(firstUser);
      }
    }
    const existing = this.memoryQueue.get(userId) ?? [];
    const bounded = existing.length >= MEMORY_QUEUE_MAX_PER_USER
      ? existing.slice(existing.length - MEMORY_QUEUE_MAX_PER_USER + 1)
      : existing;
    this.memoryQueue.set(userId, [...bounded, entry]);
  }

  async drain(userId: string): Promise<QueuedMessagePayload[]> {
    const redis = this.getRedis();

    if (redis) {
      try {
        const key = queueKey(userId);
        const rawEntries = await redis.eval(DRAIN_LUA, 1, key);

        if (!Array.isArray(rawEntries)) return [];
        return (rawEntries as string[]).map(raw => JSON.parse(raw) as QueuedMessagePayload);
      } catch (error) {
        logger.warn('Redis drain failed, falling back to memory', { userId, error });
      }
    }

    const entries = this.memoryQueue.get(userId) ?? [];
    this.memoryQueue.delete(userId);
    return entries;
  }

  async peek(userId: string, limit?: number): Promise<QueuedMessagePayload[]> {
    const redis = this.getRedis();

    if (redis) {
      try {
        const key = queueKey(userId);
        const end = limit ? limit - 1 : -1;
        const rawEntries = await redis.lrange(key, 0, end);
        return rawEntries.map(raw => JSON.parse(raw) as QueuedMessagePayload);
      } catch (error) {
        logger.warn('Redis peek failed, falling back to memory', { userId, error });
      }
    }

    const entries = this.memoryQueue.get(userId) ?? [];
    return limit ? entries.slice(0, limit) : [...entries];
  }

  async size(userId: string): Promise<number> {
    const redis = this.getRedis();

    if (redis) {
      try {
        return await redis.llen(queueKey(userId));
      } catch (error) {
        logger.warn('Redis size failed, falling back to memory', { userId, error });
      }
    }

    return (this.memoryQueue.get(userId) ?? []).length;
  }

  async cleanup(): Promise<number> {
    const cutoff = Date.now() - DELIVERY_QUEUE_TTL_SECONDS * 1000;
    const redis = this.getRedis();
    let totalRemoved = 0;

    if (redis) {
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(
            cursor, 'MATCH', `${DELIVERY_QUEUE_PREFIX}*`, 'COUNT', 100
          );
          cursor = nextCursor;

          for (const key of keys) {
            const entries = await redis.lrange(key, 0, -1);
            const fresh = entries.filter(raw => {
              const parsed = JSON.parse(raw) as QueuedMessagePayload;
              return new Date(parsed.enqueuedAt).getTime() > cutoff;
            });

            const removed = entries.length - fresh.length;
            if (removed > 0) {
              totalRemoved += removed;
              const pipeline = redis.pipeline();
              pipeline.del(key);
              if (fresh.length > 0) {
                pipeline.rpush(key, ...fresh);
                pipeline.expire(key, DELIVERY_QUEUE_TTL_SECONDS);
              }
              await pipeline.exec();
            }
          }
        } while (cursor !== '0');

        return totalRemoved;
      } catch (error) {
        logger.warn('Redis cleanup failed, falling back to memory', { error });
      }
    }

    for (const [userId, entries] of this.memoryQueue.entries()) {
      const fresh = entries.filter(e => new Date(e.enqueuedAt).getTime() > cutoff);
      const removed = entries.length - fresh.length;
      totalRemoved += removed;

      if (fresh.length === 0) {
        this.memoryQueue.delete(userId);
      } else {
        this.memoryQueue.set(userId, fresh);
      }
    }

    return totalRemoved;
  }
}
