# Unified Cache Architecture — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual Redis connections (RedisWrapper singleton + server.ts raw ioredis) and the redundant cache implementations with a single `CacheStore` interface backed by `RedisCacheStore`, consumed everywhere via `MultiLevelCache<T>`.

**Architecture:** `CacheStore` is the abstract interface for any remote cache backend. `RedisCacheStore` implements it with ioredis + circuit breaker + retry + error suppression. `MultiLevelCache<T>` provides L1 in-memory + L2 `CacheStore` with independent TTLs and JSON serialization. All services receive `MultiLevelCache<T>` instances or access `CacheStore` directly for simple ops. One TCP connection to Redis for the entire process.

**Tech Stack:** TypeScript, ioredis, Fastify 5, Jest/Vitest

**Scope:** ~20 files modified/created/deleted in `services/gateway/src/`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `services/CacheStore.ts` | `CacheStore` interface + `RedisCacheStore` implementation + `getCacheStore()` singleton |

### Modified files
| File | Change |
|------|--------|
| `services/MultiLevelCache.ts` | Already updated — accepts `CacheStore`, fix `remoteTtlSeconds` |
| `services/MultiLevelJobMappingCache.ts` | Constructor accepts `CacheStore` instead of `Redis` |
| `services/message-translation/MessageTranslationService.ts` | Remove `redis` param, accept `MultiLevelJobMappingCache` only |
| `server.ts` | Remove `new Redis()`, remove `this.redis`, use `getCacheStore()` |
| `middleware/auth.ts` | Replace `getRedisWrapper()` → `MultiLevelCache<string>` from shared instance |
| `middleware/rate-limit.ts` | `getCacheStore().getNativeClient()` for `@fastify/rate-limit` |
| `services/StatusService.ts` | Replace `getRedisWrapper()` → `getCacheStore()` |
| `services/MentionService.ts` | Replace `getRedisWrapper()` → `getCacheStore()` |
| `services/MagicLinkService.ts` | Replace `RedisWrapper` type → `CacheStore` |
| `services/PasswordResetService.ts` | Replace `RedisWrapper` → `CacheStore`, fix atomic setnx |
| `services/PhonePasswordResetService.ts` | Replace `RedisWrapper` → `CacheStore` |
| `services/PhoneTransferService.ts` | Replace `RedisWrapper` → `CacheStore` |
| `services/TranslationCache.ts` | Replace internals with `MultiLevelCache<TranslationCacheEntry>` |
| `routes/admin/agent.ts` | Replace `getRedisWrapper()` → `getCacheStore()` |
| `routes/admin/roles.ts` | Replace `getRedisWrapper()` → `getCacheStore()` |
| `routes/users/profile.ts` | Replace `getRedisWrapper()` → `getCacheStore()` |
| `routes/users/contact-change.ts` | Replace `getRedisWrapper()` → `getCacheStore()` |
| `routes/magic-link.ts` | Replace `getRedisWrapper()` → `getCacheStore()` |
| `routes/password-reset.ts` | Replace `getRedisWrapper()` → `getCacheStore()` |
| `routes/auth/index.ts` | Replace `getRedisWrapper()` → `getCacheStore()` |
| `routes/auth/types.ts` | Replace `RedisWrapper` type → `CacheStore` |
| `socketio/MeeshySocketIOHandler.ts` | Remove `redis` param |
| `socketio/MeeshySocketIOManager.ts` | Remove `redis` param |

### Deleted files
| File | Reason |
|------|--------|
| `services/RedisWrapper.ts` | Replaced by `CacheStore.ts` (`RedisCacheStore`) |
| `services/ConversationListCache.ts` | Dead code (never functional) |
| `__tests__/unit/services/RedisWrapper.test.ts` | Replaced by `CacheStore.test.ts` |

### Test files
| File | Purpose |
|------|---------|
| `__tests__/unit/services/CacheStore.test.ts` | Unit tests for `RedisCacheStore` + `CacheStore` contract |

---

## Chunk 1: CacheStore Interface + RedisCacheStore

### Task 1: Create `CacheStore` interface and `RedisCacheStore`

**Files:**
- Create: `services/gateway/src/services/CacheStore.ts`
- Test: `services/gateway/src/__tests__/unit/services/CacheStore.test.ts`

- [ ] **Step 1: Write failing test — CacheStore contract via RedisCacheStore (memory fallback)**

