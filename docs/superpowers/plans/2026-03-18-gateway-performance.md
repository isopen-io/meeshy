# Gateway Performance Optimization Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate redundant database lookups on every socket event and REST request, add HTTP caching to read-heavy REST endpoints, and replace the fragile `permanentlyDisabled` Redis error handling with the existing circuit breaker.

**Architecture:** Three independent fixes across the gateway service. T1 extracts a shared cached `resolveConversationId` utility and wires it into all 7 call sites (5 REST route files + 2 socket files). T2 integrates the existing `CircuitBreaker` from `utils/circuitBreaker.ts` into `RedisWrapper`, replacing the `permanentlyDisabled` flag. T3 adds ETag + Cache-Control headers to 4 read-heavy REST endpoints. Each task is independent.

**Tech Stack:** TypeScript, Fastify 5, Socket.IO, ioredis, crypto (for ETag hashing)

---

## Chunk 1: ConversationId Cache (Task 1)

### Task 1: Extract shared `resolveConversationId` with in-memory cache

`resolveConversationId` is duplicated in **5 REST route files** and `normalizeConversationId` in **2 socket files** — each doing a Prisma lookup every call. The identifier→ObjectId mapping is **immutable**, so it can be cached indefinitely in-memory.

This task extracts a single shared utility with caching and wires all 7 call sites to use it.

**Files:**
- Create: `services/gateway/src/utils/conversation-id-cache.ts`
- Modify: `services/gateway/src/routes/conversations/core.ts:39-51` (remove local `resolveConversationId`, import shared)
- Modify: `services/gateway/src/routes/conversations/messages.ts:33-45` (remove local, import shared)
- Modify: `services/gateway/src/routes/conversations/messages-advanced.ts:31-43` (remove local, import shared)
- Modify: `services/gateway/src/routes/conversations/participants.ts:16-28` (remove local, import shared)
- Modify: `services/gateway/src/routes/conversations/sharing.ts:23-35` (remove local, import shared)
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts:174-199` (add cache to private method)
- Modify: `services/gateway/src/socketio/utils/socket-helpers.ts:78-100` (add cache to exported helper)

- [ ] **Step 1: Create shared cached utility**

Create `services/gateway/src/utils/conversation-id-cache.ts`:

```typescript
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// In-memory cache for identifier→ObjectId mapping
// Conversation identifiers are immutable — cache indefinitely
const cache = new Map<string, string>();

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export async function resolveConversationId(
  prisma: PrismaClient,
  identifier: string
): Promise<string | null> {
  if (OBJECT_ID_REGEX.test(identifier)) {
    return identifier;
  }

  const cached = cache.get(identifier);
  if (cached) return cached;

  const conversation = await prisma.conversation.findFirst({
    where: { identifier },
    select: { id: true }
  });

  if (conversation) {
    cache.set(identifier, conversation.id);
    return conversation.id;
  }

  return null;
}

export function getCachedConversationId(identifier: string): string | undefined {
  if (OBJECT_ID_REGEX.test(identifier)) return identifier;
  return cache.get(identifier);
}

export function cacheConversationId(identifier: string, objectId: string): void {
  cache.set(identifier, objectId);
}
```

- [ ] **Step 2: Replace `resolveConversationId` in all 5 route files**

For each file, remove the local `async function resolveConversationId(...)` definition and add the import:

```typescript
import { resolveConversationId } from '../../utils/conversation-id-cache';
```

Files to modify (remove local function, add import):
1. `services/gateway/src/routes/conversations/core.ts:39-51` — also remove unused `isValidMongoId` import if it was only used by the local function
2. `services/gateway/src/routes/conversations/messages.ts:33-45`
3. `services/gateway/src/routes/conversations/messages-advanced.ts:31-43`
4. `services/gateway/src/routes/conversations/participants.ts:16-28`
5. `services/gateway/src/routes/conversations/sharing.ts:23-35`

**IMPORTANT:** The local functions all have the same signature `(prisma: PrismaClient, identifier: string): Promise<string | null>` — the shared version matches. No call site changes needed, only the import.

Verify each file's local function signature matches before replacing. If any file has a different signature, adapt accordingly.

- [ ] **Step 3: Add cache to `MeeshySocketIOManager.normalizeConversationId`**

Read `services/gateway/src/socketio/MeeshySocketIOManager.ts`. Add a private `Map` property and update the private method (lines 174-199):

```typescript
// Add as class property:
private conversationIdCache = new Map<string, string>();

