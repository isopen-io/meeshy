# Agent Scheduling: Spread Actions Over Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace in-memory delivery queue with Redis-persistent queue, extend delay ranges to 24h driven by admin config, add topic deduplication/fusion, and make web search effective by default.

**Architecture:** Redis sorted set replaces setTimeout-based delivery. Strategist outputs `delayCategory` mapped to config-driven ranges. Before enqueue, actions are checked against existing user schedule for topic conflicts and rate limits. Web search tool always available when config allows.

**Tech Stack:** Redis (ioredis), TypeScript, Jest, Zod

---

### Task 1: Extend PendingAction Types with Topic and Delay Category

**Files:**
- Modify: `services/agent/src/graph/state.ts:65-108`

- [ ] **Step 1: Add new fields to PendingMessage type**

```typescript
// services/agent/src/graph/state.ts — replace lines 65-74
export type PendingMessage = {
  type: 'message';
  asUserId: string;
  content: string;
  originalLanguage: string;
  replyToId?: string;
  mentionedUsernames: string[];
  delaySeconds: number;
  delayCategory: 'immediate' | 'short' | 'medium' | 'long';
  topicCategory: string;
  topicHash: string;
  messageSource: 'agent';
};
```

- [ ] **Step 2: Add new fields to PendingReaction type**

```typescript
// services/agent/src/graph/state.ts — replace lines 76-84
export type PendingReaction = {
  type: 'reaction';
  asUserId: string;
  targetMessageId: string;
  emoji: string;
  delaySeconds: number;
  delayCategory: 'immediate' | 'short' | 'medium' | 'long';
  topicCategory: string;
  topicHash: string;
  minWords?: never;
  maxWords?: never;
};
```

- [ ] **Step 3: Add delayCategory and searchHint to MessageDirective**

```typescript
// services/agent/src/graph/state.ts — replace lines 88-98
export type MessageDirective = {
  type: 'message';
  asUserId: string;
  topic: string;
  replyToMessageId?: string;
  mentionUsernames: string[];
  delaySeconds: number;
  delayCategory: 'immediate' | 'short' | 'medium' | 'long';
  topicCategory: string;
  needsWebSearch?: boolean;
  searchHint?: string;
  minWords?: number;
  maxWords?: number;
};
```

- [ ] **Step 4: Add delayCategory and topicCategory to ReactionDirective**

```typescript
// services/agent/src/graph/state.ts — replace lines 100-106
export type ReactionDirective = {
  type: 'reaction';
  asUserId: string;
  targetMessageId: string;
  emoji: string;
  delaySeconds: number;
  delayCategory: 'immediate' | 'short' | 'medium' | 'long';
  topicCategory: string;
};
```

- [ ] **Step 5: Add ScheduledActionSummary type and scheduledActions + delay config to ConversationState**

```typescript
// services/agent/src/graph/state.ts — add before ConversationStateAnnotation

export type ScheduledActionSummary = {
  userId: string;
  topicCategory: string;
  scheduledAt: number;
  type: 'message' | 'reaction';
};
```

Then add these annotations inside `ConversationStateAnnotation` (after `engagementData`, before closing `}`):

```typescript
  scheduledActions: Annotation<ScheduledActionSummary[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  minDelayMinutes: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 1,
  }),
  maxDelayMinutes: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 360,
  }),
  spreadOverDayEnabled: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => true,
  }),
  maxMessagesPerUserPer10Min: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 4,
  }),
```

- [ ] **Step 6: Run tests to verify no type breakages**

Run: `cd services/agent && pnpm run build`
Expected: Compilation errors in files that construct PendingMessage/PendingReaction without the new required fields — these will be fixed in subsequent tasks.

- [ ] **Step 7: Commit**

```bash
git add services/agent/src/graph/state.ts
git commit -m "feat(agent): add delayCategory, topicCategory, topicHash to PendingAction types and scheduledActions to state"
```

---

### Task 2: Add Delay Resolution Utility

**Files:**
- Create: `services/agent/src/delivery/delay-resolver.ts`
- Create: `services/agent/src/__tests__/delivery/delay-resolver.test.ts`

- [ ] **Step 1: Write failing tests for delay resolution**

```typescript
// services/agent/src/__tests__/delivery/delay-resolver.test.ts
import { resolveDelaySeconds } from '../../delivery/delay-resolver';

describe('resolveDelaySeconds', () => {
  it('maps immediate to lower 10% of range', () => {
    const result = resolveDelaySeconds('immediate', { minDelayMinutes: 1, maxDelayMinutes: 360 });
    expect(result).toBeGreaterThanOrEqual(60);    // 1 min
    expect(result).toBeLessThanOrEqual(2520);      // 1 + 0.1 * 359 = ~37 min in seconds
  });

  it('maps short to 10-30% of range', () => {
    const result = resolveDelaySeconds('short', { minDelayMinutes: 1, maxDelayMinutes: 360 });
    expect(result).toBeGreaterThanOrEqual(2100);   // ~35 min
    expect(result).toBeLessThanOrEqual(6720);      // ~112 min
  });

  it('maps medium to 30-70% of range', () => {
    const result = resolveDelaySeconds('medium', { minDelayMinutes: 1, maxDelayMinutes: 360 });
    expect(result).toBeGreaterThanOrEqual(6480);   // ~108 min
    expect(result).toBeLessThanOrEqual(15360);     // ~256 min
  });

  it('maps long to 70-100% of range', () => {
    const result = resolveDelaySeconds('long', { minDelayMinutes: 1, maxDelayMinutes: 360 });
    expect(result).toBeGreaterThanOrEqual(15000);  // ~250 min
    expect(result).toBeLessThanOrEqual(21600);     // 360 min
  });

  it('respects tight config range', () => {
    const result = resolveDelaySeconds('immediate', { minDelayMinutes: 5, maxDelayMinutes: 10 });
    expect(result).toBeGreaterThanOrEqual(300);    // 5 min
    expect(result).toBeLessThanOrEqual(600);       // 10 min
  });

  it('handles minDelayMinutes == maxDelayMinutes', () => {
    const result = resolveDelaySeconds('long', { minDelayMinutes: 60, maxDelayMinutes: 60 });
    expect(result).toBeGreaterThanOrEqual(3300);   // ~55 min (jitter)
    expect(result).toBeLessThanOrEqual(4320);      // ~72 min (jitter)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/agent && pnpm test -- --testPathPattern=delay-resolver`
Expected: FAIL — module not found

- [ ] **Step 3: Implement delay resolver**

