# Gateway Performance & Correctness Plan (v2)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 2 active correctness bugs (stale auth cache, message re-fetch) and 1 resilience issue (Redis permanent disable), then add in-memory caching to eliminate redundant DB lookups on every socket event and REST request. HTTP caching deferred — see Deferred section.

**Architecture:** Five independent tasks. T1 adds cache invalidation after profile updates (P0 bug fix). T2 extracts a shared cached `resolveConversationId` and wires all 10 call sites. T3 integrates the existing `CircuitBreaker` into `RedisWrapper`. T4 enriches `MessagingService.handleMessage()` to return the full message, eliminating a re-fetch on every message send. T5 adds `Cache-Control` headers as a lightweight first step (no ETag — clients don't send `If-None-Match` yet).

**Tech Stack:** TypeScript, Fastify 5, Socket.IO, ioredis, Prisma

**Deferred (and why):**
- **ETag responses**: Zero clients (iOS SDK, web) currently send `If-None-Match`. ETag infrastructure is dead code until clients are updated. Deferred to a cross-platform plan (gateway + iOS SDK + web fetch layer).
- **G4 conversation routes → sendSuccess()**: 34 raw `reply.send()` calls — important for API consistency but not a performance concern. Separate refactoring plan.
- **ZMQ timeout/retry**: Reliability concern in `ZmqTranslationClient` (no 30s timeout). Separate reliability plan.
- **G7 remaining language divergences**: `participants.ts`, `contact-change.ts`, `anonymous.ts` use manual language resolution. Separate correctness plan.

---

## Chunk 1: Auth Cache Bug Fix (Task 1)

### Task 1: Add auth cache invalidation on profile/language/role update

**Bug:** `auth.ts:142-197` caches the user in Redis under `auth:user:{userId}` with 5min TTL. But no `redis.del()` is ever called anywhere. When a user changes their language, avatar, displayName, or role via `PATCH /users/profile`, the cache serves stale data for up to 5 minutes.

**Impact:** After changing language from `fr` to `en`, messages continue being translated to `fr` for 5 minutes. After avatar change, old avatar served to other users for 5 minutes via auth context.

**Files:**
- Modify: `services/gateway/src/routes/users/profile.ts:223-263` (add cache invalidation after update)
- Modify: `services/gateway/src/middleware/auth.ts` (export cache key constant)

- [ ] **Step 1: Read auth.ts to find the cache key pattern**

Read `services/gateway/src/middleware/auth.ts`. Find the cache key constant (around line 142). It should be something like `auth:user:${userId}`. Note the exact pattern.

- [ ] **Step 2: Export the cache key builder from auth.ts**

Add an exported function near the cache key definition:

```typescript
export const AUTH_USER_CACHE_PREFIX = 'auth:user:';

export function authUserCacheKey(userId: string): string {
  return `${AUTH_USER_CACHE_PREFIX}${userId}`;
}
```

- [ ] **Step 3: Read profile.ts to find all update paths**

Read `services/gateway/src/routes/users/profile.ts`. Find all places that call `prisma.user.update()`. The main one is at line 223. Check for avatar update, language update, role update handlers.

- [ ] **Step 4: Add cache invalidation after profile update**

After `prisma.user.update()` at line 223 and before `return reply.send(...)` at line 263, add:

```typescript
// Invalidate auth cache so next request gets fresh data
try {
  const redis = getRedisWrapper();
  await redis.del(authUserCacheKey(userId));
} catch {
  // Cache invalidation is best-effort — stale cache expires in 5min anyway
}
```

Add the imports at the top of profile.ts:
```typescript
import { authUserCacheKey } from '../../middleware/auth';
import { getRedisWrapper } from '../../services/RedisWrapper';
```

- [ ] **Step 5: Search for other user update paths that need invalidation**

Search for `prisma.user.update` across `services/gateway/src/routes/` to find any other handler that modifies cached fields. Each must also invalidate. Common ones:
- Admin role change routes
- Avatar upload handler
- Language preference update

For each, add the same `redis.del(authUserCacheKey(userId))` after the update.

- [ ] **Step 6: Build gateway**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src/middleware/auth.ts services/gateway/src/routes/users/profile.ts
git commit -m "fix(gateway): add auth cache invalidation on profile/language/role update

The auth middleware caches user data in Redis for 5min (auth:user:{userId}).
No cache invalidation existed — after updating language preferences, avatar,
or role, stale data was served for up to 5 minutes. Now deletes the cache
key after every user.update() in profile routes."
```

---

## Chunk 2: ConversationId Cache (Task 2)

### Task 2: Extract shared `resolveConversationId` with in-memory cache

`resolveConversationId` is duplicated in **10 independent locations** — each hitting Prisma on every call. The identifier→ObjectId mapping is **immutable** (confirmed: no API modifies identifiers post-creation, conversations are only soft-deleted).

**All 10 call sites:**

| # | File | Type | Currently |
|---|------|------|-----------|
| 1 | `routes/conversations/core.ts:39` | module function | `findFirst` |
| 2 | `routes/conversations/messages.ts:33` | module function | `findFirst` |
| 3 | `routes/conversations/messages-advanced.ts:31` | module function | `findFirst` |
| 4 | `routes/conversations/participants.ts:16` | module function | `findFirst` |
| 5 | `routes/conversations/sharing.ts:23` | module function | `findFirst` |
| 6 | `socketio/MeeshySocketIOManager.ts:174` | private method | `findUnique` |
| 7 | `socketio/utils/socket-helpers.ts:78` | exported helper | injected `findUnique` |
| 8 | `services/messaging/MessageValidator.ts:285` | class method | `findFirst` |
| 9 | `routes/translation-non-blocking.ts:354` | inline | `findFirst` |
| 10 | `routes/translation-non-blocking.ts:496` | inline | `findFirst` |

**Files:**
- Create: `services/gateway/src/utils/conversation-id-cache.ts`
- Modify: 5 route files (remove local function, import shared)
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts:174-199` (add cache)
- Modify: `services/gateway/src/socketio/utils/socket-helpers.ts:78-100` (add cache)
- Modify: `services/gateway/src/services/messaging/MessageValidator.ts:285-297` (replace with import)
- Modify: `services/gateway/src/routes/translation-non-blocking.ts:354,496` (replace inline with import)

- [ ] **Step 1: Create shared cached utility**

Create `services/gateway/src/utils/conversation-id-cache.ts`:

```typescript
import type { PrismaClient } from '@meeshy/shared/prisma/client';

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
```

- [ ] **Step 2: Replace in 5 route files**

For each of these files, remove the local `async function resolveConversationId(...)` and add:
```typescript
import { resolveConversationId } from '../../utils/conversation-id-cache';
```

Files (same signature `(prisma, identifier) → string | null`):
1. `services/gateway/src/routes/conversations/core.ts:39-51`
2. `services/gateway/src/routes/conversations/messages.ts:33-41`
3. `services/gateway/src/routes/conversations/messages-advanced.ts:31-39`
4. `services/gateway/src/routes/conversations/participants.ts:16-24`
5. `services/gateway/src/routes/conversations/sharing.ts:23-31`

**IMPORTANT:** Verify each local function's signature before replacing. Also check if `isValidMongoId` import becomes unused after removing the local function — remove if so.

- [ ] **Step 3: Replace in MessageValidator.ts**

Read `services/gateway/src/services/messaging/MessageValidator.ts`. The class method at line 285 has the same logic. Replace with a call to the shared utility:

```typescript
import { resolveConversationId } from '../../utils/conversation-id-cache';

// Replace the class method (line 285-297):
async resolveConversationId(identifier: string): Promise<string | null> {
  return resolveConversationId(this.prisma, identifier);
}
```

Or better: remove the method entirely and have callers use the shared utility directly. Check what calls `this.resolveConversationId()` within MessageValidator and refactor accordingly.

- [ ] **Step 4: Replace in translation-non-blocking.ts**

Read `services/gateway/src/routes/translation-non-blocking.ts`. There are 2 inline resolution blocks (line 354 and 496). Replace each with:

```typescript
import { resolveConversationId } from '../utils/conversation-id-cache';

// Replace inline block at ~line 354:
const resolved = await resolveConversationId(fastify.prisma, validatedData.conversation_id);
if (!resolved) {
  return reply.status(404).send({
    success: false,
    error: `Conversation with identifier '${validatedData.conversation_id}' not found`
  });
}
const resolvedConversationId = resolved;
```

Apply same pattern at ~line 496.

- [ ] **Step 5: Add cache to MeeshySocketIOManager**

Read `services/gateway/src/socketio/MeeshySocketIOManager.ts`. Add a private `Map` to the class and update the method:

```typescript
private conversationIdCache = new Map<string, string>();

private async normalizeConversationId(conversationId: string): Promise<string> {
  try {
    if (/^[0-9a-fA-F]{24}$/.test(conversationId)) return conversationId;

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

- [ ] **Step 6: Add cache to socket-helpers.ts**

Read `services/gateway/src/socketio/utils/socket-helpers.ts`. Add module-level cache:

```typescript
const conversationIdCache = new Map<string, string>();

export async function normalizeConversationId(
  conversationId: string,
  prismaFindUnique: (where: { identifier: string }) => Promise<{ id: string; identifier: string } | null>
): Promise<string> {
  try {
    if (/^[0-9a-fA-F]{24}$/.test(conversationId)) return conversationId;

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

- [ ] **Step 7: Build gateway**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add services/gateway/src/utils/conversation-id-cache.ts services/gateway/src/routes/conversations/ services/gateway/src/socketio/ services/gateway/src/services/messaging/MessageValidator.ts services/gateway/src/routes/translation-non-blocking.ts
git commit -m "perf(gateway): extract shared resolveConversationId with in-memory cache

Deduplicates 10 identical identifier→ObjectId resolution implementations
across route files, socket handlers, and services. Adds in-memory caching
(Map) — identifiers are immutable, cached indefinitely on first lookup.
Eliminates 10+ Prisma calls per conversation join/message send."
```

---

## Chunk 3: Redis Resilience (Task 3)

### Task 3: Integrate existing `CircuitBreaker` into `RedisWrapper`

`RedisWrapper` sets `permanentlyDisabled = true` on ANY error — killing Redis for the entire process lifetime. A `CircuitBreaker` class with `CircuitBreakerFactory.createRedisBreaker()` already exists at `utils/circuitBreaker.ts` but has **never been used in production** (dead code). This task activates it.

**Key integration notes:**
- When circuit is OPEN, `execute()` calls fallback which **returns null** (doesn't throw). This means `get()` returns null = "not found" = falls through to memory cache. The catch block fires only on actual Redis errors, not OPEN state. This is correct cache behavior.
- `createRedisBreaker()` config: failureThreshold=3, failureWindowMs=30s, resetTimeoutMs=20s, successThreshold=3, timeout=2s
- ioredis has `maxRetriesPerRequest: 1` — it rejects fast. The CircuitBreaker's 2s timeout is a safety net that rarely fires.
- Register the breaker in `circuitBreakerManager` so the health endpoint exposes real stats.
- Keep `closeRedisConnection()` for graceful shutdown but remove from error paths.

**Files:**
- Modify: `services/gateway/src/services/RedisWrapper.ts`

- [ ] **Step 1: Read the full RedisWrapper.ts and circuitBreaker.ts**

Read both files. Note every usage of `permanentlyDisabled`.

- [ ] **Step 2: Add CircuitBreaker instance, remove `permanentlyDisabled`**

```typescript
import { CircuitBreakerFactory, circuitBreakerManager } from '../utils/circuitBreaker';

// Remove: private permanentlyDisabled: boolean = false;
// Add:
private circuitBreaker = CircuitBreakerFactory.createRedisBreaker();

// In constructor, after initializeRedis():
circuitBreakerManager.register('redis', this.circuitBreaker);
```

- [ ] **Step 3: Update `get()` method**

```typescript
async get(key: string): Promise<string | null> {
  if (this.isRedisAvailable && this.redis) {
    try {
      const value = await this.circuitBreaker.execute(() => this.redis!.get(key));
      if (value !== null) return value; // CB returns null when OPEN (fallback) — treat as miss
      // Check if this is a real null (key not found) vs circuit open
      // When OPEN, fallback returns null without throwing
      // We can't distinguish — fall through to memory (correct for cache)
      return value;
    } catch {
      // Redis error — circuit breaker recorded the failure
      // Fall through to memory cache
    }
  }

  const entry = this.memoryCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  if (entry) this.memoryCache.delete(key);
  return null;
}
```

- [ ] **Step 4: Update `set()` method**

```typescript
async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (this.isRedisAvailable && this.redis) {
    try {
      await this.circuitBreaker.execute(() => {
        if (ttlSeconds) return this.redis!.set(key, value, 'EX', ttlSeconds);
        return this.redis!.set(key, value);
      });
      return;
    } catch {
      // Fall through to memory cache
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

| Method | Redis call to wrap | On error/OPEN fallback |
|--------|-------------------|----------------------|
| `setnx()` | `redis.set(key, value, 'EX', ttl, 'NX')` | Memory cache set |
| `expire()` | `redis.expire(key, ttlSeconds)` | No-op |
| `del()` | `redis.del(key)` | `this.memoryCache.delete(key)` |
| `keys()` | `redis.keys(pattern)` | Filter from `memoryCache.keys()` |
| `isAvailable()` | — | Return `this.isRedisAvailable && this.circuitBreaker.getStats().state !== 'OPEN'` |

- [ ] **Step 6: Update connection event handlers**

Remove ALL `this.permanentlyDisabled = true` lines. Replace with `this.isRedisAvailable = false`. The circuit breaker manages retry timing via `execute()` — connection events should not directly change circuit state.

```typescript
this.redis.on('close', () => {
  this.isRedisAvailable = false;
  logger.warn('⚠️ Redis connection lost — circuit breaker will manage retries');
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

Update `retryStrategy` and `connect().catch()`:
- Replace `this.permanentlyDisabled = true` with `this.isRedisAvailable = false`
- Remove `this.closeRedisConnection()` from error paths (keep the method for shutdown)
- Keep `return null` in retryStrategy to stop ioredis retries (circuit breaker handles retry timing)

- [ ] **Step 7: Verify no remaining `permanentlyDisabled` references**

Run: `grep -rn "permanentlyDisabled" services/gateway/src/services/RedisWrapper.ts`
Expected: 0 matches

- [ ] **Step 8: Build gateway**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add services/gateway/src/services/RedisWrapper.ts
git commit -m "fix(gateway): integrate CircuitBreaker into RedisWrapper, remove permanentlyDisabled

Previously, ANY Redis error permanently disabled Redis for the entire process.
Now wraps all Redis operations with CircuitBreakerFactory.createRedisBreaker():
3 failures in 30s opens circuit (20s cooldown), 3 successes to re-close.
Registered in circuitBreakerManager for health endpoint visibility."
```

---

## Chunk 4: Message Broadcast Enrichment (Task 4)

### Task 4: Eliminate read-after-write in message send pipeline

**Bug:** `MessagingService.handleMessage()` returns a raw `Message` object (no sender, no attachments, no replyTo). `MessageHandler.ts:257` then calls `_fetchMessageForBroadcast(response.data.id)` — a full `prisma.message.findUnique` with nested includes. This is an **extra DB round-trip on every single message sent**.

The fix: have `MessageProcessor.saveMessage()` return the enriched message (with sender + replyTo), or have `MessagingService` do the enrichment before returning.

**Files:**
- Modify: `services/gateway/src/services/messaging/MessageProcessor.ts` (saveMessage return enriched)
- Modify: `services/gateway/src/socketio/handlers/MessageHandler.ts:255-264` (use response.data directly)

**Context:**
- `MessageProcessor.saveMessage()` currently calls `prisma.message.create()` and returns the raw `Message`
- The `_fetchMessageForBroadcast()` include is: sender (with user), attachments, replyTo (with sender.user)
- After `saveMessage()`, we know the senderId and replyToId — we can include them in the create query

- [ ] **Step 1: Read MessageProcessor.saveMessage()**

Read `services/gateway/src/services/messaging/MessageProcessor.ts`. Find `saveMessage()` and understand what it creates. Look at the `prisma.message.create()` call.

- [ ] **Step 2: Read _fetchMessageForBroadcast() include shape**

Read `services/gateway/src/socketio/handlers/MessageHandler.ts:495-540`. Copy the exact `include` structure used in `_fetchMessageForBroadcast()`.

- [ ] **Step 3: Add `include` to `prisma.message.create()` in saveMessage()**

In `MessageProcessor.saveMessage()`, change the `prisma.message.create()` to include the same relations:

```typescript
const message = await this.prisma.message.create({
  data: { /* existing data */ },
  include: {
    sender: {
      select: {
        id: true,
        displayName: true,
        avatar: true,
        type: true,
        nickname: true,
        userId: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        }
      }
    },
    attachments: true,
    replyTo: {
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatar: true,
            type: true,
            nickname: true,
            userId: true,
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                firstName: true,
                lastName: true,
                avatar: true
              }
            }
          }
        }
      }
    }
  }
});
```

This makes `saveMessage()` return the enriched message in a single DB call instead of requiring a second fetch.

- [ ] **Step 4: Update MessageHandler to skip re-fetch**

In `MessageHandler.ts`, around line 255-264, the code currently does:

```typescript
if (response.success && response.data?.id) {
  const message = await this._fetchMessageForBroadcast(response.data.id);
  if (message) {
    await invalidateConversationCacheAsync(message.conversationId, this.prisma);
    await this.broadcastNewMessage(message, message.conversationId, socket);
    await this._createMessageNotifications(message, resolvedParticipantId);
  }
}
```

Change to use `response.data` directly (it now has the enriched shape):

```typescript
if (response.success && response.data) {
  const message = response.data;
  await invalidateConversationCacheAsync(message.conversationId, this.prisma);
  await this.broadcastNewMessage(message, message.conversationId, socket);
  await this._createMessageNotifications(message, resolvedParticipantId);
}
```

**Note:** `response.data` is typed as `{ ...Message, timestamp }`. With the enriched include, it now has `sender`, `attachments`, `replyTo`. If TypeScript complains about the type, update the `MessageResponse` type in MessagingService to reflect the enriched shape, or cast appropriately.

- [ ] **Step 5: Keep `_fetchMessageForBroadcast()` but mark as fallback**

Don't delete `_fetchMessageForBroadcast()` yet — other call sites (forward handling at line 230-253) may still use it. Add a comment: `// Fallback — saveMessage now returns enriched message, prefer response.data`.

- [ ] **Step 6: Build gateway**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src/services/messaging/MessageProcessor.ts services/gateway/src/socketio/handlers/MessageHandler.ts
git commit -m "perf(gateway): eliminate read-after-write in message send pipeline

MessageProcessor.saveMessage() now returns the enriched message (with
sender, attachments, replyTo) via include in prisma.message.create().
MessageHandler no longer calls _fetchMessageForBroadcast() for the
normal send path — saves 1 DB round-trip per message sent."
```

---

## Chunk 5: Lightweight HTTP Caching (Task 5)

### Task 5: Add `Cache-Control` headers to read-heavy endpoints

**Scope:** Add `Cache-Control` headers only. No ETag (clients don't send `If-None-Match` yet). No `max-age` on dynamic endpoints (stale data bugs). This is the minimum useful first step.

**Why not ETag now:** Zero clients (iOS SDK, web) send `If-None-Match`. The entire 304 path would be dead code. Adding `@fastify/etag` or custom ETag requires a coordinated cross-platform effort (gateway + SDK + web). Deferred.

**Why not max-age on feed/users:** `max-age=30` on a social feed = user posts and doesn't see it for 30s. `max-age=60` on user profile = stale `isOnline` for 60s. Both are unacceptable product regressions.

**Files:**
- Modify: `services/gateway/src/routes/conversations/core.ts` (GET /conversations)
- Modify: `services/gateway/src/routes/conversations/messages.ts` (GET /messages)

- [ ] **Step 1: Add `Cache-Control: private, no-cache` to GET /conversations**

In `services/gateway/src/routes/conversations/core.ts`, before the `reply.send(...)` at line 509:

```typescript
reply.header('Cache-Control', 'private, no-cache');
reply.send({
  success: true,
  data: conversationsWithUnreadCount,
  // ...
});
```

`no-cache` means: the browser/proxy CAN cache the response, but MUST revalidate with the server before using it. This is preparation for when ETag is added later — the cache will have something to revalidate against.

- [ ] **Step 2: Add `Cache-Control: private, no-cache` to GET /messages**

In `services/gateway/src/routes/conversations/messages.ts`, before the `reply.send(responsePayload)` at line 949:

```typescript
reply.header('Cache-Control', 'private, no-cache');
reply.send(responsePayload);
```

- [ ] **Step 3: Build gateway**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/routes/conversations/core.ts services/gateway/src/routes/conversations/messages.ts
git commit -m "perf(gateway): add Cache-Control headers to conversation/messages endpoints

Adds Cache-Control: private, no-cache to GET /conversations and
GET /conversations/:id/messages. Prepares for future ETag support —
once clients send If-None-Match, these cached responses can be
revalidated without full re-transfer."
```

---

## Post-Implementation Verification

After all 5 tasks:

- [ ] **Build gateway:** `cd services/gateway && npx tsc --noEmit`
- [ ] **Start gateway:** verify it starts without errors in tmux window 1
- [ ] **Test T1 (auth invalidation):** update user language via `PATCH /users/profile`, immediately `GET /conversations` and verify the auth context has the new language (check gateway logs for cache MISS after update)
- [ ] **Test T2 (ConversationId cache):** join a conversation via Socket.IO, join again — verify no Prisma query on second join (grep logs for `[NORMALIZE]`)
- [ ] **Test T3 (CircuitBreaker):** check `/health/metrics` endpoint — verify Redis circuit breaker stats are present (`state: CLOSED`)
- [ ] **Test T4 (enriched message):** send a message via Socket.IO, verify the broadcast includes `sender.user.username` and `attachments` without a second DB fetch (grep logs for `_fetchMessageForBroadcast`)
- [ ] **Test T5 (Cache-Control):** `curl -v -H "Authorization: Bearer {token}" http://localhost:3000/api/v1/conversations` → verify `Cache-Control: private, no-cache` header
