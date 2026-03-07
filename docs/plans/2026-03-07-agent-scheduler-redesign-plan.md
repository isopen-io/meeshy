# Agent Scheduler Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the agent scheduler from mechanical timed posting into an intelligent, burst-based system with daily budgets, user rotation, and admin-configurable scheduling parameters.

**Architecture:** Enrich `AgentConfig` Prisma model with scheduling fields + new `AgentGlobalConfig` singleton model. Add `DailyBudgetManager` (Redis-backed) and `ConfigCache` (Redis + PubSub invalidation) modules. Modify strategist to use weighted user rotation and burst scheduling. Extend admin panel with scheduling controls.

**Tech Stack:** TypeScript (Fastify 5, LangGraph), Redis (ioredis), MongoDB (Prisma), React (Next.js 15), Zod validation

---

## Task 1: Prisma Schema — Add Scheduling Fields to AgentConfig

**Files:**
- Modify: `packages/shared/prisma/schema.prisma:2951` (after `qualityGateMinScore`)

**Step 1: Add new fields to AgentConfig model**

In `packages/shared/prisma/schema.prisma`, add these fields BEFORE the `createdAt` line (line 2953):

```prisma
  /// Daily scheduling — weekday
  weekdayMaxMessages       Int      @default(10)
  weekendMaxMessages       Int      @default(25)
  weekdayMaxUsers          Int      @default(4)
  weekendMaxUsers          Int      @default(6)

  /// Burst scheduling
  burstEnabled             Boolean  @default(true)
  burstSize                Int      @default(4)
  burstIntervalMinutes     Int      @default(5)
  quietIntervalMinutes     Int      @default(90)

  /// Inactivity threshold in days (replaces semantic use of inactivityThresholdHours)
  inactivityDaysThreshold  Int      @default(3)

  /// Reactivity rules
  prioritizeTaggedUsers    Boolean  @default(true)
  prioritizeRepliedUsers   Boolean  @default(true)
  reactionBoostFactor      Float    @default(1.5)
```

**Step 2: Add AgentGlobalConfig model**

After the `AgentAnalytic` model (end of agent models block), add:

```prisma
model AgentGlobalConfig {
  id                    String   @id @default(auto()) @map("_id") @db.ObjectId
  /// Global system prompt for all agent interactions
  systemPrompt          String   @default("Tu es un systeme d'animation de conversations. Ton role est de maintenir des echanges naturels et engageants en imitant le style des utilisateurs inactifs.")
  /// Global kill switch
  enabled               Boolean  @default(true)
  /// Default LLM provider
  defaultProvider       String   @default("openai")
  /// Default LLM model
  defaultModel          String   @default("gpt-4o-mini")
  /// Fallback provider
  fallbackProvider      String?
  /// Fallback model
  fallbackModel         String?
  /// Daily budget in USD across all conversations
  globalDailyBudgetUsd  Float    @default(10.0)
  /// Max concurrent LLM calls
  maxConcurrentCalls    Int      @default(5)

  updatedAt             DateTime @updatedAt
}
```

**Step 3: Generate Prisma client**

Run: `cd packages/shared && pnpm prisma generate`
Expected: "Generated Prisma Client"

**Step 4: Push schema to MongoDB**

Run: `cd packages/shared && pnpm prisma db push`
Expected: "Your database is now in sync with your Prisma schema."

**Step 5: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(schema): add scheduling fields to AgentConfig + AgentGlobalConfig model"
```

---

## Task 2: Config Cache with Redis PubSub Invalidation

**Files:**
- Create: `services/agent/src/config/config-cache.ts`
- Create: `services/agent/src/__tests__/config/config-cache.test.ts`

**Step 1: Write the failing test**

Create `services/agent/src/__tests__/config/config-cache.test.ts`:

```typescript
import { ConfigCache } from '../../config/config-cache';

function makeRedis(store: Map<string, string> = new Map()) {
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, val: string, _ex?: string, _ttl?: number) => {
      store.set(key, val);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => { store.delete(key); return 1; }),
    subscribe: jest.fn(),
    on: jest.fn(),
    duplicate: jest.fn().mockReturnThis(),
  } as any;
}

function makePersistence(config: Record<string, unknown> | null = null) {
  return {
    getAgentConfig: jest.fn().mockResolvedValue(config),
  } as any;
}