In `__tests__/unit/services/CacheStore.test.ts`:

```typescript
import { RedisCacheStore } from '../../services/CacheStore';

describe('RedisCacheStore (memory fallback mode)', () => {
  let store: RedisCacheStore;

  beforeEach(() => {
    // No Redis URL → pure memory mode
    store = new RedisCacheStore();
  });

  afterEach(async () => {
    await store.close();
  });

  it('get returns null for missing key', async () => {
    expect(await store.get('missing')).toBeNull();
  });

  it('set and get round-trip', async () => {
    await store.set('key1', 'value1');
    expect(await store.get('key1')).toBe('value1');
  });

  it('set with TTL expires entry', async () => {
    await store.set('ttl-key', 'val', 1); // 1 second TTL
    expect(await store.get('ttl-key')).toBe('val');
    await new Promise(r => setTimeout(r, 1100));
    expect(await store.get('ttl-key')).toBeNull();
  });

  it('del removes entry', async () => {
    await store.set('del-key', 'val');
    await store.del('del-key');
    expect(await store.get('del-key')).toBeNull();
  });

  it('setnx returns true on new key, false on existing', async () => {
    expect(await store.setnx('nx-key', 'val1', 60)).toBe(true);
    expect(await store.setnx('nx-key', 'val2', 60)).toBe(false);
    expect(await store.get('nx-key')).toBe('val1');
  });

  it('keys returns matching keys', async () => {
    await store.set('prefix:a', '1');
    await store.set('prefix:b', '2');
    await store.set('other:c', '3');
    const keys = await store.keys('prefix:*');
    expect(keys.sort()).toEqual(['prefix:a', 'prefix:b']);
  });

  it('isAvailable returns false without Redis', () => {
    expect(store.isAvailable()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/gateway && npx jest __tests__/unit/services/CacheStore.test.ts --no-coverage 2>&1 | tail -10`
Expected: FAIL — `Cannot find module '../../services/CacheStore'`

- [ ] **Step 3: Implement `CacheStore` interface and `RedisCacheStore`**

Create `services/gateway/src/services/CacheStore.ts`:

