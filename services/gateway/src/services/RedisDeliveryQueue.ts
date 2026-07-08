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

// Enqueue keyed on (messageId, eventType). A queued 'new' must NOT block a
// later 'edited'/'deleted' for the same message — those are distinct events
// that must all replay on drain, in FIFO order, so the recipient's final state
// matches the sender's (edit/delete after an offline 'new' must not be dropped).
//
// 'new' is IMMUTABLE: a re-enqueue is a retry of the identical event, so it is
// idempotently dropped (return 0). Every other event type ('edited'/'deleted')
// is MUTABLE: the LATEST payload must win. A message edited twice while a
// recipient is offline enqueues two 'edited' entries; keeping the first would
// replay the stale intermediate content on drain. So a matching mutable entry
// is SUPERSEDED in place (LSET at its FIFO slot, return 2) rather than dropped —
// preserving the one-entry-per-(messageId, eventType) invariant the drain/prune
// paths rely on while carrying the newest content and enqueuedAt.
//
// Returns 1 when pushed as a new entry, 0 when an identical 'new' was deduped,
// 2 when a mutable entry was superseded in place.
// KEYS[1] = queue key, ARGV[1] = serialized entry, ARGV[2] = messageId,
// ARGV[3] = TTL, ARGV[4] = normalized eventType
const ENQUEUE_DEDUP_LUA = `
local entries = redis.call('LRANGE', KEYS[1], 0, -1)
for i, entry in ipairs(entries) do
  local ok, decoded = pcall(cjson.decode, entry)
  if ok and decoded and decoded.messageId == ARGV[2] then
    local decodedEventType = decoded.eventType or 'new'
    if decodedEventType == ARGV[4] then
      if ARGV[4] == 'new' then
        return 0
      end
      redis.call('LSET', KEYS[1], i - 1, ARGV[1])
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
      return 2
    end
  end
end
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return 1
`.trim();

// Atomically remove specific expired entries by exact value in a single
// round-trip. Only the entries the caller identified as stale (passed as ARGV)
// are removed; a message enqueued concurrently — AFTER the caller's LRANGE
// snapshot — is a DIFFERENT value and is never touched. The previous
// DEL + RPUSH(fresh) rebuild wiped the whole key then restored only the stale
// snapshot, silently dropping any message enqueued between the read and the
// rewrite (the very read-modify-write race the DRAIN_LUA comment warns about).
// (messageId, eventType) dedup at enqueue guarantees each raw value is unique,
// so LREM with count 0 removes exactly the intended entry. Returns the count
// actually removed.
// KEYS[1] = queue key, ARGV[1..N] = raw serialized entries to remove
const PRUNE_STALE_LUA = `
local removed = 0
for i = 1, #ARGV do
  removed = removed + redis.call('LREM', KEYS[1], 0, ARGV[i])
end
return removed
`.trim();

function queueKey(userId: string): string {
  return `${DELIVERY_QUEUE_PREFIX}${userId}`;
}

function normalizedEventType(entry: QueuedMessagePayload): string {
  return entry.eventType ?? 'new';
}

// FIFO replay order across the memory-fallback and Redis-backed slices. The two
// can interleave in time: a message enqueued to Redis while it was healthy may
// be FOLLOWED by an edit/delete for the SAME message that fell back to memory
// during a transient Redis blip. Concatenating memory-first would then replay
// the edit BEFORE the `new` it targets (see the FIFO invariant on ENQUEUE_DEDUP_LUA),
// and the recipient's client drops an edit for a message it hasn't received yet.
// Every entry carries a monotonic `enqueuedAt` stamped at enqueue time, so sort
// by it to restore true FIFO. `Array.prototype.sort` is stable, so entries that
// share a timestamp keep their memory-before-Redis order — preserving the
// outage-only reconciliation contract (memory entries queued during a full
// outage still lead).
function byEnqueuedAt(a: QueuedMessagePayload, b: QueuedMessagePayload): number {
  return new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime();
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
          logger.debug('Delivery queue dedup: identical messageId already queued', { userId, messageId: entry.messageId });
        } else if (pushed === 2) {
          logger.debug('Delivery queue supersede: newer payload replaced queued entry', { userId, messageId: entry.messageId, eventType: normalizedEventType(entry) });
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
    const eventType = normalizedEventType(entry);
    const dupIndex = existing.findIndex(e => e.messageId === entry.messageId && normalizedEventType(e) === eventType);
    if (dupIndex !== -1) {
      // Mirror ENQUEUE_DEDUP_LUA: 'new' is idempotent (drop the retry); every
      // other event type is mutable, so the latest payload supersedes the queued
      // one in place — keeping a single entry per (messageId, eventType) while
      // carrying the newest content, so a message edited twice offline replays
      // the final content on drain, not the stale intermediate one.
      if (eventType === 'new') {
        logger.debug('Delivery queue dedup (memory): identical messageId+eventType already queued', { userId, messageId: entry.messageId, eventType });
        return;
      }
      logger.debug('Delivery queue supersede (memory): newer payload replaced queued entry', { userId, messageId: entry.messageId, eventType });
      this.memoryQueue.set(userId, existing.map((e, i) => (i === dupIndex ? entry : e)));
      return;
    }
    const bounded = existing.length >= MEMORY_QUEUE_MAX_PER_USER
      ? existing.slice(existing.length - MEMORY_QUEUE_MAX_PER_USER + 1)
      : existing;
    this.memoryQueue.set(userId, [...bounded, entry]);
  }

  async drain(userId: string): Promise<QueuedMessagePayload[]> {
    const redis = this.getRedis();

    // Entries stashed here were queued during a transient Redis outage before
    // it recovered. Pulled out up front so they're never orphaned: without this,
    // a Redis-reachable drain() would return only the Redis-backed entries and
    // silently leave these sitting in memory forever (see enqueue()'s fallback).
    // Their FIFO position relative to Redis-backed entries is resolved by
    // `byEnqueuedAt` below, not by concatenation order — a mid-sequence blip can
    // leave a memory entry NEWER than a Redis one (e.g. an edit that fell back
    // to memory after its `new` reached Redis).
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
        return [...memoryEntries, ...redisEntries].sort(byEnqueuedAt);
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
            const stale = entries.filter(raw => {
              try {
                const parsed = JSON.parse(raw) as QueuedMessagePayload;
                return new Date(parsed.enqueuedAt).getTime() <= cutoff;
              } catch {
                logger.error('RedisDeliveryQueue: malformed entry in cleanup, dropping', { key, raw: raw.substring(0, 120) });
                return true;
              }
            });

            if (stale.length > 0) {
              const removed = await redis.eval(PRUNE_STALE_LUA, 1, key, ...stale);
              totalRemoved += typeof removed === 'number' ? removed : stale.length;
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