describe('ConfigCache', () => {
  it('returns cached config on hit', async () => {
    const cachedConfig = { conversationId: 'conv-1', enabled: true, weekdayMaxMessages: 10 };
    const store = new Map([['agent:config:conv-1', JSON.stringify(cachedConfig)]]);
    const redis = makeRedis(store);
    const persistence = makePersistence();
    const cache = new ConfigCache(redis, persistence);

    const result = await cache.getConfig('conv-1');

    expect(result).toEqual(cachedConfig);
    expect(persistence.getAgentConfig).not.toHaveBeenCalled();
  });

  it('fetches from DB on cache miss and populates cache', async () => {
    const dbConfig = { conversationId: 'conv-1', enabled: true, weekdayMaxMessages: 15 };
    const redis = makeRedis();
    const persistence = makePersistence(dbConfig);
    const cache = new ConfigCache(redis, persistence);

    const result = await cache.getConfig('conv-1');

    expect(result).toEqual(dbConfig);
    expect(persistence.getAgentConfig).toHaveBeenCalledWith('conv-1');
    expect(redis.set).toHaveBeenCalledWith('agent:config:conv-1', JSON.stringify(dbConfig), 'EX', 300);
  });

  it('returns null when config not found anywhere', async () => {
    const redis = makeRedis();
    const persistence = makePersistence(null);
    const cache = new ConfigCache(redis, persistence);

    const result = await cache.getConfig('conv-1');

    expect(result).toBeNull();
  });

  it('invalidate removes config from cache', async () => {
    const store = new Map([['agent:config:conv-1', '{}']]);
    const redis = makeRedis(store);
    const cache = new ConfigCache(redis, makePersistence());

    await cache.invalidate('conv-1');

    expect(redis.del).toHaveBeenCalledWith('agent:config:conv-1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd services/agent && pnpm test -- --testPathPattern=config-cache`
Expected: FAIL — Cannot find module '../../config/config-cache'

**Step 3: Write implementation**

Create `services/agent/src/config/config-cache.ts`:

```typescript
import type Redis from 'ioredis';
import type { MongoPersistence } from '../memory/mongo-persistence';

const CONFIG_PREFIX = 'agent:config:';
const GLOBAL_CONFIG_KEY = 'agent:global-config';
const CONFIG_TTL = 300; // 5 minutes
const GLOBAL_CONFIG_TTL = 600; // 10 minutes
const INVALIDATION_CHANNEL = 'agent:config-invalidated';

export class ConfigCache {
  private subscriber: Redis | null = null;

  constructor(
    private redis: Redis,
    private persistence: MongoPersistence,
  ) {}

  async getConfig(conversationId: string) {
    const key = `${CONFIG_PREFIX}${conversationId}`;
    const cached = await this.redis.get(key);

    if (cached) return JSON.parse(cached);

    const config = await this.persistence.getAgentConfig(conversationId);
    if (config) {
      await this.redis.set(key, JSON.stringify(config), 'EX', CONFIG_TTL);
    }

    return config;
  }

  async getGlobalConfig() {
    const cached = await this.redis.get(GLOBAL_CONFIG_KEY);
    if (cached) return JSON.parse(cached);

    const config = await this.persistence.getGlobalConfig();
    if (config) {
      await this.redis.set(GLOBAL_CONFIG_KEY, JSON.stringify(config), 'EX', GLOBAL_CONFIG_TTL);
    }

    return config;
  }

  async invalidate(conversationId: string) {
    await this.redis.del(`${CONFIG_PREFIX}${conversationId}`);
  }

  async invalidateGlobal() {
    await this.redis.del(GLOBAL_CONFIG_KEY);
  }

  async startListening() {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(INVALIDATION_CHANNEL);

    this.subscriber.on('message', async (_channel: string, message: string) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.conversationId) {
          await this.invalidate(parsed.conversationId);
          console.log(`[ConfigCache] Invalidated config for conv=${parsed.conversationId}`);
        }
        if (parsed.global) {
          await this.invalidateGlobal();
          console.log('[ConfigCache] Invalidated global config');
        }
      } catch {
        console.error('[ConfigCache] Invalid invalidation message:', message);
      }
    });

    console.log('[ConfigCache] Listening for invalidation events');
  }

  async stopListening() {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(INVALIDATION_CHANNEL);
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd services/agent && pnpm test -- --testPathPattern=config-cache`
Expected: 4 tests PASS

**Step 5: Add `getGlobalConfig` to MongoPersistence**

In `services/agent/src/memory/mongo-persistence.ts`, add after `getSummaryRecord` method:

```typescript
async getGlobalConfig() {
  return this.prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
}
```

**Step 6: Commit**

```bash
git add services/agent/src/config/config-cache.ts services/agent/src/__tests__/config/config-cache.test.ts services/agent/src/memory/mongo-persistence.ts
git commit -m "feat(agent): config cache with Redis PubSub invalidation"
```

---

## Task 3: DailyBudgetManager

**Files:**
- Create: `services/agent/src/scheduler/daily-budget.ts`
- Create: `services/agent/src/__tests__/scheduler/daily-budget.test.ts`

**Step 1: Write the failing test**

Create `services/agent/src/__tests__/scheduler/daily-budget.test.ts`:

```typescript
import { DailyBudgetManager } from '../../scheduler/daily-budget';

function makeRedis(store: Map<string, string> = new Map()) {
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, val: string) => { store.set(key, val); return 'OK'; }),
    incr: jest.fn(async (key: string) => {
      const v = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(v));
      return v;
    }),
    expire: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    scard: jest.fn(async (key: string) => {
      const val = store.get(key);
      return val ? parseInt(val, 10) : 0;
    }),
  } as any;
}

describe('DailyBudgetManager', () => {
  const NOW = new Date('2026-03-07T14:00:00Z'); // Saturday

  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('allows message when budget not exhausted', async () => {
    const manager = new DailyBudgetManager(makeRedis());
    const result = await manager.canSendMessage('conv-1', {
      weekdayMaxMessages: 10,
      weekendMaxMessages: 25,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(25); // Saturday = weekend
  });

  it('blocks when daily budget is exhausted', async () => {
    const store = new Map([['agent:budget:conv-1:2026-03-07', '25']]);
    const manager = new DailyBudgetManager(makeRedis(store));

    const result = await manager.canSendMessage('conv-1', {
      weekdayMaxMessages: 10,
      weekendMaxMessages: 25,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('uses weekday budget on weekdays', async () => {
    const monday = new Date('2026-03-09T14:00:00Z'); // Monday
    jest.setSystemTime(monday);

    const manager = new DailyBudgetManager(makeRedis());
    const result = await manager.canSendMessage('conv-1', {
      weekdayMaxMessages: 10,
      weekendMaxMessages: 25,
    });

    expect(result.remaining).toBe(10);
  });

  it('increments counter on recordMessage', async () => {
    const redis = makeRedis();
    const manager = new DailyBudgetManager(redis);

    await manager.recordMessage('conv-1', 'user-1');

    expect(redis.incr).toHaveBeenCalledWith('agent:budget:conv-1:2026-03-07');
    expect(redis.sadd).toHaveBeenCalledWith('agent:budget:conv-1:2026-03-07:users', 'user-1');
  });

  it('checks user count against max', async () => {
    const store = new Map([['agent:budget:conv-1:2026-03-07:users', '6']]);
    const manager = new DailyBudgetManager(makeRedis(store));

    const result = await manager.canAddUser('conv-1', {
      weekdayMaxUsers: 4,
      weekendMaxUsers: 6,
    });

    expect(result.allowed).toBe(false);
  });

  it('checks burst cooldown', async () => {
    const lastBurst = String(Date.now() - 30 * 60 * 1000); // 30 min ago
    const store = new Map([['agent:budget:conv-1:last-burst', lastBurst]]);
    const manager = new DailyBudgetManager(makeRedis(store));

    const result = await manager.canBurst('conv-1', { quietIntervalMinutes: 90 });

    expect(result.allowed).toBe(false);
    expect(result.minutesUntilNext).toBeGreaterThan(0);
  });

  it('allows burst when cooldown elapsed', async () => {
    const lastBurst = String(Date.now() - 100 * 60 * 1000); // 100 min ago
    const store = new Map([['agent:budget:conv-1:last-burst', lastBurst]]);
    const manager = new DailyBudgetManager(makeRedis(store));

    const result = await manager.canBurst('conv-1', { quietIntervalMinutes: 90 });

    expect(result.allowed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd services/agent && pnpm test -- --testPathPattern=daily-budget`
Expected: FAIL — Cannot find module '../../scheduler/daily-budget'

**Step 3: Write implementation**

Create `services/agent/src/scheduler/daily-budget.ts`:

```typescript
import type Redis from 'ioredis';

const BUDGET_PREFIX = 'agent:budget:';
const BUDGET_TTL = 172800; // 48h

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

type BudgetLimits = {
  weekdayMaxMessages: number;
  weekendMaxMessages: number;
};

type UserLimits = {
  weekdayMaxUsers: number;
  weekendMaxUsers: number;
};

type BurstLimits = {
  quietIntervalMinutes: number;
};

export class DailyBudgetManager {
  constructor(private redis: Redis) {}

  async canSendMessage(conversationId: string, limits: BudgetLimits) {
    const key = `${BUDGET_PREFIX}${conversationId}:${todayKey()}`;
    const current = parseInt(await this.redis.get(key) ?? '0', 10);
    const max = isWeekend() ? limits.weekendMaxMessages : limits.weekdayMaxMessages;
    const remaining = Math.max(0, max - current);

    return { allowed: current < max, remaining, current, max };
  }

  async canAddUser(conversationId: string, limits: UserLimits) {
    const key = `${BUDGET_PREFIX}${conversationId}:${todayKey()}:users`;
    const current = await this.redis.scard(key);
    const max = isWeekend() ? limits.weekendMaxUsers : limits.weekdayMaxUsers;

    return { allowed: current < max, current, max };
  }

  async canBurst(conversationId: string, limits: BurstLimits) {
    const key = `${BUDGET_PREFIX}${conversationId}:last-burst`;
    const lastBurst = parseInt(await this.redis.get(key) ?? '0', 10);
    const elapsed = Date.now() - lastBurst;
    const cooldownMs = limits.quietIntervalMinutes * 60 * 1000;
    const minutesUntilNext = Math.max(0, Math.ceil((cooldownMs - elapsed) / 60000));

    return { allowed: elapsed >= cooldownMs, minutesUntilNext };
  }

  async recordMessage(conversationId: string, userId: string) {
    const date = todayKey();
    const counterKey = `${BUDGET_PREFIX}${conversationId}:${date}`;
    const usersKey = `${BUDGET_PREFIX}${conversationId}:${date}:users`;

    await Promise.all([
      this.redis.incr(counterKey),
      this.redis.expire(counterKey, BUDGET_TTL),
      this.redis.sadd(usersKey, userId),
      this.redis.expire(usersKey, BUDGET_TTL),
    ]);
  }

  async recordBurst(conversationId: string) {
    const key = `${BUDGET_PREFIX}${conversationId}:last-burst`;
    await this.redis.set(key, String(Date.now()), 'EX', BUDGET_TTL);
  }

  async getTodayStats(conversationId: string) {
    const date = todayKey();
    const [messageCount, userCount] = await Promise.all([
      this.redis.get(`${BUDGET_PREFIX}${conversationId}:${date}`),
      this.redis.scard(`${BUDGET_PREFIX}${conversationId}:${date}:users`),
    ]);

    return {
      messagesUsed: parseInt(messageCount ?? '0', 10),
      usersActive: userCount,
      isWeekend: isWeekend(),
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd services/agent && pnpm test -- --testPathPattern=daily-budget`
Expected: 7 tests PASS

**Step 5: Commit**

```bash
git add services/agent/src/scheduler/daily-budget.ts services/agent/src/__tests__/scheduler/daily-budget.test.ts
git commit -m "feat(agent): daily budget manager with weekday/weekend limits and burst cooldown"
```

---

## Task 4: Integrate Budget + Cache into Scanner

**Files:**
- Modify: `services/agent/src/scheduler/conversation-scanner.ts`
- Modify: `services/agent/src/scheduler/eligible-conversations.ts`
- Modify: `services/agent/src/server.ts`
- Modify: `services/agent/src/graph/state.ts`

**Step 1: Add new state fields to LangGraph state**

In `services/agent/src/graph/state.ts`, add before the `agentHistory` annotation (line ~206):

```typescript
  budgetRemaining: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 10,
  }),
  todayUsersActive: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  maxUsersToday: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 4,
  }),
  burstMode: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => true,
  }),
  burstSize: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 4,
  }),
  prioritizeTaggedUsers: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => true,
  }),
  prioritizeRepliedUsers: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => true,
  }),
  reactionBoostFactor: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 1.5,
  }),
```

**Step 2: Add scheduling fields to EligibleConversation type**

In `services/agent/src/scheduler/eligible-conversations.ts`, add to the `EligibleConversation` type:

```typescript
  weekdayMaxMessages: number;
  weekendMaxMessages: number;
  weekdayMaxUsers: number;
  weekendMaxUsers: number;
  burstEnabled: boolean;
  burstSize: number;
  burstIntervalMinutes: number;
  quietIntervalMinutes: number;
  inactivityDaysThreshold: number;
  prioritizeTaggedUsers: boolean;
  prioritizeRepliedUsers: boolean;
  reactionBoostFactor: number;
```

And map them in the `findEligibleConversations` return:

```typescript
    weekdayMaxMessages: config.weekdayMaxMessages,
    weekendMaxMessages: config.weekendMaxMessages,
    weekdayMaxUsers: config.weekdayMaxUsers,
    weekendMaxUsers: config.weekendMaxUsers,
    burstEnabled: config.burstEnabled,
    burstSize: config.burstSize,
    burstIntervalMinutes: config.burstIntervalMinutes,
    quietIntervalMinutes: config.quietIntervalMinutes,
    inactivityDaysThreshold: config.inactivityDaysThreshold,
    prioritizeTaggedUsers: config.prioritizeTaggedUsers,
    prioritizeRepliedUsers: config.prioritizeRepliedUsers,
    reactionBoostFactor: config.reactionBoostFactor,
```

**Step 3: Modify ConversationScanner to use ConfigCache and DailyBudgetManager**

In `services/agent/src/scheduler/conversation-scanner.ts`:

1. Add imports and constructor params for `ConfigCache` and `DailyBudgetManager`
2. In `scanAll()`, replace `this.persistence.getEligibleConversations()` call — instead get eligible convs and then pass them through budget check
3. In `processConversation()`, check budget before invoking graph, and pass budget info to the graph state
4. After delivery, call `budgetManager.recordMessage()` and `budgetManager.recordBurst()`

Key changes to `processConversation`:

```typescript
// Before graph.invoke, add budget check:
const budgetCheck = await this.budgetManager.canSendMessage(conversationId, {
  weekdayMaxMessages: conv.weekdayMaxMessages,
  weekendMaxMessages: conv.weekendMaxMessages,
});

if (!budgetCheck.allowed) {
  console.log(`[Scanner] Budget exhausted for conv=${conversationId}: ${budgetCheck.current}/${budgetCheck.max}`);
  return;
}

// If burst mode, check burst cooldown:
if (conv.burstEnabled) {
  const burstCheck = await this.budgetManager.canBurst(conversationId, {
    quietIntervalMinutes: conv.quietIntervalMinutes,
  });
  if (!burstCheck.allowed) {
    console.log(`[Scanner] Burst cooldown for conv=${conversationId}: ${burstCheck.minutesUntilNext}min remaining`);
    return;
  }
}

// Pass budget info to graph:
const result = await this.graph.invoke({
  ...existingParams,
  budgetRemaining: budgetCheck.remaining,
  todayUsersActive: (await this.budgetManager.getTodayStats(conversationId)).usersActive,
  maxUsersToday: isWeekend ? conv.weekendMaxUsers : conv.weekdayMaxUsers,
  burstMode: conv.burstEnabled,
  burstSize: conv.burstSize,
  prioritizeTaggedUsers: conv.prioritizeTaggedUsers,
  prioritizeRepliedUsers: conv.prioritizeRepliedUsers,
  reactionBoostFactor: conv.reactionBoostFactor,
});
```

After enqueueing messages:

```typescript
// After this.deliveryQueue.enqueue():
for (const msg of messageActions) {
  await this.budgetManager.recordMessage(conversationId, msg.asUserId);
}
if (conv.burstEnabled && messageActions.length > 0) {
  await this.budgetManager.recordBurst(conversationId);
}
```

**Step 4: Wire ConfigCache and BudgetManager in server.ts**

In `services/agent/src/server.ts`, add:

```typescript
import { ConfigCache } from './config/config-cache';
import { DailyBudgetManager } from './scheduler/daily-budget';

// After Redis and Prisma init:
const configCache = new ConfigCache(redis, persistence);
const budgetManager = new DailyBudgetManager(redis);

// Start PubSub listener:
await configCache.startListening();

// Pass to scanner:
const scanner = new ConversationScanner(graph, persistence, stateManager, deliveryQueue, redis, configCache, budgetManager);

// In shutdown:
await configCache.stopListening();
```

**Step 5: Run existing tests**

Run: `cd services/agent && pnpm test`
Expected: All existing tests should still pass (may need mock updates for new constructor params)

**Step 6: Update scanner test mocks for new constructor params**

In `services/agent/src/__tests__/scheduler/conversation-scanner.test.ts`, update `ConversationScanner` constructor calls to pass `configCache` and `budgetManager` mocks:

```typescript
function makeConfigCache() {
  return { getConfig: jest.fn().mockResolvedValue(null), getGlobalConfig: jest.fn().mockResolvedValue(null) } as any;
}

function makeBudgetManager() {
  return {
    canSendMessage: jest.fn().mockResolvedValue({ allowed: true, remaining: 10, current: 0, max: 10 }),
    canBurst: jest.fn().mockResolvedValue({ allowed: true, minutesUntilNext: 0 }),
    canAddUser: jest.fn().mockResolvedValue({ allowed: true, current: 0, max: 4 }),
    recordMessage: jest.fn().mockResolvedValue(undefined),
    recordBurst: jest.fn().mockResolvedValue(undefined),
    getTodayStats: jest.fn().mockResolvedValue({ messagesUsed: 0, usersActive: 0, isWeekend: false }),
  } as any;
}
```

**Step 7: Run all tests**

Run: `cd services/agent && pnpm test`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add services/agent/src/scheduler/ services/agent/src/graph/state.ts services/agent/src/server.ts services/agent/src/__tests__/
git commit -m "feat(agent): integrate budget manager and config cache into scanner pipeline"
```

---

## Task 5: Update Strategist for Budget-Aware User Rotation

**Files:**
- Modify: `services/agent/src/agents/strategist.ts`

**Step 1: Update strategist prompt with budget and rotation context**

In `services/agent/src/agents/strategist.ts`, add to the `STRATEGIST_SYSTEM_PROMPT`:

After the existing `REGLES ANTI-REPETITION:` section, add:

```
BUDGET QUOTIDIEN:
- Il reste {budgetRemaining} messages autorise(s) aujourd'hui pour cette conversation
- {todayUsersActive} utilisateurs ont deja parle aujourd'hui (max: {maxUsersToday})
- NE DEPASSE PAS le budget restant ({budgetRemaining} messages max)
- Favorise les utilisateurs qui n'ont PAS encore parle aujourd'hui

ROTATION UTILISATEURS:
- Poids 3x pour les utilisateurs qui n'ont pas parle aujourd'hui
- Les utilisateurs dont les messages ont recu des reactions parlent {reactionBoostFactor}x plus souvent
- Si un utilisateur est @mentionne dans un message recent: il DOIT intervenir (priorite absolue)
- Si un message recent est une reponse a un message d'un utilisateur inactif: il DOIT reagir

MODE BURST (si actif):
- Genere exactement {burstSize} interventions avec des delais courts (30-180s entre chaque)
- Les interventions doivent former un echange naturel (question/reponse, reactions)
- Utilise au moins 2 utilisateurs differents dans le burst
```

**Step 2: Pass new state fields into prompt builder**

In `buildStrategistPrompt`, add the template replacements:

```typescript
.replace('{budgetRemaining}', String(state.budgetRemaining))
.replace('{todayUsersActive}', String(state.todayUsersActive))
.replace('{maxUsersToday}', String(state.maxUsersToday))
.replace('{reactionBoostFactor}', String(state.reactionBoostFactor))
.replace('{burstSize}', String(state.burstSize))
```

**Step 3: Add budget-based early return**

In `strategist` function, add after the `activityScore > 0.7` check:

```typescript
if (state.budgetRemaining <= 0) {
  return {
    interventionPlan: { shouldIntervene: false, reason: 'Daily budget exhausted', interventions: [] } satisfies InterventionPlan,
  };
}
```

**Step 4: Cap intervention count to budget remaining**

In `validateInterventions`, replace `maxMessages` with `Math.min(maxMessages, state.budgetRemaining)` — pass `budgetRemaining` as parameter:

```typescript
const effectiveMaxMessages = Math.min(maxResponses, state.budgetRemaining);
```

**Step 5: Run tests**

Run: `cd services/agent && pnpm test`
Expected: PASS

**Step 6: Commit**

```bash
git add services/agent/src/agents/strategist.ts
git commit -m "feat(agent): budget-aware strategist with user rotation and burst mode"
```

---

## Task 6: Gateway Admin Routes — Scheduling Fields + PubSub + Global Config

**Files:**
- Modify: `services/gateway/src/routes/admin/agent.ts`

**Step 1: Extend agentConfigSchema with new fields**

In `services/gateway/src/routes/admin/agent.ts`, add to `agentConfigSchema` (after line 45):

```typescript
  weekdayMaxMessages: z.number().int().min(1).max(100).optional(),
  weekendMaxMessages: z.number().int().min(1).max(200).optional(),
  weekdayMaxUsers: z.number().int().min(1).max(20).optional(),
  weekendMaxUsers: z.number().int().min(1).max(30).optional(),
  burstEnabled: z.boolean().optional(),
  burstSize: z.number().int().min(1).max(10).optional(),
  burstIntervalMinutes: z.number().int().min(1).max(30).optional(),
  quietIntervalMinutes: z.number().int().min(10).max(480).optional(),
  inactivityDaysThreshold: z.number().int().min(1).max(30).optional(),
  prioritizeTaggedUsers: z.boolean().optional(),
  prioritizeRepliedUsers: z.boolean().optional(),
  reactionBoostFactor: z.number().min(0.5).max(5).optional(),
```

**Step 2: Add Redis PubSub publish on config update**

In the `PUT /configs/:conversationId` handler, after the `prisma.agentConfig.upsert` call:

```typescript
const redis = getRedisWrapper().getClient();
await redis.publish('agent:config-invalidated', JSON.stringify({ conversationId }));
```

**Step 3: Add global config routes**

After the existing routes, add:

```typescript
const globalConfigSchema = z.object({
  systemPrompt: z.string().max(10000).optional(),
  enabled: z.boolean().optional(),
  defaultProvider: z.enum(['openai', 'anthropic']).optional(),
  defaultModel: z.string().min(1).optional(),
  fallbackProvider: z.string().nullable().optional(),
  fallbackModel: z.string().nullable().optional(),
  globalDailyBudgetUsd: z.number().min(0).max(1000).optional(),
  maxConcurrentCalls: z.number().int().min(1).max(50).optional(),
});

// GET /global-config
fastify.get('/global-config', {
  onRequest: [fastify.authenticate, requireAgentAdmin],
}, async (_request: FastifyRequest, reply: FastifyReply) => {
  try {
    let config = await fastify.prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!config) {
      config = await fastify.prisma.agentGlobalConfig.create({ data: {} });
    }
    return reply.send({ success: true, data: config });
  } catch (error) {
    logError(fastify.log, 'Error fetching global agent config:', error);
    return reply.status(500).send({ success: false, message: 'Erreur serveur' });
  }
});

// PUT /global-config
fastify.put('/global-config', {
  onRequest: [fastify.authenticate, requireAgentAdmin],
}, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const parsed = globalConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, message: 'Données invalides', errors: parsed.error.flatten() });
    }

    let existing = await fastify.prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
    let config;
    if (existing) {
      config = await fastify.prisma.agentGlobalConfig.update({
        where: { id: existing.id },
        data: parsed.data,
      });
    } else {
      config = await fastify.prisma.agentGlobalConfig.create({ data: parsed.data });
    }

    const redis = getRedisWrapper().getClient();
    await redis.publish('agent:config-invalidated', JSON.stringify({ global: true }));

    return reply.send({ success: true, data: config });
  } catch (error) {
    logError(fastify.log, 'Error upserting global agent config:', error);
    return reply.status(500).send({ success: false, message: 'Erreur serveur' });
  }
});
```

**Step 4: Run gateway build check**

Run: `cd services/gateway && pnpm tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add services/gateway/src/routes/admin/agent.ts
git commit -m "feat(gateway): scheduling fields + PubSub invalidation + global config admin routes"
```

---

## Task 7: Web Admin Service + Types

**Files:**
- Modify: `apps/web/services/agent-admin.service.ts`

**Step 1: Add scheduling fields to AgentConfigData and AgentConfigUpsert**

In `apps/web/services/agent-admin.service.ts`, add to `AgentConfigData` interface:

```typescript
  weekdayMaxMessages: number;
  weekendMaxMessages: number;
  weekdayMaxUsers: number;
  weekendMaxUsers: number;
  burstEnabled: boolean;
  burstSize: number;
  burstIntervalMinutes: number;
  quietIntervalMinutes: number;
  inactivityDaysThreshold: number;
  prioritizeTaggedUsers: boolean;
  prioritizeRepliedUsers: boolean;
  reactionBoostFactor: number;