// Update method:
private async normalizeConversationId(conversationId: string): Promise<string> {
  try {
    if (/^[0-9a-fA-F]{24}$/.test(conversationId)) {
      return conversationId;
    }

    const cached = this.conversationIdCache.get(conversationId);
    if (cached) return cached;

    const conversation = await this.prisma.conversation.findUnique({
      where: { identifier: conversationId },
      select: { id: true, identifier: true }
    });

    if (conversation) {
      this.conversationIdCache.set(conversationId, conversation.id);
      return conversation.id;
    }

    return conversationId;
  } catch (error) {
    logger.error('❌ [NORMALIZE] Erreur normalisation', error);
    return conversationId;
  }
}
```

- [ ] **Step 4: Add cache to `socket-helpers.ts` `normalizeConversationId`**

Read `services/gateway/src/socketio/utils/socket-helpers.ts`. Add a module-level cache before the function:

```typescript
const conversationIdCache = new Map<string, string>();

export async function normalizeConversationId(
  conversationId: string,
  prismaFindUnique: (where: { identifier: string }) => Promise<{ id: string; identifier: string } | null>
): Promise<string> {
  try {
    if (/^[0-9a-fA-F]{24}$/.test(conversationId)) {
      return conversationId;
    }

    const cached = conversationIdCache.get(conversationId);
    if (cached) return cached;

    const conversation = await prismaFindUnique({ identifier: conversationId });

    if (conversation) {
      conversationIdCache.set(conversationId, conversation.id);
      return conversation.id;
    }

    return conversationId;
  } catch (error) {
    console.error('❌ [NORMALIZE] Erreur normalisation:', error);
    return conversationId;
  }
}
```

- [ ] **Step 5: Build gateway**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/utils/conversation-id-cache.ts services/gateway/src/routes/conversations/core.ts services/gateway/src/routes/conversations/messages.ts services/gateway/src/routes/conversations/messages-advanced.ts services/gateway/src/routes/conversations/participants.ts services/gateway/src/routes/conversations/sharing.ts services/gateway/src/socketio/MeeshySocketIOManager.ts services/gateway/src/socketio/utils/socket-helpers.ts
git commit -m "perf(gateway): extract shared resolveConversationId with in-memory cache

Deduplicates 5 identical resolveConversationId functions across route files
into a single shared utility. Adds in-memory caching to all 7 call sites
(5 REST + 2 socket). Identifier→ObjectId mapping is immutable — cached
indefinitely, eliminating DB lookups after first access."
```

---

## Chunk 2: Redis Resilience (Task 2)

### Task 2: Replace `permanentlyDisabled` with existing `CircuitBreaker`

`RedisWrapper` currently sets `permanentlyDisabled = true` on ANY error (connection close, operation timeout, connection failure). Once set, Redis is dead for the entire process lifetime — even if it recovers seconds later.

A `CircuitBreaker` class with `CircuitBreakerFactory.createRedisBreaker()` already exists at `services/gateway/src/utils/circuitBreaker.ts`. It implements Closed→Open(20s)→Half-Open with configurable thresholds, timeout per operation (2s), and a `successThreshold` (3 successes to close from half-open). Use it instead of reimplementing.

**Files:**
- Modify: `services/gateway/src/services/RedisWrapper.ts`

**Context:**
- Existing `CircuitBreakerFactory.createRedisBreaker()` config: failureThreshold=3, failureWindowMs=30s, resetTimeoutMs=20s, successThreshold=3, timeout=2s
- The `execute()` method wraps an async function with timeout + state management
- On OPEN, it calls the fallback (returns `null` for Redis) — perfect for memory cache fallback
- `closeRedisConnection()` should be KEPT for graceful shutdown but REMOVED from error paths

- [ ] **Step 1: Read the full RedisWrapper.ts and circuitBreaker.ts**

Read both files to understand the current error handling and the CircuitBreaker API.

- [ ] **Step 2: Add CircuitBreaker instance, remove `permanentlyDisabled`**

```typescript
import { CircuitBreakerFactory, CircuitBreaker } from '../utils/circuitBreaker';

// In the class:
// REMOVE: private permanentlyDisabled: boolean = false;
// ADD:
private circuitBreaker: CircuitBreaker = CircuitBreakerFactory.createRedisBreaker();
```

- [ ] **Step 3: Update `get()` method**

```typescript
async get(key: string): Promise<string | null> {
  if (this.isRedisAvailable && this.redis) {
    try {
      return await this.circuitBreaker.execute(() => this.redis!.get(key));
    } catch {
      // Circuit breaker handled the failure — fall through to memory
    }
  }

  const entry = this.memoryCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value;
  }
  if (entry) {
    this.memoryCache.delete(key);
  }
  return null;
}
```

- [ ] **Step 4: Update `set()` method**

