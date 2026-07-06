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

// Idempotent enqueue: only push if no entry with the same messageId AND
// eventType already exists. A queued 'new' must NOT block a later 'edited'
// or 'deleted' for the same message — those are distinct events that must
// all replay on drain, in FIFO order, so the recipient's final state matches
// the sender's (edit/delete after an offline 'new' must not be dropped).
// Returns 1 when pushed, 0 when the (messageId, eventType) pair was already present.
// KEYS[1] = queue key, ARGV[1] = serialized entry, ARGV[2] = messageId,
// ARGV[3] = TTL, ARGV[4] = normalized eventType
const ENQUEUE_DEDUP_LUA = `
local entries = redis.call('LRANGE', KEYS[1], 0, -1)
for _, entry in ipairs(entries) do
  local ok, decoded = pcall(cjson.decode, entry)
  if ok and decoded and decoded.messageId == ARGV[2] then
    local decodedEventType = decoded.eventType or 'new'
    if decodedEventType == ARGV[4] then
      return 0
    end
  end
end
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return 1
`.trim();

function queueKey(userId: string): string {
  return `${DELIVERY_QUEUE_PREFIX}${userId}`;
}

function normalizedEventType(entry: QueuedMessagePayload): string {
  return entry.eventType ?? 'new';
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
        const pushed = await redis.eval(
          ENQUEUE_DEDUP_LUA, 1, key,
          serialized, entry.messageId, String(DELIVERY_QUEUE_TTL_SECONDS), normalizedEventType(entry)
        );
        if (pushed === 0) {
          logger.debug('Delivery queue dedup: messageId already queued', { userId, messageId: entry.messageId });
        }
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
    if (existing.some(e => e.messageId === entry.messageId && normalizedEventType(e) === normalizedEventType(entry))) {
      logger.debug('Delivery queue dedup (memory): messageId+eventType already queued', { userId, messageId: entry.messageId, eventType: normalizedEventType(entry) });
      return;
    }
    const bounded = existing.length >= MEMORY_QUEUE_MAX_PER_USER
      ? existing.slice(existing.length - MEMORY_QUEUE_MAX_PER_USER + 1)
      : existing;
    this.memoryQueue.set(userId, [...bounded, entry]);
  }

  async drain(userId: string): Promise<QueuedMessagePayload[]> {
    const redis = this.getRedis();

    // Entries stashed here predate anything Redis holds now (they were queued
    // during a transient Redis outage, before it recovered), so they always
    // sort first. Pulled out up front so they're never orphaned: without this,
    // a Redis-reachable drain() would return only the Redis-backed entries and
    // silently leave these sitting in memory forever (see enqueue()'s fallback).
    const memoryEntries = this.memoryQueue.get(userId) ?? [];
    this.memoryQueue.delete(userId);

    if (redis) {
      try {
        const key = queueKey(userId);
        const rawEntries = await redis.eval(DRAIN_LUA, 1, key);

        const redisEntries = !Array.isArray(rawEntries) ? [] : (rawEntries as string[]).flatMap(raw => {
          try {
            return [JSON.parse(raw) as QueuedMessagePayload];
          } catch {
            logger.error('RedisDeliveryQueue: malformed entry in drain, dropping', { userId, raw: raw.substring(0, 120) });
            return [];
          }
        });
        return [...memoryEntries, ...redisEntries];
      } catch (error) {
        logger.warn('Redis drain failed, falling back to memory', { userId, error });
      }
    }

    return memoryEntries;
  }

  async peek(userId: string, limit?: number): Promise<QueuedMessagePayload[]> {
    const redis = this.getRedis();

    if (redis) {
      try {
        const key = queueKey(userId);
        const end = limit ? limit - 1 : -1;
        const rawEntries = await redis.lrange(key, 0, end);
        return rawEntries.flatMap(raw => {
          try {
            return [JSON.parse(raw) as QueuedMessagePayload];
          } catch {
            logger.error('RedisDeliveryQueue: malformed entry in peek, dropping', { userId, raw: raw.substring(0, 120) });
            return [];
          }
        });
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
              try {
                const parsed = JSON.parse(raw) as QueuedMessagePayload;
                return new Date(parsed.enqueuedAt).getTime() > cutoff;
              } catch {
                logger.error('RedisDeliveryQueue: malformed entry in cleanup, dropping', { key, raw: raw.substring(0, 120) });
                return false;
              }
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
      } catch (error) {
        logger.warn('Redis cleanup failed, falling back to memory', { error });
      }
    }

    // Always sweep the memory fallback too, regardless of Redis reachability:
    // entries land here during a transient Redis outage and must still expire
    // on schedule even after Redis recovers (drain() reads both, but cleanup
    // must not let them sit unbounded until then).
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
