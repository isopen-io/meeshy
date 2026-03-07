# Agent Scheduler Redesign - Design Document

**Date**: 2026-03-07
**Status**: Approved
**Approach**: Scheduler Intelligent (A) with admin-configurable defaults

## Problem

Agents post every 2-5 minutes without varying topics or participants. Conversations feel mechanical. No daily budget, no user rotation, no weekend/weekday differentiation.

## Goals

1. Coherent personality per user (global + per-conversation profiles)
2. Varied participants in public groups (2-10 different users per day)
3. Contextual reactivity (reply to @mentions and direct replies, boost users with reactions)
4. Daily message budget (configurable weekday vs weekend)
5. Burst scheduling (clusters of rapid messages with long pauses)
6. All parameters admin-configurable with sensible defaults
7. Redis cache with PubSub invalidation for config (no DB hit per scanner cycle)

## Decisions

- **Hybrid user pickup**: Auto-detection of inactive users (3d+) with admin whitelist/blacklist
- **Profile-observed personality**: Observer analyzes user history, archetype as fallback
- **Redis + PubSub config cache**: TTL 5min, immediate invalidation on admin update
- **Burst mode**: Weekend 20-30 msgs/day with 4-6 users, weekday 10 msgs/day with 3-4 users

---

## Section 1: Data Model Changes

### AgentConfig (enriched with scheduling fields)

New fields added to existing `AgentConfig` model:

```prisma
// Daily scheduling
weekdayMaxMessages       Int      @default(10)
weekendMaxMessages       Int      @default(25)
weekdayMaxUsers          Int      @default(4)
weekendMaxUsers          Int      @default(6)

// Burst mode
burstEnabled             Boolean  @default(true)
burstSize                Int      @default(4)
burstIntervalMinutes     Int      @default(5)
quietIntervalMinutes     Int      @default(90)

// Inactivity threshold (replaces inactivityThresholdHours semantically)
inactivityDaysThreshold  Int      @default(3)

// Reactivity rules
prioritizeTaggedUsers    Boolean  @default(true)
prioritizeRepliedUsers   Boolean  @default(true)
reactionBoostFactor      Float    @default(1.5)
```

### AgentGlobalConfig (new model - singleton)

```prisma
model AgentGlobalConfig {
  id                    String   @id @default(auto()) @map("_id") @db.ObjectId
  systemPrompt          String   @default("Tu es un systeme d'animation de conversations. Ton role est de maintenir des echanges naturels et engageants.")
  enabled               Boolean  @default(true)
  defaultProvider       String   @default("openai")
  defaultModel          String   @default("gpt-4o-mini")
  fallbackProvider      String?
  fallbackModel         String?
  globalDailyBudgetUsd  Float    @default(10.0)
  maxConcurrentCalls    Int      @default(5)
  updatedAt             DateTime @updatedAt
}
```

---

## Section 2: DailyBudgetManager + Config Cache

### DailyBudgetManager

**File**: `services/agent/src/scheduler/daily-budget.ts`

**Redis keys**:
- `agent:budget:{convId}:{YYYY-MM-DD}` - message counter (TTL 48h)
- `agent:budget:{convId}:{YYYY-MM-DD}:users` - Set of active userIds today
- `agent:budget:{convId}:last-burst` - timestamp of last burst

**Logic**:
1. Before each scanner cycle: check `counter < maxMessages` (weekday/weekend)
2. Check active users today < maxUsers (weekday/weekend)
3. Burst mode: check `now - lastBurst > quietIntervalMinutes`
4. Strategist receives remaining budget to calibrate intervention count
5. After each message sent: increment counter, add userId to set

### Config Cache

**File**: `services/agent/src/config/config-cache.ts`

**Mechanism**:
- Read: `agent:config:{convId}` in Redis (TTL 5min). On miss -> fetch MongoDB -> write Redis
- Invalidation: Gateway publishes `agent:config-invalidated:{convId}` on Redis PubSub
- Agent service subscribes to `agent:config-invalidated:*` and deletes matching key
- Global config: `agent:global-config` (TTL 10min + PubSub)
- Scanner ALWAYS reads from cache, never directly from MongoDB

**Flow**:
```
Admin modifies config -> Gateway PUT /admin/agent/configs/{id}
  -> Save MongoDB
  -> Redis PUBLISH "agent:config-invalidated:{convId}"
  -> Agent service receives -> DEL "agent:config:{convId}"
  -> Next scanner cycle -> cache miss -> reload from MongoDB
```

---

## Section 3: User Rotation & Intelligent Selection