```typescript
async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (this.isRedisAvailable && this.redis) {
    try {
      await this.circuitBreaker.execute(() => {
        if (ttlSeconds) {
          return this.redis!.set(key, value, 'EX', ttlSeconds);
        }
        return this.redis!.set(key, value);
      });
      return;
    } catch {
      // Circuit breaker handled the failure — fall through to memory
    }
  }

  this.memoryCache.set(key, {
    value,
    expiresAt: Date.now() + (ttlSeconds ? ttlSeconds * 1000 : 3600000),
  });
}
```

- [ ] **Step 5: Update remaining methods**

Apply the same `this.circuitBreaker.execute(() => ...)` pattern to:

| Method | Redis call to wrap | Fallback behavior |
|--------|-------------------|-------------------|
| `setnx()` | `this.redis.set(key, value, 'EX', ttl, 'NX')` | Memory cache set + return `'OK'` |
| `expire()` | `this.redis.expire(key, ttlSeconds)` | No-op (memory cache uses expiresAt at set time) |
| `del()` | `this.redis.del(key)` | `this.memoryCache.delete(key)` |
| `keys()` | `this.redis.keys(pattern)` | `Array.from(this.memoryCache.keys()).filter(k => matchesPattern(k, pattern))` |

For `isAvailable()`: return `this.isRedisAvailable && this.circuitBreaker.getStats().state !== 'OPEN'`

- [ ] **Step 6: Update connection event handlers**

In `initializeRedis()`, remove all `this.permanentlyDisabled = true` assignments. Replace with just setting `this.isRedisAvailable = false`. The circuit breaker tracks failures via `execute()` — connection events should NOT directly trigger circuit state changes.

```typescript
this.redis.on('close', () => {
  this.isRedisAvailable = false;
  if (this.connectionAttempts > 0) {
    logger.warn('⚠️ Redis connection lost — circuit breaker will manage retries');
  }
});

this.redis.on('end', () => {
  this.isRedisAvailable = false;
});

this.redis.on('error', (error) => {
  if (!error.message.includes('ECONNRESET') &&
      !error.message.includes('ECONNREFUSED') &&
      !error.message.includes('EPIPE')) {
    logger.warn('⚠️ Redis error', { error: error.message });
  }
  this.isRedisAvailable = false;
});
```

Update `retryStrategy`:
```typescript
retryStrategy: (times: number) => {
  if (times > this.maxConnectionAttempts) {
    logger.warn('⚠️ Max connection attempts reached — circuit breaker will manage retries');
    return null;
  }
  return 2000;
},
```

Remove `this.permanentlyDisabled = true` from `connect().catch()` and the outer `try/catch` in `initializeRedis()`. Replace with `this.isRedisAvailable = false`.

**Keep `closeRedisConnection()`** as a method (needed for graceful shutdown) but remove it from error paths — the circuit breaker handles retry timing without killing the connection.

- [ ] **Step 7: Verify no remaining `permanentlyDisabled` references**

Run: `grep -rn "permanentlyDisabled" services/gateway/src/services/RedisWrapper.ts`
Expected: 0 matches

- [ ] **Step 8: Build gateway**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add services/gateway/src/services/RedisWrapper.ts
git commit -m "perf(gateway): integrate existing CircuitBreaker into RedisWrapper

Replaces permanentlyDisabled flag with CircuitBreakerFactory.createRedisBreaker().
Previously, ANY Redis error permanently disabled Redis for the entire process.
Now uses the existing circuit breaker (3 failures/30s → OPEN 20s → HALF-OPEN
→ 3 successes to CLOSE) with 2s timeout per operation."
```

---

## Chunk 3: HTTP Caching (Task 3)

### Task 3: Add ETag + Cache-Control to read-heavy endpoints

Four read-heavy REST endpoints return responses without HTTP caching headers. Adding appropriate headers enables:
- **ETag endpoints** (conversations, messages): `If-None-Match` → 304 Not Modified (saves bandwidth)
- **max-age endpoints** (posts/feed, users): simple time-based caching (reduces request frequency)

**Files:**
- Create: `services/gateway/src/utils/etag.ts`
- Modify: `services/gateway/src/routes/conversations/core.ts` (GET /conversations)
- Modify: `services/gateway/src/routes/conversations/messages.ts` (GET /conversations/:id/messages)
- Modify: `services/gateway/src/routes/posts/feed.ts` (GET /posts/feed)
- Modify: `services/gateway/src/routes/users.ts` or equivalent (GET /users/:id)

**Context:**
- `Cache-Control: private, no-cache` = always revalidate but allow client-side caching for conditional requests
- `Cache-Control: private, max-age=30` = cache for 30s without revalidation (for feed)
- `Cache-Control: private, max-age=60` = cache for 60s (for user profiles)
- ETag = MD5 hash of JSON body. Server computes full response to check ETag — savings are on bandwidth (no body in 304), not server computation
- For active conversations, ETag will differ on every poll (new messages). The real win is on the **conversation list** endpoint when nothing changed.

- [ ] **Step 1: Create ETag utility**

Create `services/gateway/src/utils/etag.ts`:

```typescript
import { createHash } from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';