```typescript
// services/agent/src/delivery/delay-resolver.ts

type DelayConfig = {
  minDelayMinutes: number;
  maxDelayMinutes: number;
};

type DelayCategory = 'immediate' | 'short' | 'medium' | 'long';

const CATEGORY_RANGES: Record<DelayCategory, [number, number]> = {
  immediate: [0, 0.1],
  short: [0.1, 0.3],
  medium: [0.3, 0.7],
  long: [0.7, 1.0],
};

function jitter(value: number, percent = 0.2): number {
  return Math.max(1, value + value * (Math.random() * 2 * percent - percent));
}

export function resolveDelaySeconds(
  category: DelayCategory,
  config: DelayConfig,
): number {
  const minS = config.minDelayMinutes * 60;
  const maxS = config.maxDelayMinutes * 60;
  const range = maxS - minS;

  const [lo, hi] = CATEGORY_RANGES[category];
  const lower = minS + range * lo;
  const upper = minS + range * hi;

  const base = lower + Math.random() * (upper - lower);
  return Math.round(jitter(base));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/agent && pnpm test -- --testPathPattern=delay-resolver`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/agent/src/delivery/delay-resolver.ts services/agent/src/__tests__/delivery/delay-resolver.test.ts
git commit -m "feat(agent): add delay-resolver utility to map delayCategory to config-driven seconds"
```

---

### Task 3: Build Redis Persistent Delivery Queue

**Files:**
- Create: `services/agent/src/delivery/redis-delivery-queue.ts`
- Create: `services/agent/src/__tests__/delivery/redis-delivery-queue.test.ts`

- [ ] **Step 1: Write failing tests for Redis delivery queue**

```typescript
// services/agent/src/__tests__/delivery/redis-delivery-queue.test.ts
import { RedisDeliveryQueue, type RedisDeliveryItem } from '../../delivery/redis-delivery-queue';
import type { PendingMessage, PendingReaction } from '../../graph/state';
import crypto from 'node:crypto';

function makeRedis() {
  const store = new Map<string, string>();
  const sortedSets = new Map<string, Map<string, number>>();
  const sets = new Map<string, Set<string>>();

  return {
    zadd: jest.fn(async (key: string, score: number, member: string) => {
      if (!sortedSets.has(key)) sortedSets.set(key, new Map());
      sortedSets.get(key)!.set(member, score);
      return 1;
    }),
    zrangebyscore: jest.fn(async (key: string, min: string | number, max: string | number) => {
      const set = sortedSets.get(key);
      if (!set) return [];
      const minN = min === '-inf' ? -Infinity : Number(min);
      const maxN = Number(max);
      return [...set.entries()]
        .filter(([, s]) => s >= minN && s <= maxN)
        .sort((a, b) => a[1] - b[1])
        .map(([m]) => m);
    }),
    zrem: jest.fn(async (key: string, member: string) => {
      sortedSets.get(key)?.delete(member);
      return 1;
    }),
    zrangebyscoreBuffer: jest.fn(),
    set: jest.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => { store.delete(key); return 1; }),
    sadd: jest.fn(async (key: string, ...members: string[]) => {
      if (!sets.has(key)) sets.set(key, new Set());
      members.forEach(m => sets.get(key)!.add(m));
      return members.length;
    }),
    smembers: jest.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    srem: jest.fn(async (key: string, member: string) => {
      sets.get(key)?.delete(member);
      return 1;
    }),
    expire: jest.fn(async () => 1),
    _store: store,
    _sortedSets: sortedSets,
    _sets: sets,
  } as any;
}