```

Add same fields (all optional) to `AgentConfigUpsert`.

**Step 2: Add AgentGlobalConfigData type and API methods**

```typescript
export interface AgentGlobalConfigData {
  id: string;
  systemPrompt: string;
  enabled: boolean;
  defaultProvider: string;
  defaultModel: string;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  globalDailyBudgetUsd: number;
  maxConcurrentCalls: number;
  updatedAt: string;
}

export interface AgentGlobalConfigUpsert {
  systemPrompt?: string;
  enabled?: boolean;
  defaultProvider?: string;
  defaultModel?: string;
  fallbackProvider?: string | null;
  fallbackModel?: string | null;
  globalDailyBudgetUsd?: number;
  maxConcurrentCalls?: number;
}
```

Add methods to `agentAdminService`:

```typescript
async getGlobalConfig(): Promise<ApiResponse<AgentGlobalConfigData>> {
  return apiService.get('/admin/agent/global-config');
},

async updateGlobalConfig(data: AgentGlobalConfigUpsert): Promise<ApiResponse<AgentGlobalConfigData>> {
  return apiService.put('/admin/agent/global-config', data);
},
```

**Step 3: Commit**

```bash
git add apps/web/services/agent-admin.service.ts
git commit -m "feat(web): agent admin service types + global config API"
```

---

## Task 8: Admin Panel UI — Scheduling Section

**Files:**
- Modify: `apps/web/components/admin/agent/AgentConfigDialog.tsx`

**Step 1: Add scheduling fields to form state defaults**

In `AgentConfigDialog.tsx`, add to the `useState<AgentConfigUpsert>` default:

```typescript
    weekdayMaxMessages: 10,
    weekendMaxMessages: 25,
    weekdayMaxUsers: 4,
    weekendMaxUsers: 6,
    burstEnabled: true,
    burstSize: 4,
    burstIntervalMinutes: 5,
    quietIntervalMinutes: 90,
    inactivityDaysThreshold: 3,
    prioritizeTaggedUsers: true,
    prioritizeRepliedUsers: true,
    reactionBoostFactor: 1.5,
