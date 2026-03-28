import type Redis from 'ioredis';
import type { CacheStore } from './CacheStore';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { DELIVERY_QUEUE_PREFIX, DELIVERY_QUEUE_TTL_SECONDS } from '@meeshy/shared/types/delivery-queue';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'RedisDeliveryQueue' });

function queueKey(userId: string): string {
  return `${DELIVERY_QUEUE_PREFIX}${userId}`;
}

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
        await redis.rpush(key, serialized);
        await redis.expire(key, DELIVERY_QUEUE_TTL_SECONDS);
        return;
      } catch (error) {
        logger.warn('Redis enqueue failed, falling back to memory', { userId, error });
      }
    }

    const existing = this.memoryQueue.get(userId) ?? [];
    this.memoryQueue.set(userId, [...existing, entry]);
  }

  async drain(userId: string): Promise<QueuedMessagePayload[]> {
    const redis = this.getRedis();

    if (redis) {
      try {
        const key = queueKey(userId);
        const pipeline = redis.pipeline();
        pipeline.lrange(key, 0, -1);
        pipeline.del(key);
        const results = await pipeline.exec();

        if (!results || !results[0]) return [];

        const [rangeError, rawEntries] = results[0];
        if (rangeError) throw rangeError;

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
