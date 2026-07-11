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

// Idempotent-vs-superseding enqueue, keyed on (dedup identity, eventType).
// The dedup identity is the entry's `dedupKey` if set, else its `messageId` —
// a queued 'new' must NOT block a later 'edited' or 'deleted' for the same
// message — those are distinct events that must all replay on drain, in FIFO
// order, so the recipient's final state matches the sender's (edit/delete
// after an offline 'new' must not be dropped). Reactions set `dedupKey` to
// something finer than messageId (see QueuedMessagePayload.dedupKey) so two
// different reactors on the same message don't collapse into one entry.
//
// 'new' is the only truly IMMUTABLE eventType (a retry of an identical event) —
// a matching 'new' is dropped (return 0), keeping the first entry. Every other
// eventType ('edited'/'deleted'/'reaction-added'/'reaction-removed') is
// MUTABLE: the LATEST payload must win. A message edited twice while a
// recipient is offline enqueues two 'edited' entries under the same dedup
// identity; keeping the first would replay stale intermediate content on
// drain. So a matching mutable entry is SUPERSEDED in place (LSET at its FIFO
// slot, return 2) rather than dropped — preserving the one-entry-per-(dedup
// identity, eventType) invariant the drain/prune paths rely on while carrying
// the newest content and enqueuedAt.
//
// Returns 1 when pushed as a new entry, 0 when an identical 'new' was deduped,
// 2 when a mutable entry was superseded in place.
// KEYS[1] = queue key, ARGV[1] = serialized entry, ARGV[2] = dedup id,
// ARGV[3] = TTL, ARGV[4] = normalized eventType
const ENQUEUE_DEDUP_LUA = `
local entries = redis.call('LRANGE', KEYS[1], 0, -1)
for i, entry in ipairs(entries) do
  local ok, decoded = pcall(cjson.decode, entry)
  if ok and decoded then
    local decodedDedupId = decoded.dedupKey or decoded.messageId
    if decodedDedupId == ARGV[2] then
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
// (dedupId, eventType) dedup at enqueue guarantees each raw value is unique,
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

// Parse a Redis LRANGE result into typed entries, dropping (not throwing on)
// any value that fails to decode so one corrupt entry can never poison a whole
// drain/peek. `context` names the caller for the diagnostic log line.
function parseRawEntries(raw: string[], userId: string, context: 'drain' | 'peek'): QueuedMessagePayload[] {
  return raw.flatMap(entry => {
    try {
      return [JSON.parse(entry) as QueuedMessagePayload];
    } catch {
      logger.error(`RedisDeliveryQueue: malformed entry in ${context}, dropping`, { userId, raw: entry.substring(0, 120) });
      return [];
    }
  });
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

// Dedup identity: the same key enqueue() keeps unique per slice — the entry's
// `dedupKey` if set (reactions scope it to messageId:reactor:emoji), else its
// `messageId` — paired with the normalized eventType. Mirrors ENQUEUE_DEDUP_LUA
// and the memory-path findIndex.
function dedupIdentity(entry: QueuedMessagePayload): string {
  return `${entry.dedupKey ?? entry.messageId}\u0000${normalizedEventType(entry)}`;
}

// Collapse duplicate (dedup identity, eventType) entries left by MERGING the
// memory-fallback and Redis slices. enqueue() enforces one-entry-per-identity
// WITHIN each slice independently (Redis via ENQUEUE_DEDUP_LUA, memory via
// findIndex), but a mid-outage interleave can leave one copy in EACH slice —
// e.g. an 'edited' for message M reached Redis, then a transient blip sent the
// next 'edited' to memory. Concatenating both replays the event twice:
// harmless-but-redundant for an idempotent edit/reaction, a DUPLICATE message
// bubble for a 'new'. Keep only the newest copy per identity — the same
// supersede rule enqueue() applies in-slice — restoring the one-entry-per-
// identity invariant the drain/peek consumers rely on. Input is assumed already
// byEnqueuedAt-sorted (ascending); walking newest→oldest keeps the newest copy
// at its own slot, so the surviving order stays byEnqueuedAt.
function collapseCrossSliceDuplicates(sorted: QueuedMessagePayload[]): QueuedMessagePayload[] {
  const seen = new Set<string>();
  const kept: QueuedMessagePayload[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const identity = dedupIdentity(sorted[i]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    kept.push(sorted[i]);
  }
  return kept.reverse();
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
    const dedupId = entry.dedupKey ?? entry.messageId;

    if (redis) {
      try {
        const key = queueKey(userId);
        const pushed = await redis.eval(
          ENQUEUE_DEDUP_LUA, 1, key,
          serialized, dedupId, String(DELIVERY_QUEUE_TTL_SECONDS), normalizedEventType(entry)
        );
        if (pushed === 0) {
          logger.debug('Delivery queue dedup: dedup id already queued', { userId, dedupId, messageId: entry.messageId });
        } else if (pushed === 2) {
          logger.debug('Delivery queue supersede: mutable event replaced in place', { userId, dedupId, messageId: entry.messageId, eventType: normalizedEventType(entry) });
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
    const dupIndex = existing.findIndex(e => (e.dedupKey ?? e.messageId) === dedupId && normalizedEventType(e) === normalizedEventType(entry));
    if (dupIndex !== -1) {
      if (normalizedEventType(entry) === 'new') {
        logger.debug('Delivery queue dedup (memory): dedup id+eventType already queued', { userId, dedupId, eventType: normalizedEventType(entry) });
        return;
      }
      // Mutable event (edited/deleted/reaction-*): supersede in place with the
      // newest payload, mirroring ENQUEUE_DEDUP_LUA's LSET path.
      this.memoryQueue.set(userId, existing.map((e, i) => (i === dupIndex ? entry : e)));
      logger.debug('Delivery queue supersede (memory): mutable event replaced in place', { userId, dedupId, eventType: normalizedEventType(entry) });
      return;
    }
    const withNew = [...existing, entry];
    if (withNew.length <= MEMORY_QUEUE_MAX_PER_USER) {
      this.memoryQueue.set(userId, withNew);
      return;
    }
    // Over capacity: evict the chronologically-OLDEST entries by `enqueuedAt`,
    // NOT the head array slots. A mutable event superseded in place above keeps
    // its original, earlier slot while carrying a NEWER enqueuedAt, so slot 0 is
    // not necessarily the oldest — slicing by slot could drop the freshest
    // edit/delete/reaction and strand the recipient on stale content after
    // drain() (whose byEnqueuedAt sort cannot recover an entry already evicted
    // here). Same array-slot-vs-enqueuedAt divergence that byEnqueuedAt fixed for
    // the sibling drain path. Survivors keep their insertion order (drain()
    // re-sorts, but the memory-before-Redis tiebreak in byEnqueuedAt relies on
    // stable order).
    const evictCount = withNew.length - MEMORY_QUEUE_MAX_PER_USER;
    const evictIndices = new Set(
      withNew
        .map((e, index) => ({ ts: new Date(e.enqueuedAt).getTime(), index }))
        .sort((a, b) => a.ts - b.ts)
        .slice(0, evictCount)
        .map(({ index }) => index),
    );
    this.memoryQueue.set(userId, withNew.filter((_, index) => !evictIndices.has(index)));
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

        const redisEntries = !Array.isArray(rawEntries) ? [] : parseRawEntries(rawEntries as string[], userId, 'drain');
        return collapseCrossSliceDuplicates([...memoryEntries, ...redisEntries].sort(byEnqueuedAt));
      } catch (error) {
        logger.warn('Redis drain failed, falling back to memory', { userId, error });
      }
    }

    // Sort by enqueuedAt for the same reason the Redis-backed path does (line
    // above): a mutable event superseded in place (see enqueue()) keeps its
    // original, earlier array slot but carries a NEWER enqueuedAt, so raw array
    // order can disagree with chronological order. Returning unsorted here would
    // replay a re-added reaction (or a later edit) BEFORE an intervening remove,
    // converging the reconnecting offline user to a state the sender never had.
    return [...memoryEntries].sort(byEnqueuedAt);
  }

  async peek(userId: string, limit?: number): Promise<QueuedMessagePayload[]> {
    const redis = this.getRedis();
    const memoryEntries = this.memoryQueue.get(userId) ?? [];

    if (redis) {
      try {
        const key = queueKey(userId);

        // Fast path: no memory-fallback entries, so the Redis slice IS the whole
        // queue. Full-read (0, -1) and sort by enqueuedAt exactly like drain()
        // BEFORE applying the limit: ENQUEUE_DEDUP_LUA supersedes a mutable event
        // in place, keeping its original FIFO slot while stamping a NEWER
        // enqueuedAt, so raw list (slot) order can disagree with chronological
        // order. A bounded lrange(0, limit-1) would slice in slot order and could
        // drop the chronologically-earliest entry, reporting a replay order
        // drain() never produces.
        if (memoryEntries.length === 0) {
          const rawEntries = await redis.lrange(key, 0, -1);
          const sorted = parseRawEntries(rawEntries, userId, 'peek').sort(byEnqueuedAt);
          return limit ? sorted.slice(0, limit) : sorted;
        }

        // Mixed state: memory-fallback entries queued during a transient Redis
        // outage coexist with the Redis-backed slice after recovery. Merge and
        // order by enqueuedAt exactly like drain() so the preview reflects true
        // replay order (a memory entry can sort ahead of a Redis one), then
        // apply the limit across the merged set. Without this, peek() would omit
        // the memory-fallback entries entirely — the very orphaning drain()
        // guards against.
        const rawEntries = await redis.lrange(key, 0, -1);
        const merged = collapseCrossSliceDuplicates(
          [...memoryEntries, ...parseRawEntries(rawEntries, userId, 'peek')].sort(byEnqueuedAt)
        );
        return limit ? merged.slice(0, limit) : merged;
      } catch (error) {
        logger.warn('Redis peek failed, falling back to memory', { userId, error });
      }
    }

    const entries = this.memoryQueue.get(userId) ?? [];
    return limit ? entries.slice(0, limit) : [...entries];
  }

  async size(userId: string): Promise<number> {
    const redis = this.getRedis();
    const memoryCount = (this.memoryQueue.get(userId) ?? []).length;

    if (redis) {
      try {
        // Add the memory-fallback slice: entries stashed there during a transient
        // Redis outage are still pending until drain() replays them (drain merges
        // both slices). Returning llen alone would under-report the true backlog.
        return (await redis.llen(queueKey(userId))) + memoryCount;
      } catch (error) {
        logger.warn('Redis size failed, falling back to memory', { userId, error });
      }
    }

    return memoryCount;
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