```typescript
/**
 * CacheStore — Abstract interface for remote cache backends.
 * RedisCacheStore is the production implementation.
 * Any backend (Memcached, DynamoDB, etc.) can implement this interface.
 */

import Redis from 'ioredis';
import { enhancedLogger } from '../utils/logger-enhanced';
import { CircuitBreakerFactory, circuitBreakerManager, CircuitState } from '../utils/circuitBreaker';

const logger = enhancedLogger.child({ module: 'CacheStore' });

// ============================================================================
// Interface
// ============================================================================

export interface CacheStore {
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
}

// ============================================================================
// Redis Implementation
// ============================================================================

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

export class RedisCacheStore implements CacheStore {
  private redis: Redis | null = null;
  private memoryFallback: Map<string, MemoryEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private circuitBreaker = CircuitBreakerFactory.createRedisBreaker();

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL;
    if (url) {
      this.initializeRedis(url);
    }
    this.startCleanup();
    circuitBreakerManager.register('redis', this.circuitBreaker);
  }

  private initializeRedis(url: string): void {
    try {
      this.redis = new Redis(url, {
        retryStrategy: (times: number) => {
          if (times > 3) {
            logger.warn('⚠️ Redis max retries reached — falling back to memory');
            return null;
          }
          return Math.min(times * 1000, 3000);
        },
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        lazyConnect: true,
        enableOfflineQueue: false,
        autoResubscribe: false,
        autoResendUnfulfilledCommands: false,
      });

      this.redis.on('connect', () => {
        logger.info('✅ Redis connected');
      });

      this.redis.on('error', (error) => {
        const suppress = ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT'];
        if (!suppress.some(code => error.message?.includes(code))) {
          logger.warn('⚠️ Redis error', { error: error.message });
        }
      });

      this.redis.on('close', () => {
        logger.warn('⚠️ Redis connection lost — using memory fallback');
      });

      this.redis.connect().catch(() => {
        logger.warn('⚠️ Redis connection failed — using memory only');
      });
    } catch {
      logger.warn('⚠️ Redis init failed — using memory only');
      this.redis = null;
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.memoryFallback.entries()) {
        if (entry.expiresAt < now) this.memoryFallback.delete(key);
      }
    }, 60_000);
  }

  // --- CacheStore methods ---

  async get(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        return await this.circuitBreaker.execute(() => this.redis!.get(key));
      } catch { /* fall through */ }
    }
    const entry = this.memoryFallback.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.value;
    if (entry) this.memoryFallback.delete(key);
    return null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.redis) {
      try {
        await this.circuitBreaker.execute(() =>
          ttlSeconds ? this.redis!.set(key, value, 'EX', ttlSeconds) : this.redis!.set(key, value)
        );
        return;
      } catch { /* fall through */ }
    }
    this.memoryFallback.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds ? ttlSeconds * 1000 : 3_600_000),
    });
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.circuitBreaker.execute(() => this.redis!.del(key));
        return;
      } catch { /* fall through */ }
    }
    this.memoryFallback.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    if (this.redis) {
      try {
        return await this.circuitBreaker.execute(() => this.redis!.keys(pattern)) as string[];
      } catch { /* fall through */ }
    }
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return [...this.memoryFallback.keys()].filter(k => regex.test(k));
  }

  async setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (this.redis) {
      try {
        // Atomic SET NX EX — fixes the non-atomic setnx+expire bug
        const result = await this.circuitBreaker.execute(() =>
          ttlSeconds
            ? this.redis!.set(key, value, 'EX', ttlSeconds, 'NX')
            : this.redis!.setnx(key, value)
        );
        return result === 'OK' || result === 1;
      } catch { /* fall through */ }
    }
    const existing = this.memoryFallback.get(key);
    if (existing && existing.expiresAt > Date.now()) return false;
    this.memoryFallback.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds ? ttlSeconds * 1000 : 3_600_000),
    });
    return true;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (this.redis) {
      try {
        const result = await this.circuitBreaker.execute(() => this.redis!.expire(key, seconds));
        return result === 1;
      } catch { /* fall through */ }
    }
    const entry = this.memoryFallback.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + seconds * 1000;
    return true;
  }

  async publish(channel: string, message: string): Promise<number> {
    if (this.redis) {
      try {
        return await this.circuitBreaker.execute(() => this.redis!.publish(channel, message)) as number;
      } catch { return 0; }
    }
    return 0;
  }

  async info(section?: string): Promise<string> {
    if (this.redis) {
      try {
        return await this.circuitBreaker.execute(() => this.redis!.info(section)) as string;
      } catch { /* fall through */ }
    }
    return `# Memory\nused_memory_human:${(this.memoryFallback.size * 100 / 1024).toFixed(2)}KB\n# Keyspace\ndb0:keys=${this.memoryFallback.size}`;
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
      try { this.redis.disconnect(); } catch {}
      this.redis = null;
    }
    this.memoryFallback.clear();
  }

  getNativeClient(): Redis | null {
    return this.redis;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let sharedStore: CacheStore | null = null;

export function getCacheStore(): CacheStore {
  if (!sharedStore) {
    sharedStore = new RedisCacheStore();
  }
  return sharedStore;
}

export function resetCacheStore(): void {
  if (sharedStore) {
    sharedStore.close();
    sharedStore = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/gateway && npx jest __tests__/unit/services/CacheStore.test.ts --no-coverage 2>&1 | tail -10`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/CacheStore.ts services/gateway/src/__tests__/unit/services/CacheStore.test.ts
git commit -m "feat(gateway): add CacheStore interface + RedisCacheStore implementation

Abstract interface for remote cache backends. RedisCacheStore implements
it with ioredis + circuit breaker + retry + memory fallback.
Atomic setnx with TTL (SET NX EX) replaces the non-atomic setnx+expire pattern."
```

---

## Chunk 2: Update MultiLevelCache + MultiLevelJobMappingCache

### Task 2: Wire MultiLevelCache to CacheStore and fix MultiLevelJobMappingCache

**Files:**
- Modify: `services/gateway/src/services/MultiLevelCache.ts` (already partially done — verify `remoteTtlSeconds`)
- Modify: `services/gateway/src/services/MultiLevelJobMappingCache.ts`

- [ ] **Step 1: Verify MultiLevelCache uses `CacheStore` and `remoteTtlSeconds`**

Read `MultiLevelCache.ts` and confirm:
- `import type { CacheStore } from './CacheStore'` (or inline interface)
- Constructor option `store?: CacheStore` (not `redis?: Redis`)
- Uses `remoteTtlSeconds` (not `redisTtlSeconds`)
- `set()` calls `this.store.set(key, value, this.remoteTtlSeconds)`
- `get()` calls `this.store.get(key)`
- `delete()` calls `this.store.del(key)`
- `clear()` calls `this.store.keys(pattern)` + `this.store.del(key)` in loop

If not yet done, update the file. The interface is already defined inline in `MultiLevelCache.ts` — ensure it matches `CacheStore` from `CacheStore.ts`. Import the type to avoid duplication:

```typescript
import type { CacheStore } from './CacheStore';
```

Remove the local `CacheStore` interface definition if it exists in `MultiLevelCache.ts`.

- [ ] **Step 2: Update MultiLevelJobMappingCache constructor**

In `MultiLevelJobMappingCache.ts`, change:

```typescript
// BEFORE
import { Redis } from 'ioredis';

export class MultiLevelJobMappingCache {
  constructor(redis?: Redis) {
    this.cache = new MultiLevelCache<JobMetadata>({
      name: 'JobMapping',
      memoryTtlMs: 30 * 60 * 1000,
      redisTtlSeconds: 3600,  // BUG: wrong option name
      keyPrefix: 'backend_job:',
      redis
    });
  }
}

// AFTER
import type { CacheStore } from './CacheStore';

export class MultiLevelJobMappingCache {
  constructor(store?: CacheStore) {
    this.cache = new MultiLevelCache<JobMetadata>({
      name: 'JobMapping',
      memoryTtlMs: 30 * 60 * 1000,
      remoteTtlSeconds: 3600,
      keyPrefix: 'backend_job:',
      store
    });
  }
}
```

- [ ] **Step 3: Build to verify**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | head -20`
Expected: Compilation errors in files that still pass `Redis` to `MultiLevelJobMappingCache` (server.ts, MessageTranslationService.ts) — this is expected; we fix them in Chunk 3.

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/services/MultiLevelCache.ts services/gateway/src/services/MultiLevelJobMappingCache.ts
git commit -m "refactor(gateway): MultiLevelCache uses CacheStore interface, fix remoteTtlSeconds

MultiLevelJobMappingCache now accepts CacheStore instead of ioredis Redis.
Fixed option name from redisTtlSeconds (ignored) to remoteTtlSeconds."
```

---

## Chunk 3: Migrate server.ts — Remove Raw Redis

### Task 3: Remove the duplicate Redis connection from server.ts

**Files:**
- Modify: `services/gateway/src/server.ts`
- Modify: `services/gateway/src/services/message-translation/MessageTranslationService.ts`
- Modify: `services/gateway/src/socketio/MeeshySocketIOHandler.ts`
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts`
- Modify: `services/gateway/src/middleware/rate-limit.ts`

- [ ] **Step 1: Update MessageTranslationService — remove `redis` param**

```typescript
// BEFORE
constructor(prisma: PrismaClient, redis?: Redis, jobMappingCache?: MultiLevelJobMappingCache) {
  this.redis = redis || null;
  this.jobMappingService = jobMappingCache || new MultiLevelJobMappingCache(this.redis || undefined);
}

// AFTER
constructor(prisma: PrismaClient, jobMappingCache?: MultiLevelJobMappingCache) {
  this.jobMappingService = jobMappingCache || new MultiLevelJobMappingCache();
}
```

Remove `private redis: Redis | null` property and `import { Redis } from 'ioredis'` if no longer needed.

- [ ] **Step 2: Update MeeshySocketIOHandler — remove `redis` param**

```typescript
// BEFORE
constructor(
  private readonly prisma: PrismaClient,
  private readonly jwtSecret: string,
  private readonly translationService: MessageTranslationService,
  private readonly redis?: any
)

// AFTER
constructor(
  private readonly prisma: PrismaClient,
  private readonly jwtSecret: string,
  private readonly translationService: MessageTranslationService,
)
```

Update the `MeeshySocketIOManager` instantiation inside to not pass `this.redis`.

- [ ] **Step 3: Update MeeshySocketIOManager — remove `redis` param**

Remove `redis?: any` from constructor parameters (it was received but never used).

- [ ] **Step 4: Update server.ts**

Remove:
- `import { Redis } from 'ioredis';`
- `private redis: Redis | null = null;`
- The entire Redis initialization block (lines ~340-380)
- `this.server.decorate('redis', this.redis);`

Add:
- `import { getCacheStore } from './services/CacheStore';`

Update service initialization:
```typescript
// Job mapping cache — uses shared CacheStore
this.jobMappingCache = new MultiLevelJobMappingCache(getCacheStore());

// Translation service — no longer needs Redis
this.translationService = new MessageTranslationService(this.prisma, this.jobMappingCache);

// Socket.IO handler — no longer needs Redis
this.socketIOHandler = new MeeshySocketIOHandler(
  this.prisma,
  config.jwtSecret,
  this.translationService,
);
```

For the Fastify decorator (used by `@fastify/rate-limit`):
```typescript
this.server.decorate('redis', getCacheStore().getNativeClient());
```

- [ ] **Step 5: Update rate-limit.ts**

Line 67: `redis: (fastify as any).redis` — this now gets the native client from `CacheStore`. No change needed in this file since `server.ts` already decorates with the native client.

- [ ] **Step 6: Build to verify**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | head -20`
Expected: Remaining errors in files that still import `getRedisWrapper` — fixed in Chunk 4.

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src/server.ts \
       services/gateway/src/services/message-translation/MessageTranslationService.ts \
       services/gateway/src/socketio/MeeshySocketIOHandler.ts \
       services/gateway/src/socketio/MeeshySocketIOManager.ts
git commit -m "refactor(gateway): remove duplicate Redis connection from server.ts

server.ts no longer creates its own ioredis connection. All Redis access
goes through the shared CacheStore singleton. MeeshySocketIOHandler and
MeeshySocketIOManager no longer receive an unused redis parameter.
MessageTranslationService no longer accepts redis — uses shared job mapping cache."
```

---

## Chunk 4: Migrate All RedisWrapper Consumers

### Task 4: Replace `getRedisWrapper()` with `getCacheStore()` in all services

**Files:**
- Modify: `services/gateway/src/middleware/auth.ts`
- Modify: `services/gateway/src/services/StatusService.ts`
- Modify: `services/gateway/src/services/MentionService.ts`
- Modify: `services/gateway/src/services/TranslationCache.ts`
- Modify: `services/gateway/src/routes/admin/agent.ts`

For each file, the pattern is the same:

```typescript
// BEFORE
import { getRedisWrapper } from '../services/RedisWrapper';
const redis = getRedisWrapper();
await redis.get(key);
await redis.set(key, value, ttl);

// AFTER
import { getCacheStore } from '../services/CacheStore';
const cache = getCacheStore();
await cache.get(key);
await cache.set(key, value, ttl);
```

- [ ] **Step 1: Migrate `auth.ts`**

Replace `import { getRedisWrapper } from '../services/RedisWrapper'` → `import { getCacheStore } from '../services/CacheStore'`.
Replace `const redis = getRedisWrapper()` → `const cache = getCacheStore()`.
Replace `redis.get(...)` → `cache.get(...)`, `redis.set(...)` → `cache.set(...)`.

- [ ] **Step 2: Migrate `StatusService.ts`**

Same pattern. Replace `this.redis = getRedisWrapper()` → `this.cache = getCacheStore()`.
Replace all `this.redis.setex(key, ttl, value)` → `this.cache.set(key, value, ttl)` (note: argument order differs — `setex` was `(key, ttl, value)`, `set` is `(key, value, ttl)`).
Replace `this.redis.del(key)` → `this.cache.del(key)`.

- [ ] **Step 3: Migrate `MentionService.ts`**

Same pattern. Replace `getRedisWrapper()` → `getCacheStore()`.
Replace `this.redis.setex(key, ttl, value)` → `this.cache.set(key, value, ttl)`.
Replace `this.redis.get(key)` → `this.cache.get(key)`.
Replace `this.redis.keys(pattern)` → `this.cache.keys(pattern)`.
Replace `this.redis.getCacheStats()` → remove (or use `this.cache.isAvailable()`).

- [ ] **Step 4: Migrate `TranslationCache.ts`**

Same pattern. Replace all `getRedisWrapper()` → `getCacheStore()`.
Replace `this.redis.setex(key, ttl, value)` → `this.cache.set(key, value, ttl)`.
Replace `this.redis.info(section)` → `this.cache.info(section)`.
Remove `getCacheStats()` call.

- [ ] **Step 5: Migrate `routes/admin/agent.ts`**

Replace `getRedisWrapper()` → `getCacheStore()`.
Replace `redis.publish(channel, message)` → `cache.publish(channel, message)`.

- [ ] **Step 6: Build to verify**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | head -20`
Expected: Remaining errors only in files with injected `RedisWrapper` type — fixed in Task 5.

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src/middleware/auth.ts \
       services/gateway/src/services/StatusService.ts \
       services/gateway/src/services/MentionService.ts \
       services/gateway/src/services/TranslationCache.ts \
       services/gateway/src/routes/admin/agent.ts
git commit -m "refactor(gateway): migrate singleton consumers from getRedisWrapper to getCacheStore

auth.ts, StatusService, MentionService, TranslationCache, admin/agent
now use getCacheStore() instead of getRedisWrapper(). All setex(key, ttl, value)
calls converted to set(key, value, ttl) argument order."
```

---

### Task 5: Replace injected `RedisWrapper` type with `CacheStore` in services

**Files:**
- Modify: `services/gateway/src/services/MagicLinkService.ts`
- Modify: `services/gateway/src/services/PasswordResetService.ts`
- Modify: `services/gateway/src/services/PhonePasswordResetService.ts`
- Modify: `services/gateway/src/services/PhoneTransferService.ts`
- Modify: `services/gateway/src/routes/auth/index.ts`
- Modify: `services/gateway/src/routes/auth/types.ts`
- Modify: `services/gateway/src/routes/magic-link.ts`
- Modify: `services/gateway/src/routes/password-reset.ts`
- Modify: `services/gateway/src/routes/users/profile.ts`
- Modify: `services/gateway/src/routes/users/contact-change.ts`
- Modify: `services/gateway/src/routes/admin/roles.ts`

For services with injected `RedisWrapper`:

```typescript
// BEFORE
import { RedisWrapper } from './RedisWrapper';
constructor(prisma: PrismaClient, redis: RedisWrapper) {
  this.redis = redis;
}

// AFTER
import type { CacheStore } from './CacheStore';
constructor(prisma: PrismaClient, cache: CacheStore) {
  this.cache = cache;
}
```

For route files that call `getRedisWrapper()`:

```typescript
// BEFORE
import { getRedisWrapper } from '../services/RedisWrapper';
const redis = getRedisWrapper();

// AFTER
import { getCacheStore } from '../services/CacheStore';
const cache = getCacheStore();
```

- [ ] **Step 1: Migrate MagicLinkService, PasswordResetService, PhonePasswordResetService, PhoneTransferService**

For each: change constructor param type from `RedisWrapper` to `CacheStore`.
Rename internal property from `this.redis` to `this.cache`.
Replace `this.redis.setex(key, ttl, value)` → `this.cache.set(key, value, ttl)`.
Replace `this.redis.setnx(key, value)` + `this.redis.expire(key, ttl)` → `this.cache.setnx(key, value, ttl)` (atomic).

**PasswordResetService specific fix — atomic lock:**
```typescript
// BEFORE (non-atomic)
const acquired = await this.redis.setnx(lockKey, lockValue);
if (acquired === 1) {
  await this.redis.expire(lockKey, 10);
}

// AFTER (atomic SET NX EX)
const acquired = await this.cache.setnx(lockKey, lockValue, 10);
```

- [ ] **Step 2: Migrate route files**

For `routes/auth/index.ts`, `routes/auth/types.ts`, `routes/magic-link.ts`, `routes/password-reset.ts`:
Replace `RedisWrapper` import and type with `CacheStore`.
Replace `getRedisWrapper()` with `getCacheStore()`.

For `routes/users/profile.ts`, `routes/users/contact-change.ts`, `routes/admin/roles.ts`:
Replace `getRedisWrapper()` → `getCacheStore()`.
Replace `redis.del(key)` → `cache.del(key)`.

- [ ] **Step 3: Build to verify — zero errors**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | head -20`
Expected: NO ERRORS — all RedisWrapper references should be gone.

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/services/MagicLinkService.ts \
       services/gateway/src/services/PasswordResetService.ts \
       services/gateway/src/services/PhonePasswordResetService.ts \
       services/gateway/src/services/PhoneTransferService.ts \
       services/gateway/src/routes/auth/index.ts \
       services/gateway/src/routes/auth/types.ts \
       services/gateway/src/routes/magic-link.ts \
       services/gateway/src/routes/password-reset.ts \
       services/gateway/src/routes/users/profile.ts \
       services/gateway/src/routes/users/contact-change.ts \
       services/gateway/src/routes/admin/roles.ts
git commit -m "refactor(gateway): migrate injected services and routes to CacheStore

MagicLinkService, PasswordResetService, PhonePasswordResetService,
PhoneTransferService now accept CacheStore instead of RedisWrapper.
PasswordResetService lock uses atomic setnx(key, value, ttlSeconds).
All route files migrated from getRedisWrapper to getCacheStore."
```

---

## Chunk 5: Delete Old Code + Update Tests

### Task 6: Delete RedisWrapper, ConversationListCache, update tests

**Files:**
- Delete: `services/gateway/src/services/RedisWrapper.ts`
- Delete: `services/gateway/src/services/ConversationListCache.ts`
- Delete: `services/gateway/src/__tests__/unit/services/RedisWrapper.test.ts`
- Modify: `services/gateway/src/__tests__/password-reset.service.test.ts` (update mock)
- Modify: `services/gateway/src/__tests__/unit/services/MentionService.test.ts` (update mock)

- [ ] **Step 1: Delete old files**

```bash
rm services/gateway/src/services/RedisWrapper.ts
rm services/gateway/src/services/ConversationListCache.ts
rm services/gateway/src/__tests__/unit/services/RedisWrapper.test.ts
```

- [ ] **Step 2: Search for any remaining RedisWrapper references**

Run: `grep -rn "RedisWrapper\|getRedisWrapper\|ConversationListCache" services/gateway/src/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"`
Expected: ZERO results (no production code references)

- [ ] **Step 3: Update test files that mock RedisWrapper**

For `password-reset.service.test.ts` and `MentionService.test.ts`:
Replace `import { RedisWrapper } from` → `import type { CacheStore } from`
Replace mock class to implement `CacheStore` interface instead of `RedisWrapper`.

Simple mock pattern:
```typescript
function createMockCacheStore(): CacheStore {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    get: async (key) => store.get(key)?.value ?? null,
    set: async (key, value, ttl) => { store.set(key, { value, expiresAt: Date.now() + (ttl || 3600) * 1000 }); },
    del: async (key) => { store.delete(key); },
    keys: async (pattern) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return [...store.keys()].filter(k => regex.test(k));
    },
    setnx: async (key, value, ttl) => {
      if (store.has(key)) return false;
      store.set(key, { value, expiresAt: Date.now() + (ttl || 3600) * 1000 });
      return true;
    },
    expire: async () => true,
    publish: async () => 0,
    info: async () => '',
    isAvailable: () => false,
    close: async () => { store.clear(); },
    getNativeClient: () => null,
  };
}
```

- [ ] **Step 4: Remove ConversationListCache imports from conversations route**

Search: `grep -rn "ConversationListCache\|conversationListCache\|invalidateConversationCacheAsync" services/gateway/src/ --include="*.ts"`
Remove any remaining imports or references.

- [ ] **Step 5: Build + run all tests**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | head -5`
Expected: NO ERRORS

Run: `cd services/gateway && npx jest --no-coverage 2>&1 | tail -20`
Expected: ALL PASS (or pre-existing failures only)

- [ ] **Step 6: Commit**

```bash
git add -A services/gateway/src/
git commit -m "refactor(gateway): delete RedisWrapper + ConversationListCache, update test mocks

RedisWrapper replaced by CacheStore (RedisCacheStore). ConversationListCache
was dead code (never functional). Test mocks updated to implement CacheStore interface.
Single Redis TCP connection for the entire process."
```

---

## Post-Implementation Verification

- [ ] **Step 1: Full TypeScript check**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | head -5`
Expected: No errors

- [ ] **Step 2: Run all gateway tests**

Run: `cd services/gateway && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 3: Verify no RedisWrapper references remain**

Run: `grep -rn "RedisWrapper\|getRedisWrapper" services/gateway/src/ --include="*.ts"`
Expected: ZERO results

- [ ] **Step 4: Verify single Redis connection pattern**

Run: `grep -rn "new Redis(" services/gateway/src/ --include="*.ts" | grep -v test | grep -v __tests__`
Expected: Only ONE result in `CacheStore.ts`

- [ ] **Step 5: Docker build test**

Run: `docker build -f services/gateway/Dockerfile . 2>&1 | tail -10`
Expected: Build succeeds (the original tsc error that started this session is also fixed)