```

And map them from `config` in the `useEffect`.

**Step 2: Add "Scheduling & Rythme" section to the dialog**

After the existing "Generation" section, add a new section with:

- **Messages par jour** heading with two sliders: weekday (1-50) and weekend (1-100)
- **Utilisateurs actifs par jour** heading with two sliders: weekday (1-10) and weekend (1-15)
- **Mode Burst** heading with Switch toggle + sliders for burstSize (1-10), burstIntervalMinutes (1-30), quietIntervalMinutes (10-480)
- **Inactivite** heading with slider (1-30 days)
- **Reactivite** heading with Switch toggles for prioritizeTaggedUsers and prioritizeRepliedUsers, and a slider for reactionBoostFactor (0.5-5.0)

Pattern to follow: same JSX structure as the existing "Generation" section — `<div className="space-y-3">` with `<Label>`, `<Input type="range">`, `<span>` for value display.

**Step 3: Run web build check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/components/admin/agent/AgentConfigDialog.tsx
git commit -m "feat(admin-ui): scheduling & rhythm section in agent config dialog"
```

---

## Task 9: Admin Panel UI — Global Config Tab

**Files:**
- Create: `apps/web/components/admin/agent/AgentGlobalConfigTab.tsx`
- Modify: `apps/web/components/admin/agent/AgentConfigDialog.tsx` (or parent page)