function makePublisher() {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    publishReaction: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makePersistence(recentCount = 0) {
  return { getRecentMessageCount: jest.fn().mockResolvedValue(recentCount) } as any;
}

function makeMessage(overrides: Partial<PendingMessage> = {}): PendingMessage {
  return {
    type: 'message', asUserId: 'bot1', content: 'Bonjour !', originalLanguage: 'fr',
    mentionedUsernames: [], delaySeconds: 60, delayCategory: 'immediate',
    topicCategory: 'general', topicHash: crypto.createHash('md5').update('Bonjour !').digest('hex').slice(0, 8),
    messageSource: 'agent',
    ...overrides,
  };
}

function makeReaction(overrides: Partial<PendingReaction> = {}): PendingReaction {
  return {
    type: 'reaction', asUserId: 'bot1', targetMessageId: 'm1', emoji: '👍',
    delaySeconds: 10, delayCategory: 'immediate',
    topicCategory: 'reaction', topicHash: 'rxn1',
    ...overrides,
  };
}

describe('RedisDeliveryQueue', () => {
  it('enqueues an action into Redis sorted set', async () => {
    const redis = makeRedis();
    const queue = new RedisDeliveryQueue(redis, makePublisher(), makePersistence());
    await queue.enqueue('conv-1', [makeMessage()]);

    expect(redis.zadd).toHaveBeenCalled();
    expect(redis.sadd).toHaveBeenCalled();
  });

  it('skips action when same topicCategory already scheduled for user today', async () => {
    const redis = makeRedis();
    const queue = new RedisDeliveryQueue(redis, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', [makeMessage({ topicCategory: 'sport' })]);
    const firstCallCount = redis.zadd.mock.calls.length;

    await queue.enqueue('conv-1', [makeMessage({ topicCategory: 'sport' })]);
    // Should have merged, not added a second entry
    expect(redis.zadd.mock.calls.length).toBe(firstCallCount);
  });

  it('allows different topicCategory for same user', async () => {
    const redis = makeRedis();
    const queue = new RedisDeliveryQueue(redis, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', [makeMessage({ topicCategory: 'sport' })]);
    await queue.enqueue('conv-1', [makeMessage({ topicCategory: 'politique' })]);

    expect(redis.zadd).toHaveBeenCalledTimes(2);
  });

  it('respects rate limit: delays action when user has too many in 10min window', async () => {
    const redis = makeRedis();
    const queue = new RedisDeliveryQueue(redis, makePublisher(), makePersistence(), undefined, { maxMessagesPerUserPer10Min: 2 });

    await queue.enqueue('conv-1', [
      makeMessage({ topicCategory: 'a', delaySeconds: 10 }),
      makeMessage({ topicCategory: 'b', delaySeconds: 20 }),
      makeMessage({ topicCategory: 'c', delaySeconds: 30 }),
    ]);

    // All 3 should be enqueued but the 3rd should have a pushed-out scheduledAt
    expect(redis.zadd).toHaveBeenCalledTimes(3);
    const scores = [...redis._sortedSets.get('agent:delivery:pending')!.values()].sort((a, b) => a - b);
    // Third score should be at least 10 minutes after now
    expect(scores[2] - scores[0]).toBeGreaterThanOrEqual(600_000);
  });

  it('polls and delivers ready items', async () => {
    const redis = makeRedis();
    const publisher = makePublisher();
    const queue = new RedisDeliveryQueue(redis, publisher, makePersistence());

    const msg = makeMessage({ delaySeconds: 0 });
    await queue.enqueue('conv-1', [msg]);

    // Simulate poll (items are already past due since delaySeconds=0)
    await queue.poll();

    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('getAll returns serialized pending items', async () => {
    const redis = makeRedis();
    const queue = new RedisDeliveryQueue(redis, makePublisher(), makePersistence());
    await queue.enqueue('conv-1', [makeMessage({ delaySeconds: 3600 })]);

    const items = await queue.getAll();
    expect(items.length).toBe(1);
    expect(items[0].conversationId).toBe('conv-1');
    expect(items[0].remainingMs).toBeGreaterThan(0);
  });

  it('deleteById removes item from sorted set and user index', async () => {
    const redis = makeRedis();
    const queue = new RedisDeliveryQueue(redis, makePublisher(), makePersistence());
    await queue.enqueue('conv-1', [makeMessage()]);

    const items = await queue.getAll();
    const deleted = await queue.deleteById(items[0].id);
    expect(deleted).toBe(true);
    expect(redis.zrem).toHaveBeenCalled();
    expect(redis.srem).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/agent && pnpm test -- --testPathPattern=redis-delivery-queue`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RedisDeliveryQueue**

```typescript
// services/agent/src/delivery/redis-delivery-queue.ts
import { randomUUID } from 'node:crypto';
import crypto from 'node:crypto';
import type Redis from 'ioredis';
import type { PendingAction, PendingMessage, PendingReaction } from '../graph/state';
import type { AgentResponse, AgentReaction } from '../zmq/types';
import type { ZmqAgentPublisher } from '../zmq/zmq-publisher';
import type { MongoPersistence } from '../memory/mongo-persistence';
import type { RedisStateManager } from '../memory/redis-state';

const SORTED_SET_KEY = 'agent:delivery:pending';
const ITEM_PREFIX = 'agent:delivery:item:';
const USER_PREFIX = 'agent:delivery:user:';
const ITEM_TTL = 48 * 3600; // 48 hours

export type RedisDeliveryItem = {
  id: string;
  conversationId: string;
  action: PendingAction;
  topicCategory: string;
  topicHash: string;
  createdAt: number;
  mergeCount: number;
};

export type SerializedDeliveryItem = {
  id: string;
  conversationId: string;
  scheduledAt: number;
  remainingMs: number;
  action: PendingAction;
  topicCategory: string;
  mergeCount: number;
};

type QueueConfig = {
  maxMessagesPerUserPer10Min: number;
};

function conversationGap(action: PendingAction): number {
  if (action.type !== 'message') return 0;
  const wordCount = action.content?.split(/\s+/).length ?? 0;
  if (wordCount <= 4) return 10_000;
  if (wordCount <= 15) return 15_000;
  if (wordCount <= 35) return 30_000;
  if (wordCount <= 65) return 90_000;
  if (wordCount <= 105) return 120_000;
  return 330_000;
}

function jitterMs(value: number, percent = 0.2): number {
  return Math.round(value + value * (Math.random() * 2 * percent - percent));
}

function randomCooldownSeconds(): number {
  const base = 240 + Math.random() * 180;
  return Math.round(base + base * (Math.random() * 0.3 - 0.15));
}

function userKey(conversationId: string, userId: string): string {
  return `${USER_PREFIX}${conversationId}:${userId}`;
}

export class RedisDeliveryQueue {
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private redis: Redis,
    private publisher: ZmqAgentPublisher,
    private persistence: MongoPersistence,
    private stateManager?: RedisStateManager,
    private config: QueueConfig = { maxMessagesPerUserPer10Min: 4 },
  ) {}

  async enqueue(conversationId: string, actions: PendingAction[]): Promise<void> {
    const byUser = new Map<string, PendingAction[]>();
    const reactions: PendingAction[] = [];

    for (const a of actions) {
      if (a.type === 'reaction') {
        reactions.push(a);
      } else {
        const list = byUser.get(a.asUserId) ?? [];
        list.push(a);
        byUser.set(a.asUserId, list);
      }
    }

    for (const action of reactions) {
      await this.scheduleAction(conversationId, action, jitterMs(action.delaySeconds * 1000));
    }

    for (const [userId, userActions] of byUser) {
      const sorted = [...userActions].sort((a, b) => a.delaySeconds - b.delaySeconds);
      let cumulativeMs = jitterMs(sorted[0].delaySeconds * 1000);

      for (let i = 0; i < sorted.length; i++) {
        const action = sorted[i];

        // Check topic conflict — merge if same topicCategory exists today
        const merged = await this.tryMerge(conversationId, userId, action);
        if (merged) continue;

        // Rate limit check
        cumulativeMs = await this.applyRateLimit(conversationId, userId, cumulativeMs);

        // Tempo minimum between same user messages
        if (i > 0 && action.type === 'message') {
          const wordCount = action.content?.split(/\s+/).length ?? 10;
          cumulativeMs += jitterMs(2000 + Math.random() * 4000 + wordCount * 600, 0.25);
        }

        const gap = conversationGap(action);
        const latestForUser = await this.getLatestScheduledAt(conversationId, userId);
        if (latestForUser > 0) {
          const minNext = latestForUser + jitterMs(gap, 0.3);
          const candidate = Date.now() + cumulativeMs;
          if (candidate < minNext) {
            cumulativeMs = minNext - Date.now();
          }
        }

        await this.scheduleAction(conversationId, action, cumulativeMs);
      }
    }

    const msgCount = actions.filter(a => a.type === 'message').length;
    const rxnCount = actions.filter(a => a.type !== 'message').length;
    console.log(`[RedisDeliveryQueue] Enqueued ${actions.length} actions for conv=${conversationId} (${msgCount} messages, ${rxnCount} reactions)`);
  }

  private async tryMerge(conversationId: string, userId: string, action: PendingAction): Promise<boolean> {
    const existingIds = await this.redis.smembers(userKey(conversationId, userId));
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    for (const itemId of existingIds) {
      const raw = await this.redis.get(`${ITEM_PREFIX}${itemId}`);
      if (!raw) continue;

      const existing: RedisDeliveryItem = JSON.parse(raw);
      if (existing.topicCategory === action.topicCategory && existing.createdAt >= todayStart.getTime()) {
        existing.mergeCount += 1;
        await this.redis.set(`${ITEM_PREFIX}${itemId}`, JSON.stringify(existing));
        await this.redis.expire(`${ITEM_PREFIX}${itemId}`, ITEM_TTL);
        console.log(`[RedisDeliveryQueue] Merged action into ${itemId} (topic=${action.topicCategory}, mergeCount=${existing.mergeCount})`);
        return true;
      }
    }
    return false;
  }

  private async applyRateLimit(conversationId: string, userId: string, currentDelayMs: number): Promise<number> {
    const existingIds = await this.redis.smembers(userKey(conversationId, userId));
    const now = Date.now();
    const windowEnd = now + currentDelayMs + 10 * 60 * 1000; // 10 min window from scheduled time
    const windowStart = now + currentDelayMs;
    let countInWindow = 0;

    for (const itemId of existingIds) {
      const raw = await this.redis.get(`${ITEM_PREFIX}${itemId}`);
      if (!raw) continue;
      const item: RedisDeliveryItem = JSON.parse(raw);
      if (item.action.type !== 'message') continue;

      // Get the score (scheduledAt) from the sorted set
      const score = await this.redis.zscore(SORTED_SET_KEY, itemId);
      if (!score) continue;
      const scheduledAt = Number(score);

      if (scheduledAt >= windowStart && scheduledAt <= windowEnd) {
        countInWindow++;
      }
    }

    if (countInWindow >= this.config.maxMessagesPerUserPer10Min) {
      return currentDelayMs + 10 * 60 * 1000; // Push past the 10-min window
    }
    return currentDelayMs;
  }

  private async getLatestScheduledAt(conversationId: string, userId: string): Promise<number> {
    const existingIds = await this.redis.smembers(userKey(conversationId, userId));
    let latest = 0;

    for (const itemId of existingIds) {
      const score = await this.redis.zscore(SORTED_SET_KEY, itemId);
      if (score && Number(score) > latest) {
        latest = Number(score);
      }
    }
    return latest;
  }

  private async scheduleAction(conversationId: string, action: PendingAction, delayMs: number): Promise<void> {
    const id = randomUUID();
    const scheduledAt = Date.now() + Math.max(0, delayMs);

    const item: RedisDeliveryItem = {
      id,
      conversationId,
      action,
      topicCategory: action.topicCategory,
      topicHash: action.topicHash,
      createdAt: Date.now(),
      mergeCount: 0,
    };

    await Promise.all([
      this.redis.zadd(SORTED_SET_KEY, scheduledAt, id),
      this.redis.set(`${ITEM_PREFIX}${id}`, JSON.stringify(item)),
      this.redis.expire(`${ITEM_PREFIX}${id}`, ITEM_TTL),
      this.redis.sadd(userKey(conversationId, action.asUserId), id),
      this.redis.expire(userKey(conversationId, action.asUserId), ITEM_TTL),
    ]);
  }

  async poll(): Promise<void> {
    const now = Date.now();
    const readyIds = await this.redis.zrangebyscore(SORTED_SET_KEY, '-inf', String(now));

    for (const id of readyIds.slice(0, 10)) {
      const raw = await this.redis.get(`${ITEM_PREFIX}${id}`);
      if (!raw) {
        await this.redis.zrem(SORTED_SET_KEY, id);
        continue;
      }

      const item: RedisDeliveryItem = JSON.parse(raw);
      await this.redis.zrem(SORTED_SET_KEY, id);
      await this.redis.del(`${ITEM_PREFIX}${id}`);
      await this.redis.srem(userKey(item.conversationId, item.action.asUserId), id);

      await this.deliver(item.conversationId, item.action);
    }
  }

  startPolling(intervalMs = 10_000): void {
    if (this.pollHandle) return;
    console.log(`[RedisDeliveryQueue] Starting poller every ${intervalMs / 1000}s`);
    this.pollHandle = setInterval(() => {
      this.poll().catch(err => console.error('[RedisDeliveryQueue] Poll error:', err));
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  private async deliver(conversationId: string, action: PendingAction): Promise<void> {
    try {
      const recentCount = await this.persistence.getRecentMessageCount(conversationId, 1);
      if (recentCount > 3 && action.type === 'message') {
        console.log(`[RedisDeliveryQueue] Skipping message — conv=${conversationId} has ${recentCount} recent messages (human activity)`);
        return;
      }

      if (action.type === 'message') {
        await this.deliverMessage(conversationId, action);
      } else {
        await this.deliverReaction(conversationId, action);
      }
    } catch (error) {
      console.error(`[RedisDeliveryQueue] Delivery error for conv=${conversationId}:`, error);
    }
  }

  private async deliverMessage(conversationId: string, action: PendingMessage): Promise<void> {
    const response: AgentResponse = {
      type: 'agent:response',
      conversationId,
      asUserId: action.asUserId,
      content: action.content,
      originalLanguage: action.originalLanguage,
      replyToId: action.replyToId,
      mentionedUsernames: action.mentionedUsernames.length > 0 ? action.mentionedUsernames : undefined,
      messageSource: 'agent',
      metadata: { agentType: 'orchestrator', roleConfidence: 1.0 },
    };

    await this.publisher.publish(response);
    if (this.stateManager) {
      const cooldown = randomCooldownSeconds();
      this.stateManager.setCooldown(conversationId, action.asUserId, cooldown).catch(err =>
        console.error('[RedisDeliveryQueue] Cooldown set error:', err));
    }
    console.log(`[RedisDeliveryQueue] Delivered message: conv=${conversationId} user=${action.asUserId}`);
  }

  private async deliverReaction(conversationId: string, action: PendingReaction): Promise<void> {
    const reaction: AgentReaction = {
      type: 'agent:reaction',
      conversationId,
      asUserId: action.asUserId,
      targetMessageId: action.targetMessageId,
      emoji: action.emoji,
    };

    await this.publisher.publishReaction(reaction);
    console.log(`[RedisDeliveryQueue] Delivered reaction: conv=${conversationId} user=${action.asUserId} emoji=${action.emoji}`);
  }

  async getAll(): Promise<SerializedDeliveryItem[]> {
    const allIds = await this.redis.zrangebyscore(SORTED_SET_KEY, '-inf', '+inf');
    const items: SerializedDeliveryItem[] = [];

    for (const id of allIds) {
      const raw = await this.redis.get(`${ITEM_PREFIX}${id}`);
      if (!raw) continue;
      const item: RedisDeliveryItem = JSON.parse(raw);
      const score = await this.redis.zscore(SORTED_SET_KEY, id);
      const scheduledAt = Number(score ?? 0);
      items.push({
        id: item.id,
        conversationId: item.conversationId,
        scheduledAt,
        remainingMs: Math.max(0, scheduledAt - Date.now()),
        action: item.action,
        topicCategory: item.topicCategory,
        mergeCount: item.mergeCount,
      });
    }

    return items.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  async getByConversation(conversationId: string): Promise<SerializedDeliveryItem[]> {
    const all = await this.getAll();
    return all.filter(item => item.conversationId === conversationId);
  }

  async deleteById(id: string): Promise<boolean> {
    const raw = await this.redis.get(`${ITEM_PREFIX}${id}`);
    if (!raw) return false;

    const item: RedisDeliveryItem = JSON.parse(raw);
    await Promise.all([
      this.redis.zrem(SORTED_SET_KEY, id),
      this.redis.del(`${ITEM_PREFIX}${id}`),
      this.redis.srem(userKey(item.conversationId, item.action.asUserId), id),
    ]);
    console.log(`[RedisDeliveryQueue] Deleted item ${id} for conv=${item.conversationId}`);
    return true;
  }

  async editMessageById(id: string, newContent: string): Promise<SerializedDeliveryItem | null> {
    const raw = await this.redis.get(`${ITEM_PREFIX}${id}`);
    if (!raw) return null;

    const item: RedisDeliveryItem = JSON.parse(raw);
    if (item.action.type !== 'message') return null;

    (item.action as PendingMessage).content = newContent;
    await this.redis.set(`${ITEM_PREFIX}${id}`, JSON.stringify(item));
    await this.redis.expire(`${ITEM_PREFIX}${id}`, ITEM_TTL);

    const score = await this.redis.zscore(SORTED_SET_KEY, id);
    const scheduledAt = Number(score ?? 0);
    return {
      id: item.id,
      conversationId: item.conversationId,
      scheduledAt,
      remainingMs: Math.max(0, scheduledAt - Date.now()),
      action: item.action,
      topicCategory: item.topicCategory,
      mergeCount: item.mergeCount,
    };
  }

  async getScheduledForUser(conversationId: string, userId: string): Promise<SerializedDeliveryItem[]> {
    const ids = await this.redis.smembers(userKey(conversationId, userId));
    const items: SerializedDeliveryItem[] = [];

    for (const id of ids) {
      const raw = await this.redis.get(`${ITEM_PREFIX}${id}`);
      if (!raw) continue;
      const item: RedisDeliveryItem = JSON.parse(raw);
      const score = await this.redis.zscore(SORTED_SET_KEY, id);
      const scheduledAt = Number(score ?? 0);
      items.push({
        id: item.id,
        conversationId: item.conversationId,
        scheduledAt,
        remainingMs: Math.max(0, scheduledAt - Date.now()),
        action: item.action,
        topicCategory: item.topicCategory,
        mergeCount: item.mergeCount,
      });
    }
    return items.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  async getScheduledTopicsForConversation(conversationId: string): Promise<Array<{ userId: string; topicCategory: string; scheduledAt: number; type: 'message' | 'reaction' }>> {
    const items = await this.getByConversation(conversationId);
    return items.map(item => ({
      userId: item.action.asUserId,
      topicCategory: item.topicCategory,
      scheduledAt: item.scheduledAt,
      type: item.action.type,
    }));
  }

  get pendingCount(): Promise<number> {
    return this.redis.zcard(SORTED_SET_KEY);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/agent && pnpm test -- --testPathPattern=redis-delivery-queue`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/agent/src/delivery/redis-delivery-queue.ts services/agent/src/__tests__/delivery/redis-delivery-queue.test.ts
git commit -m "feat(agent): add Redis-persistent delivery queue with topic dedup, rate limiting, and tempo enforcement"
```

---

### Task 4: Update Strategist Prompt and Validation for Delay Categories

**Files:**
- Modify: `services/agent/src/agents/strategist.ts:6-128` (prompt)
- Modify: `services/agent/src/agents/strategist.ts:297-363` (validation)

- [ ] **Step 1: Update strategist system prompt — delay categories and web search**

In `services/agent/src/agents/strategist.ts`, replace the `delaySeconds` line (47) and `needsWebSearch` block (52-54) in `STRATEGIST_SYSTEM_PROMPT`:

Replace:
```
   - delaySeconds: delai relatif pour echelonner (messages: 30-180s, reactions: 5-30s)
```
With:
```
   - delayCategory: "immediate" (reponse directe), "short" (10-60min), "medium" (1-6h, contribution spontanee), "long" (6-24h, sujet de fond)
   - topicCategory: categorie courte du sujet (ex: "sport", "politique", "meteo", "humour", "tech", "culture")
```

Replace:
```
8. Pour chaque intervention "message", indique "needsWebSearch": true/false
   - true si le sujet requiert des informations actuelles ou factuelles
   - false pour conversation sociale, opinions, sujets generaux
```
With:
```
8. Pour chaque intervention "message", indique "needsWebSearch": true/false et "searchHint": string|null
   - needsWebSearch: true si la reponse serait enrichie par des informations recentes, des faits verifiables, ou du contexte externe
   - searchHint: si needsWebSearch est true, une requete de recherche suggeree (ex: "resultats ligue 1 avril 2026")
   - false pour conversations purement sociales ou emotionnelles
```

Add after the `SUJETS RECEMMENT ABORDES` block (line 61):

```
ACTIONS DEJA PROGRAMMEES (NE PAS CREER DE DOUBLONS):
{scheduledActions}
- Si une action est deja programmee pour un utilisateur sur un sujet, NE PAS creer une nouvelle action sur le meme sujet
- Privilegier des sujets DIFFERENTS de ceux deja programmes
```

Add after MODE BURST block (line 98):

```
STRATEGIE DE DISTRIBUTION TEMPORELLE:
- Produis un MIX de delayCategory: pas uniquement "immediate"
- Si la conversation est active (score > 0.4): majorite "immediate"/"short"
- Si la conversation est calme (score <= 0.4): majorite "medium"/"long" pour simuler un retour naturel
- Assure au moins 1 action "medium" ou "long" si le budget le permet, pour garantir de l'activite future
```

- [ ] **Step 2: Update JSON schema in prompt**

Replace the JSON schema template (around lines 106-128) to include new fields:

```json
{
  "shouldIntervene": boolean,
  "reason": "string",
  "currentConversationTopic": "string",
  "interventions": [
    {
      "type": "message",
      "asUserId": "string",
      "topic": "string",
      "topicCategory": "string",
      "replyToMessageId": "string | null",
      "mentionUsernames": ["string"],
      "delayCategory": "immediate | short | medium | long",
      "needsWebSearch": boolean,
      "searchHint": "string | null"
    },
    {
      "type": "reaction",
      "asUserId": "string",
      "targetMessageId": "string",
      "emoji": "string",
      "topicCategory": "string",
      "delayCategory": "immediate | short | medium | long"
    }
  ]
}
```

- [ ] **Step 3: Update validateInterventions to use delayCategory and resolve delays**

In `services/agent/src/agents/strategist.ts`, update the `validateInterventions` function signature to accept delay config:

```typescript
function validateInterventions(
  interventions: unknown[],
  controlledUsers: ControlledUser[],
  messageIds: Set<string>,
  maxMessages: number,
  maxReactions: number,
  state: ConversationState,
): InterventionDirective[] {
```

Replace the message validation block (line 333-343):

```typescript
      const delayCategory = (['immediate', 'short', 'medium', 'long'].includes(String(item.delayCategory))
        ? String(item.delayCategory)
        : 'immediate') as 'immediate' | 'short' | 'medium' | 'long';

      const delaySeconds = resolveDelaySeconds(delayCategory, {
        minDelayMinutes: state.minDelayMinutes ?? 1,
        maxDelayMinutes: state.maxDelayMinutes ?? 360,
      });

      const topicCategory = String(item.topicCategory ?? item.topic ?? 'general').toLowerCase().slice(0, 50);
      const topicHash = crypto.createHash('md5').update(String(item.topic ?? '')).digest('hex').slice(0, 8);

      validated.push({
        type: 'message',
        asUserId: userId,
        topic: String(item.topic ?? ''),
        topicCategory,
        replyToMessageId: item.replyToMessageId ? String(item.replyToMessageId) : undefined,
        mentionUsernames: Array.isArray(item.mentionUsernames) ? item.mentionUsernames.map(String) : [],
        delaySeconds,
        delayCategory,
        needsWebSearch: Boolean(item.needsWebSearch),
        searchHint: typeof item.searchHint === 'string' ? item.searchHint : undefined,
        minWords: limits.minWords,
        maxWords: limits.maxWords,
      });
```

Replace the reaction validation block (line 350-356):

```typescript
      const rxnDelayCategory = (['immediate', 'short', 'medium', 'long'].includes(String(item.delayCategory))
        ? String(item.delayCategory)
        : 'immediate') as 'immediate' | 'short' | 'medium' | 'long';

      validated.push({
        type: 'reaction',
        asUserId: userId,
        targetMessageId: targetId,
        emoji: String(item.emoji ?? '👍'),
        delaySeconds: Math.round(Math.max(5, Math.min(120, resolveDelaySeconds(rxnDelayCategory, {
          minDelayMinutes: 0,
          maxDelayMinutes: 2,
        })))),
        delayCategory: rxnDelayCategory,
        topicCategory: 'reaction',
      });
```

Add at top of file:

```typescript
import crypto from 'node:crypto';
import { resolveDelaySeconds } from '../delivery/delay-resolver';
```

- [ ] **Step 4: Update the strategist node to pass scheduledActions to prompt**

Find where the prompt template variables are interpolated (the function that calls `STRATEGIST_SYSTEM_PROMPT.replace(...)`) and add:

```typescript
.replace('{scheduledActions}', (state.scheduledActions ?? []).length > 0
  ? state.scheduledActions.map(sa =>
    `- ${sa.userId} : "${sa.topicCategory}" dans ${Math.round((sa.scheduledAt - Date.now()) / 60_000)}min (${sa.type})`
  ).join('\n')
  : 'Aucune action programmee')
```

- [ ] **Step 5: Build to check compilation**

Run: `cd services/agent && pnpm run build`
Expected: PASS (or errors in generator/scanner that will be fixed in Tasks 5-6)

- [ ] **Step 6: Commit**

```bash
git add services/agent/src/agents/strategist.ts
git commit -m "feat(agent): update strategist for delayCategory, topicCategory, searchHint, and scheduled actions context"
```

---

### Task 5: Update Generator for Web Search and New Fields

**Files:**
- Modify: `services/agent/src/agents/generator.ts:124-218`

- [ ] **Step 1: Update web search gate in generateMessage**

In `services/agent/src/agents/generator.ts`, replace lines 175-177:

```typescript
  const tools: LlmTool[] | undefined = state.webSearchEnabled
    ? [{ type: 'web_search_preview', search_context_size: 'medium' }] : undefined;
```

- [ ] **Step 2: Add web search nudge when needsWebSearch is true**

Replace line 182-185 (the user message content):

```typescript
      messages: [{
        role: 'user',
        content: `Conversation recente:\n${conversationContext}\n\nReponds en tant que ${user.displayName} sur le sujet: ${directive.topic}${
          directive.needsWebSearch && directive.searchHint
            ? `\n\nUtilise la recherche web pour enrichir ta reponse. Requete suggeree: "${directive.searchHint}"`
            : directive.needsWebSearch
              ? '\n\nDes informations recentes seraient utiles — utilise la recherche web si pertinent.'
              : ''
        }`,
      }],
```

- [ ] **Step 3: Update PendingMessage construction to include new fields**

Replace lines 194-203:

```typescript
    return {
      type: 'message',
      asUserId: directive.asUserId,
      content,
      originalLanguage: userLanguage,
      replyToId: directive.replyToMessageId,
      mentionedUsernames: directive.mentionUsernames,
      delaySeconds: directive.delaySeconds,
      delayCategory: directive.delayCategory,
      topicCategory: directive.topicCategory,
      topicHash: crypto.createHash('md5').update(content).digest('hex').slice(0, 8),
      messageSource: 'agent',
    };
```

- [ ] **Step 4: Update buildReaction to include new fields**

Replace `buildReaction` function (lines 210-218):

```typescript
function buildReaction(directive: ReactionDirective): PendingReaction {
  return {
    type: 'reaction',
    asUserId: directive.asUserId,
    targetMessageId: directive.targetMessageId,
    emoji: directive.emoji,
    delaySeconds: directive.delaySeconds,
    delayCategory: directive.delayCategory,
    topicCategory: directive.topicCategory,
    topicHash: crypto.createHash('md5').update(directive.targetMessageId + directive.emoji).digest('hex').slice(0, 8),
  };
}
```

- [ ] **Step 5: Add crypto import at top**

```typescript
import crypto from 'node:crypto';
```

- [ ] **Step 6: Build to verify**

Run: `cd services/agent && pnpm run build`
Expected: PASS (or minor remaining issues in scanner)

- [ ] **Step 7: Commit**

```bash
git add services/agent/src/agents/generator.ts
git commit -m "feat(agent): web search always available when enabled, add nudge prompt, propagate new PendingAction fields"
```

---

### Task 6: Wire RedisDeliveryQueue into Scanner and Server

**Files:**
- Modify: `services/agent/src/scheduler/conversation-scanner.ts`
- Modify: `services/agent/src/server.ts`

- [ ] **Step 1: Update conversation-scanner to fetch scheduled actions and pass delay config**

In `services/agent/src/scheduler/conversation-scanner.ts`, in the `scanConversation` method (around line 104-148), add to the `conv` object construction:

```typescript
      minDelayMinutes: config?.minDelayMinutes ?? 1,
      maxDelayMinutes: config?.maxDelayMinutes ?? 360,
      spreadOverDayEnabled: config?.spreadOverDayEnabled ?? true,
      maxMessagesPerUserPer10Min: config?.maxMessagesPerUserPer10Min ?? 4,
```

- [ ] **Step 2: In processConversation, fetch scheduled actions before graph invocation**

In `processConversation` method, after the `Promise.all` that fetches messages/summary/toneProfiles (around line 302), add:

```typescript
    const scheduledActions = await this.deliveryQueue.getScheduledTopicsForConversation(conversationId);
```

Note: this requires `deliveryQueue` to be the new `RedisDeliveryQueue`. Update the constructor type:

```typescript
import type { RedisDeliveryQueue } from '../delivery/redis-delivery-queue';
```

Replace `DeliveryQueue` with `RedisDeliveryQueue` in the constructor.

- [ ] **Step 3: Pass scheduledActions and delay config to graph.invoke**

In the `graph.invoke()` call (around line 566-604), add these fields:

```typescript
        scheduledActions,
        minDelayMinutes: conv.minDelayMinutes,
        maxDelayMinutes: conv.maxDelayMinutes,
        spreadOverDayEnabled: conv.spreadOverDayEnabled,
        maxMessagesPerUserPer10Min: conv.maxMessagesPerUserPer10Min,
```

- [ ] **Step 4: Add budget check — skip if enough actions already scheduled**

Before the graph invocation (around line 556), add:

```typescript
    if (scheduledActions.length >= effectiveBudgetRemaining && effectiveBudgetRemaining > 0) {
      console.log(`[Scanner] Skipping conv=${conversationId}: ${scheduledActions.length} actions already scheduled (budget: ${effectiveBudgetRemaining})`);
      tracer.setOutcome({ outcome: 'skipped', messagesSent: 0, reactionsSent: 0, messagesRejected: 0, userIdsUsed: [] });
      await Promise.all([
        this.persistence.createScanLog(tracer.finalize()).catch(err =>
          console.error(`[Scanner] Error persisting scan log:`, err)),
        this.persistence.updateScanStatus(conversationId, false, null),
      ]);
      this.tracerRef.current = null;
      return false;
    }
```

- [ ] **Step 5: Update EligibleConversation type**

In `services/agent/src/scheduler/eligible-conversations.ts` (or wherever `EligibleConversation` is defined), add:

```typescript
  minDelayMinutes: number;
  maxDelayMinutes: number;
  spreadOverDayEnabled: boolean;
  maxMessagesPerUserPer10Min: number;
```

- [ ] **Step 6: Update server.ts to use RedisDeliveryQueue**

In `services/agent/src/server.ts`, replace the `DeliveryQueue` import and instantiation with `RedisDeliveryQueue`:

```typescript
import { RedisDeliveryQueue } from './delivery/redis-delivery-queue';

// Replace: const deliveryQueue = new DeliveryQueue(publisher, persistence, stateManager);
// With:
const deliveryQueue = new RedisDeliveryQueue(redis, publisher, persistence, stateManager, {
  maxMessagesPerUserPer10Min: 4, // default, overridden per-conversation at enqueue time
});
deliveryQueue.startPolling(10_000);
```

Add cleanup on shutdown:

```typescript
// In graceful shutdown handler
deliveryQueue.stopPolling();
```

- [ ] **Step 7: Build and run tests**

Run: `cd services/agent && pnpm run build && pnpm test`
Expected: Build PASS. Some existing delivery-queue tests may fail (they test old in-memory queue) — this is expected since we replaced it.

- [ ] **Step 8: Commit**

```bash
git add services/agent/src/scheduler/conversation-scanner.ts services/agent/src/server.ts services/agent/src/scheduler/eligible-conversations.ts
git commit -m "feat(agent): wire RedisDeliveryQueue into scanner and server, pass scheduledActions and delay config to graph"
```

---

### Task 7: Update Gateway Config Schema

**Files:**
- Modify: `services/gateway/src/routes/admin/agent.ts:33-90`

- [ ] **Step 1: Add new fields to agentConfigSchema**

In `services/gateway/src/routes/admin/agent.ts`, add these fields to the `agentConfigSchema` z.object (before the `.refine` calls around line 80):

```typescript
  minDelayMinutes: z.number().int().min(1).max(1440).optional(),
  maxDelayMinutes: z.number().int().min(1).max(1440).optional(),
  spreadOverDayEnabled: z.boolean().optional(),
  maxMessagesPerUserPer10Min: z.number().int().min(1).max(20).optional(),
```

- [ ] **Step 2: Add validation refinement for minDelay <= maxDelay**

Add after existing `.refine` calls:

```typescript
.refine((data) => {
  if (data.minDelayMinutes !== undefined && data.maxDelayMinutes !== undefined) {
    return data.minDelayMinutes <= data.maxDelayMinutes;
  }
  return true;
}, { message: 'minDelayMinutes doit être <= maxDelayMinutes' })
```

- [ ] **Step 3: Change webSearchEnabled default**

Find where the gateway provides defaults for agent config (search for `webSearchEnabled` in the defaults/response building). Change default from `false` to `true`. This may be in the `getConfig` response handler or in a defaults object.

- [ ] **Step 4: Update the schedule endpoint to include new fields**

In the schedule endpoint (around line 1200-1223), ensure the new delay config fields are included in the response.

- [ ] **Step 5: Build gateway**

Run: `cd services/gateway && pnpm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/routes/admin/agent.ts
git commit -m "feat(gateway): add minDelayMinutes, maxDelayMinutes, spreadOverDayEnabled, maxMessagesPerUserPer10Min to agent config schema; default webSearchEnabled to true"
```

---

### Task 8: Update Frontend Types and ScanControlPanel UI

**Files:**
- Modify: `apps/web/services/agent-admin.service.ts:44-138`
- Modify: `apps/web/components/admin/agent/ScanControlPanel.tsx`

- [ ] **Step 1: Add new fields to AgentConfigData type**

In `apps/web/services/agent-admin.service.ts`, add to `AgentConfigData` (after `reactionBoostFactor` around line 91):

```typescript
  minDelayMinutes: number;
  maxDelayMinutes: number;
  spreadOverDayEnabled: boolean;
  maxMessagesPerUserPer10Min: number;
```

- [ ] **Step 2: Add new fields to AgentConfigUpsert type**

In the same file, add to `AgentConfigUpsert` (after `reactionBoostFactor` around line 137):

```typescript
  minDelayMinutes?: number;
  maxDelayMinutes?: number;
  spreadOverDayEnabled?: boolean;
  maxMessagesPerUserPer10Min?: number;
```

- [ ] **Step 3: Add UI controls in ScanControlPanel**

In `apps/web/components/admin/agent/ScanControlPanel.tsx`, add a new section after the Cadence section (around line 327). Add to the form initialization (around line 65-83) the new default values:

```typescript
  minDelayMinutes: config?.minDelayMinutes ?? 1,
  maxDelayMinutes: config?.maxDelayMinutes ?? 360,
  spreadOverDayEnabled: config?.spreadOverDayEnabled ?? true,
  maxMessagesPerUserPer10Min: config?.maxMessagesPerUserPer10Min ?? 4,
```

Add a new UI section "Distribution temporelle" with:
- Number input: `minDelayMinutes` (label: "Delai minimum (minutes)", min: 1, max: 1440)
- Number input: `maxDelayMinutes` (label: "Delai maximum (minutes)", min: 1, max: 1440)
- Toggle: `spreadOverDayEnabled` (label: "Etaler les actions sur la journee")
- Number input: `maxMessagesPerUserPer10Min` (label: "Max messages par user / 10min", min: 1, max: 20)

Follow the existing UI patterns in the file for input styling and layout.

- [ ] **Step 4: Build frontend**

Run: `cd apps/web && pnpm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/services/agent-admin.service.ts apps/web/components/admin/agent/ScanControlPanel.tsx
git commit -m "feat(web): add delay distribution config fields to agent admin UI"
```

---

### Task 9: Update Existing Tests and Fix Old DeliveryQueue References

**Files:**
- Modify: `services/agent/src/__tests__/delivery/delivery-queue.test.ts`
- Potentially modify: any file importing old `DeliveryQueue`

- [ ] **Step 1: Update existing delivery-queue tests to use new PendingMessage shape**

In `services/agent/src/__tests__/delivery/delivery-queue.test.ts`, update the `makeMessage` factory:

```typescript
function makeMessage(overrides: Partial<PendingMessage> = {}): PendingMessage {
  return {
    type: 'message', asUserId: 'bot1', content: 'Bonjour !', originalLanguage: 'fr',
    mentionedUsernames: [], delaySeconds: 0, delayCategory: 'immediate',
    topicCategory: 'general', topicHash: 'abc12345',
    messageSource: 'agent',
    ...overrides,
  };
}
```

Update `makeReaction`:

```typescript
function makeReaction(overrides: Partial<PendingReaction> = {}): PendingReaction {
  return {
    type: 'reaction', asUserId: 'bot1', targetMessageId: 'm1', emoji: '👍',
    delaySeconds: 0, delayCategory: 'immediate',
    topicCategory: 'reaction', topicHash: 'rxn12345',
    ...overrides,
  };
}
```

- [ ] **Step 2: Search for other files importing old DeliveryQueue**

Run: `grep -r "from.*delivery-queue" services/agent/src/ --include="*.ts" | grep -v __tests__ | grep -v node_modules`

For each file found, update the import to `RedisDeliveryQueue` if it references the class directly.

- [ ] **Step 3: Run full test suite**

Run: `cd services/agent && pnpm test`
Expected: PASS (all tests updated)

- [ ] **Step 4: Run full build**

Run: `cd services/agent && pnpm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A services/agent/
git commit -m "fix(agent): update all tests and imports for new PendingAction shape and RedisDeliveryQueue"
```

---

### Task 10: Update Reactive Timing Calculator

**Files:**
- Modify: `services/agent/src/reactive/timing-calculator.ts`

- [ ] **Step 1: No structural change needed — reactive path keeps fast delays**

The reactive path (interpellation handler) keeps its existing fast delays (2s-180s). This is intentional — direct mentions and replies need immediate response.

Verify the reactive handler constructs PendingMessage with the new required fields. Find where PendingMessage is created in the reactive handler:

Run: `grep -n "type: 'message'" services/agent/src/reactive/ --include="*.ts" -r`

For each occurrence, add the missing fields:

```typescript
delayCategory: 'immediate',
topicCategory: 'interpellation',
topicHash: crypto.createHash('md5').update(content).digest('hex').slice(0, 8),
```

- [ ] **Step 2: Build to verify**

Run: `cd services/agent && pnpm run build`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `cd services/agent && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add services/agent/src/reactive/
git commit -m "feat(agent): add required delayCategory/topicCategory/topicHash to reactive PendingMessage construction"
```

---

### Task 11: Final Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Full build of agent service**

Run: `cd services/agent && pnpm run build`
Expected: PASS with zero errors

- [ ] **Step 2: Full test suite**

Run: `cd services/agent && pnpm test`
Expected: All tests PASS

- [ ] **Step 3: Gateway build**

Run: `cd services/gateway && pnpm run build`
Expected: PASS

- [ ] **Step 4: Frontend build**

Run: `cd apps/web && pnpm run build`
Expected: PASS

- [ ] **Step 5: Verify the data flow end-to-end**

Check that:
1. `state.ts` types have `delayCategory`, `topicCategory`, `topicHash` on PendingMessage/PendingReaction
2. `strategist.ts` prompt asks for `delayCategory` and `topicCategory`
3. `strategist.ts` validation resolves `delayCategory` to seconds via `delay-resolver.ts`
4. `generator.ts` passes web search tool when `webSearchEnabled=true` and adds nudge when `needsWebSearch=true`
5. `generator.ts` propagates `delayCategory`, `topicCategory`, `topicHash` to PendingMessage
6. `conversation-scanner.ts` fetches scheduled actions, passes them + delay config to graph
7. `redis-delivery-queue.ts` checks topic conflicts, rate limits, and tempo before enqueue
8. `server.ts` creates `RedisDeliveryQueue` and starts polling
9. Gateway schema accepts new config fields
10. Frontend displays new config fields

- [ ] **Step 6: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(agent): integration verification fixes"
```