### Inactive user selection (enhanced auto-pickup)

1. Find conversation members not connected for `inactivityDaysThreshold` days
2. Exclude users in `excludedUserIds` and `excludedRoles`
3. Apply admin whitelist (`manualUserIds`) - always included
4. Limit to `weekday/weekendMaxUsers` based on day

### Weighted round-robin rotation

In strategist:
1. Load users who already spoke today from Redis
2. Weighting:
   - User who hasn't spoken today -> weight 3x
   - User with reactions on recent messages -> weight x `reactionBoostFactor`
   - User tagged or with reply -> absolute priority (must respond)
3. Strategist integrates weights into prompt for varied participants

### Reactive priority

If recent message contains @mention of controlled user OR replyTo targeting controlled user's message:
- That user MUST intervene (bypass round-robin)
- Daily budget still respected
- Only the reactive message is prioritized

---

## Section 4: Burst Scheduling

### Burst logic

Instead of 1 message every X minutes, scheduler groups into conversational bursts:

```
Typical weekend day (25 msgs, ~6 bursts):
  Burst 1 (10h-10h20): 4 msgs (3-5min apart), 3 different users
  [90min pause]
  Burst 2 (12h-12h20): 4 msgs, Q&A style exchange
  [90min pause]
  Burst 3 (14h-14h15): 3 msgs + 2 reactions
  [long pause]
  Burst 4 (17h-17h20): 4 msgs, different topics
  ...
```

### Scanner implementation

1. Scanner checks: `now - lastBurstTimestamp > quietIntervalMinutes`
2. If yes -> trigger burst: strategist generates `burstSize` interventions with short delays (30-300s)
3. If no -> skip this cycle
4. Delivery queue spaces messages using strategist delays

### Weekday mode

Same logic but reduced budgets (10 msgs, 3-4 users) and longer `quietIntervalMinutes`.

---

## Section 5: Admin Panel Updates

### New section in ConfigDialog: "Scheduling & Rhythm"

- **Messages per day**: Sliders weekday (1-50, default 10) / weekend (1-100, default 25)
- **Active users per day**: Sliders weekday (1-10, default 4) / weekend (1-15, default 6)
- **Burst mode**: Toggle + config (burst size, burst interval, quiet interval)
- **Inactivity threshold**: Slider in days (1-30, default 3)
- **Reactivity**: Toggles for tag/reply priority, reaction boost factor slider

### Global Config section (new admin tab or page)

- Global system prompt: Large textarea
- Default provider/model: Selects
- Global daily budget: USD input
- Global kill switch: Toggle
- Route: `GET/PUT /admin/agent/global-config`

### Gateway routes

- Enrich `PUT /admin/agent/configs/{convId}` with new scheduling fields
- On every PUT: publish `agent:config-invalidated` on Redis PubSub
- New `GET/PUT /admin/agent/global-config` for global settings

---

## Section 6: Personality Coherence

### Global Profile -> Conversation Profile

1. Observer analyzes user history in conversation -> `AgentUserRole` (conversation profile)
2. Observer merges cross-conversation patterns -> `AgentGlobalProfile` (global profile)
3. For generation: conversation profile takes priority, global profile fills gaps
4. Confidence increases with `messagesAnalyzed` -> at 0.8+ profile is `locked` (stable)

### Cross-conversation coherence

Generator receives both profiles:
- Conversation profile: tone, topics specific to this conversation
- Global profile: vocabulary, catchphrases, emoji patterns

Catchphrases and patterns from global profile are injected into Generator prompt so the user "sounds" the same everywhere.

---

## Files to Create/Modify

### New files
- `services/agent/src/scheduler/daily-budget.ts`
- `services/agent/src/config/config-cache.ts`
- `services/agent/src/__tests__/scheduler/daily-budget.test.ts`
- `services/agent/src/__tests__/config/config-cache.test.ts`

### Modified files
- `packages/shared/prisma/schema.prisma` - AgentConfig fields + AgentGlobalConfig model
- `services/agent/src/scheduler/conversation-scanner.ts` - integrate budget + cache
- `services/agent/src/scheduler/eligible-conversations.ts` - enhanced user selection
- `services/agent/src/agents/strategist.ts` - budget-aware + user rotation weights
- `services/agent/src/graph/state.ts` - new state fields
- `services/gateway/src/routes/admin/agent.ts` - new fields + PubSub publish + global config route
- `apps/web/components/admin/agent/AgentConfigDialog.tsx` - scheduling section
- `apps/web/services/agent-admin.service.ts` - global config API