**Step 1: Create AgentGlobalConfigTab component**

Create `apps/web/components/admin/agent/AgentGlobalConfigTab.tsx`:

```typescript
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { agentAdminService, type AgentGlobalConfigData, type AgentGlobalConfigUpsert } from '@/services/agent-admin.service';
import { toast } from 'sonner';

export function AgentGlobalConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AgentGlobalConfigUpsert>({
    systemPrompt: '',
    enabled: true,
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    fallbackProvider: null,
    fallbackModel: null,
    globalDailyBudgetUsd: 10,
    maxConcurrentCalls: 5,
  });

  useEffect(() => {
    agentAdminService.getGlobalConfig().then((res) => {
      if (res.success && res.data) {
        setForm({
          systemPrompt: res.data.systemPrompt,
          enabled: res.data.enabled,
          defaultProvider: res.data.defaultProvider,
          defaultModel: res.data.defaultModel,
          fallbackProvider: res.data.fallbackProvider,
          fallbackModel: res.data.fallbackModel,
          globalDailyBudgetUsd: res.data.globalDailyBudgetUsd,
          maxConcurrentCalls: res.data.maxConcurrentCalls,
        });
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await agentAdminService.updateGlobalConfig(form);
      if (res.success) {
        toast.success('Configuration globale mise à jour');
      } else {
        toast.error('Erreur lors de la mise à jour');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6 p-4">
      {/* Global Kill Switch */}
      {/* System Prompt Textarea */}
      {/* Provider/Model Selects */}
      {/* Budget + Concurrency Inputs */}
      {/* Save Button */}
    </div>
  );
}
```