export function generateETag(payload: unknown): string {
  const json = JSON.stringify(payload);
  const hash = createHash('md5').update(json).digest('hex');
  return `"${hash}"`;
}

export function sendWithETag(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
  cacheControl: string = 'private, no-cache'
): void {
  const etag = generateETag(payload);

  reply.header('Cache-Control', cacheControl);
  reply.header('ETag', etag);

  const ifNoneMatch = request.headers['if-none-match'];
  if (ifNoneMatch === etag) {
    reply.status(304).send();
    return;
  }

  reply.send(payload);
}

export function sendWithCacheControl(
  reply: FastifyReply,
  payload: unknown,
  maxAgeSeconds: number
): void {
  reply.header('Cache-Control', `private, max-age=${maxAgeSeconds}`);
  reply.send(payload);
}
```

- [ ] **Step 2: Apply ETag to GET /conversations**

In `services/gateway/src/routes/conversations/core.ts`, add import at top:
```typescript
import { sendWithETag } from '../../utils/etag';
```

Find the `reply.send(...)` at line 509 (the conversation list response). Replace:

```typescript
// BEFORE:
reply.send({
  success: true,
  data: conversationsWithUnreadCount,
  pagination: { limit, offset, total: totalCount, hasMore },
  cursorPagination: cursorPaginationMeta
});

// AFTER:
sendWithETag(request, reply, {
  success: true,
  data: conversationsWithUnreadCount,
  pagination: { limit, offset, total: totalCount, hasMore },
  cursorPagination: cursorPaginationMeta
});
```

- [ ] **Step 3: Apply ETag to GET /conversations/:id/messages**

In `services/gateway/src/routes/conversations/messages.ts`, add import at top:
```typescript
import { sendWithETag } from '../../utils/etag';
```

Find `reply.send(responsePayload)` at line 949. Replace:

```typescript
// BEFORE:
reply.send(responsePayload);

// AFTER:
sendWithETag(request, reply, responsePayload);
```

- [ ] **Step 4: Apply max-age to GET /posts/feed**

Find the feed route file. Read it to locate the response `reply.send()`. Add:
```typescript
import { sendWithCacheControl } from '../../utils/etag';
```

Replace `reply.send(payload)` with `sendWithCacheControl(reply, payload, 30)`.

If the feed response is complex (multiple `reply.send` paths), just add the header before the existing `reply.send`:
```typescript
reply.header('Cache-Control', 'private, max-age=30');
reply.send(payload); // existing line unchanged
```

- [ ] **Step 5: Apply max-age to GET /users/:id**

Find the users route file. Read it to locate the GET /:id response. Add:
```typescript
reply.header('Cache-Control', 'private, max-age=60');
```
before the existing `reply.send()`.

- [ ] **Step 6: Build gateway**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src/utils/etag.ts services/gateway/src/routes/conversations/core.ts services/gateway/src/routes/conversations/messages.ts services/gateway/src/routes/posts/ services/gateway/src/routes/users.ts
git commit -m "perf(gateway): add HTTP caching headers to read-heavy endpoints

GET /conversations, /messages: ETag + Cache-Control: private, no-cache
  → enables 304 Not Modified when data unchanged
GET /posts/feed: Cache-Control: private, max-age=30
GET /users/:id: Cache-Control: private, max-age=60"
```

---

## Post-Implementation Verification

After all 3 tasks:

- [ ] **Build gateway:** `cd services/gateway && npx tsc --noEmit`
- [ ] **Start gateway:** verify it starts without errors in tmux window 1
- [ ] **Test ConversationId cache:** join a conversation via Socket.IO twice, verify second join doesn't log a Prisma query for identifier resolution
- [ ] **Test RedisWrapper:** verify circuit breaker logs show `CLOSED` state during normal operation. Stop Redis briefly and verify it goes OPEN then recovers to CLOSED after restart.
- [ ] **Test ETag:** `curl -v -H "Authorization: Bearer {token}" http://localhost:3000/api/v1/conversations` → verify `ETag` and `Cache-Control` headers. Resend with `-H "If-None-Match: {etag}"` → verify 304 response.
- [ ] **Test max-age:** `curl -v http://localhost:3000/api/v1/posts/feed` → verify `Cache-Control: private, max-age=30`