Fill in the JSX following the same patterns used in `AgentConfigDialog.tsx` — Switch for enabled, Textarea for systemPrompt, Input for model/provider, number inputs for budget/concurrency.

**Step 2: Wire into admin page**

Add a new tab (or section) in the parent admin page that renders `<AgentGlobalConfigTab />`. Follow the existing tab pattern from `AgentConfigDialog.tsx`.

**Step 3: Run web build**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/components/admin/agent/AgentGlobalConfigTab.tsx apps/web/components/admin/agent/AgentConfigDialog.tsx
git commit -m "feat(admin-ui): global agent config tab with system prompt, provider, and budget settings"
```

---

## Task 10: Integration Test — Full Pipeline

**Files:**
- Create: `services/agent/src/__tests__/integration/budget-pipeline.test.ts`

**Step 1: Write integration test**

```typescript
import { DailyBudgetManager } from '../../scheduler/daily-budget';
import { ConfigCache } from '../../config/config-cache';

function makeRedis(store: Map<string, string> = new Map()) {
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, val: string) => { store.set(key, val); return 'OK'; }),
    del: jest.fn(async (key: string) => { store.delete(key); return 1; }),
    incr: jest.fn(async (key: string) => {
      const v = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(v));
      return v;
    }),
    expire: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    scard: jest.fn().mockResolvedValue(0),
    subscribe: jest.fn(),
    on: jest.fn(),
    duplicate: jest.fn().mockReturnThis(),
  } as any;
}

describe('Budget + Cache Integration', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-03-07T14:00:00Z') }));
  afterEach(() => jest.useRealTimers());

  it('config cache serves cached config then budget blocks after max', async () => {
    const config = { conversationId: 'conv-1', enabled: true, weekdayMaxMessages: 10, weekendMaxMessages: 25 };
    const store = new Map<string, string>();
    const redis = makeRedis(store);
    const persistence = { getAgentConfig: jest.fn().mockResolvedValue(config) } as any;

    const cache = new ConfigCache(redis, persistence);
    const budget = new DailyBudgetManager(redis);

    // First call: cache miss -> DB fetch
    const first = await cache.getConfig('conv-1');
    expect(first).toEqual(config);
    expect(persistence.getAgentConfig).toHaveBeenCalledTimes(1);

    // Second call: cache hit
    const second = await cache.getConfig('conv-1');
    expect(second).toEqual(config);
    expect(persistence.getAgentConfig).toHaveBeenCalledTimes(1); // not called again

    // Budget allows first message
    const check1 = await budget.canSendMessage('conv-1', { weekdayMaxMessages: 10, weekendMaxMessages: 25 });
    expect(check1.allowed).toBe(true);

    // Record 25 messages (weekend budget)
    for (let i = 0; i < 25; i++) {
      await budget.recordMessage('conv-1', `user-${i % 4}`);
    }

    // Budget blocks
    const check2 = await budget.canSendMessage('conv-1', { weekdayMaxMessages: 10, weekendMaxMessages: 25 });
    expect(check2.allowed).toBe(false);
  });
});
```

**Step 2: Run integration test**

Run: `cd services/agent && pnpm test -- --testPathPattern=budget-pipeline`
Expected: PASS

**Step 3: Run full test suite**

Run: `cd services/agent && pnpm test`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add services/agent/src/__tests__/integration/budget-pipeline.test.ts
git commit -m "test(agent): integration test for budget + cache pipeline"
```

---

## Task 11: Final — Run All Tests + Type Check + Build

**Step 1: Run agent service tests**

Run: `cd services/agent && pnpm test`
Expected: ALL PASS

**Step 2: Run Prisma generate**

Run: `cd packages/shared && pnpm prisma generate`
Expected: Generated Prisma Client

**Step 3: Type check gateway**

Run: `cd services/gateway && pnpm tsc --noEmit`
Expected: No errors

**Step 4: Type check web**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No errors

**Step 5: Build agent service**

Run: `cd services/agent && pnpm run build`
Expected: Build successful

**Step 6: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore: final cleanup and type fixes for agent scheduler redesign"
```
