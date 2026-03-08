# Agent Reactive Intelligence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rendre l'agent capable de repondre naturellement aux interpellations (mention/reply) avec un timing realiste, tout en optimisant les appels LLM a 3-5 max par cycle.

**Architecture:** Deux modes — reactif (declenchement par mention/reply avec timing naturel) et scan periodique (animation proactive avec selection par type de conversation). Les deux partagent le meme pipeline LLM optimise (triage, generation batch, quality gate optionnel).

**Tech Stack:** TypeScript, Prisma/MongoDB, Redis, ZeroMQ, Zod, LangGraph

---

## Task 1: Enrichir le schema ZMQ gateway-agent avec mentionedUserIds

**Files:**
- Modify: `services/agent/src/zmq/types.ts:3-13`
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts:3332-3358`
- Test: `services/agent/src/__tests__/zmq/zmq-types.test.ts`

**Step 1: Write failing test — schema accepts mentionedUserIds**

Add to zmq-types.test.ts:

```typescript
it('accepts mentionedUserIds in agent:new-message', () => {
  const event = {
    type: 'agent:new-message',
    conversationId: 'conv1',
    messageId: 'msg1',
    senderId: 'user1',
    content: 'Hey @alice',
    originalLanguage: 'fr',
    timestamp: Date.now(),
    mentionedUserIds: ['user-alice-id'],
  };
  const result = agentNewMessageSchema.safeParse(event);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.mentionedUserIds).toEqual(['user-alice-id']);
  }
});

it('defaults mentionedUserIds to empty array when absent', () => {
  const event = {
    type: 'agent:new-message',
    conversationId: 'conv1',
    messageId: 'msg1',
    senderId: 'user1',
    content: 'Hello',
    originalLanguage: 'fr',
    timestamp: Date.now(),
  };
  const result = agentNewMessageSchema.safeParse(event);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.mentionedUserIds).toEqual([]);
  }
});
```

**Step 2: Run test to verify it fails**

Run: `cd services/agent && pnpm test -- --testPathPattern=zmq-types`

**Step 3: Update ZMQ schema**

In `services/agent/src/zmq/types.ts:3-14`, add `mentionedUserIds`:

```typescript
export const agentNewMessageSchema = z.object({
  type: z.literal('agent:new-message'),
  conversationId: z.string(),
  messageId: z.string(),
  senderId: z.string(),
  senderDisplayName: z.string().optional(),
  senderUsername: z.string().optional(),
  content: z.string(),
  originalLanguage: z.string(),
  replyToId: z.string().optional(),
  mentionedUserIds: z.array(z.string()).default([]),
  timestamp: z.number(),
});
```

**Step 4: Update gateway _notifyAgent to send mentionedUserIds**

In `MeeshySocketIOManager.ts:3332-3358`, add `mentionedUserIds` to the method signature and the `sendEvent` call. Then find ALL call sites of `_notifyAgent` and pass `mentionedUserIds` from the validated mentions:

```typescript
mentionedUserIds: validatedMentions?.map((m: { userId: string }) => m.userId) ?? [],
```

**Step 5: Run tests, verify pass**

**Step 6: Commit** — `feat(agent): enrich agent:new-message with mentionedUserIds`

---

## Task 2: Creer le module InterpellationDetector

**Files:**
- Create: `services/agent/src/reactive/interpellation-detector.ts`
- Test: `services/agent/src/__tests__/reactive/interpellation-detector.test.ts`

**Step 1: Write failing tests**

```typescript
import { detectInterpellation } from '../../reactive/interpellation-detector';

const controlledUserIds = new Set(['bot-alice', 'bot-bob']);

describe('InterpellationDetector', () => {
  it('detects mention of controlled user', () => {
    const result = detectInterpellation({
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
      content: 'Hey @alice what do you think?',
      controlledUserIds,
    });
    expect(result).toEqual({
      detected: true, type: 'mention',
      targetUserIds: ['bot-alice'], isGreeting: false,
    });
  });

  it('detects reply to controlled user', () => {
    const result = detectInterpellation({
      mentionedUserIds: [],
      replyToUserId: 'bot-bob',
      content: 'I agree with that',
      controlledUserIds,
    });
    expect(result).toEqual({
      detected: true, type: 'reply',
      targetUserIds: ['bot-bob'], isGreeting: false,
    });
  });

  it('detects greeting interpellation', () => {
    const result = detectInterpellation({
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
      content: 'Salut @alice!',
      controlledUserIds,
    });
    expect(result.type).toBe('greeting');
    expect(result.isGreeting).toBe(true);
  });

  it('returns not detected when no controlled user involved', () => {
    const result = detectInterpellation({
      mentionedUserIds: ['real-user'],
      replyToUserId: undefined,
      content: 'Hey @someone',
      controlledUserIds,
    });
    expect(result.detected).toBe(false);
  });

  it('falls back to content parsing for @username mentions', () => {
    const result = detectInterpellation({
      mentionedUserIds: [],
      replyToUserId: undefined,
      content: 'Hey @alice tu penses quoi?',
      controlledUserIds,
      controlledUsernames: new Map([['alice', 'bot-alice']]),
    });
    expect(result.detected).toBe(true);
    expect(result.targetUserIds).toEqual(['bot-alice']);
  });

  it('deduplicates mention + reply to same user', () => {
    const result = detectInterpellation({
      mentionedUserIds: ['bot-alice'],
      replyToUserId: 'bot-alice',
      content: '@alice yes!',
      controlledUserIds,
    });
    expect(result.targetUserIds).toEqual(['bot-alice']);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement InterpellationDetector**

Create `services/agent/src/reactive/interpellation-detector.ts`:

```typescript
export type InterpellationType = 'mention' | 'reply' | 'greeting' | 'none';

export type InterpellationResult = {
  detected: boolean;
  type: InterpellationType;
  targetUserIds: string[];
  isGreeting: boolean;
};

const GREETING_PATTERNS = [
  /^(bonjour|bonsoir|salut|hello|hey|hi|coucou|yo|wesh)\b/i,
  /^(bon(ne)?\s+(journee|soiree|matinee|nuit|aprem))\b/i,
  /^(good\s+(morning|afternoon|evening|night))\b/i,
];

function isGreetingContent(content: string): boolean {
  const trimmed = content.replace(/@\w+/g, '').trim();
  return GREETING_PATTERNS.some((p) => p.test(trimmed));
}

export function detectInterpellation(input: {
  mentionedUserIds: string[];
  replyToUserId: string | undefined;
  content: string;
  controlledUserIds: Set<string>;
  controlledUsernames?: Map<string, string>;
}): InterpellationResult {
  const targets = new Set<string>();

  for (const uid of input.mentionedUserIds) {
    if (input.controlledUserIds.has(uid)) targets.add(uid);
  }

  if (input.replyToUserId && input.controlledUserIds.has(input.replyToUserId)) {
    targets.add(input.replyToUserId);
  }

  if (targets.size === 0 && input.controlledUsernames) {
    const mentionRegex = /@(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(input.content)) !== null) {
      const userId = input.controlledUsernames.get(match[1].toLowerCase());
      if (userId) targets.add(userId);
    }
  }

  if (targets.size === 0) {
    return { detected: false, type: 'none', targetUserIds: [], isGreeting: false };
  }

  const targetUserIds = [...targets];
  const greeting = isGreetingContent(input.content);

  if (greeting) return { detected: true, type: 'greeting', targetUserIds, isGreeting: true };

  const type: InterpellationType = input.mentionedUserIds.some((uid) => input.controlledUserIds.has(uid))
    ? 'mention' : 'reply';

  return { detected: true, type, targetUserIds, isGreeting: false };
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit** — `feat(agent): add InterpellationDetector for mention/reply/greeting`

---

## Task 3: Creer le module TimingCalculator

**Files:**
- Create: `services/agent/src/reactive/timing-calculator.ts`
- Test: `services/agent/src/__tests__/reactive/timing-calculator.test.ts`

**Step 1: Write failing tests**

```typescript
import { calculateResponseDelay } from '../../reactive/timing-calculator';

describe('TimingCalculator', () => {
  it('returns fast delay for greeting', () => {
    const delay = calculateResponseDelay({
      interpellationType: 'greeting', wordCount: 2,
      lastUserMessageAgoMs: 5 * 60 * 1000, unreadMessageCount: 1,
    });
    expect(delay).toBeGreaterThanOrEqual(3_000);
    expect(delay).toBeLessThanOrEqual(40_000);
  });

  it('returns shorter delay if user spoke recently', () => {
    const recent = calculateResponseDelay({
      interpellationType: 'mention', wordCount: 10,
      lastUserMessageAgoMs: 30 * 1000, unreadMessageCount: 1,
    });
    const old = calculateResponseDelay({
      interpellationType: 'mention', wordCount: 10,
      lastUserMessageAgoMs: 5 * 60 * 60 * 1000, unreadMessageCount: 1,
    });
    expect(recent).toBeLessThan(old);
  });

  it('typing time scales with word count', () => {
    const short = calculateResponseDelay({
      interpellationType: 'reply', wordCount: 3,
      lastUserMessageAgoMs: 60_000, unreadMessageCount: 0,
    });
    const long = calculateResponseDelay({
      interpellationType: 'reply', wordCount: 50,
      lastUserMessageAgoMs: 60_000, unreadMessageCount: 0,
    });
    expect(long).toBeGreaterThan(short);
  });

  it('caps typing time at 180s', () => {
    const delay = calculateResponseDelay({
      interpellationType: 'reply', wordCount: 200,
      lastUserMessageAgoMs: 0, unreadMessageCount: 0,
    });
    expect(delay).toBeLessThanOrEqual(220_000);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement TimingCalculator**

Create `services/agent/src/reactive/timing-calculator.ts`:

```typescript
import type { InterpellationType } from './interpellation-detector';

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function jitter(value: number, percent: number = 0.2): number {
  return value + value * randomBetween(-percent, percent);
}

function apparitionDelayMs(lastUserMessageAgoMs: number): number {
  if (lastUserMessageAgoMs < 2 * 60_000) return randomBetween(0, 5_000);
  if (lastUserMessageAgoMs < 30 * 60_000) return randomBetween(10_000, 30_000);
  if (lastUserMessageAgoMs < 2 * 3_600_000) return randomBetween(30_000, 90_000);
  return randomBetween(60_000, 180_000);
}

function readingDelayMs(unreadCount: number): number {
  return Math.min(unreadCount * 2_000, 20_000);
}

function typingDelayMs(wordCount: number): number {
  const perWord = randomBetween(3_000, 4_000);
  return Math.max(3_000, Math.min(wordCount * perWord, 180_000));
}

export function calculateResponseDelay(input: {
  interpellationType: InterpellationType;
  wordCount: number;
  lastUserMessageAgoMs: number;
  unreadMessageCount: number;
}): number {
  const { interpellationType, wordCount, lastUserMessageAgoMs, unreadMessageCount } = input;

  if (interpellationType === 'greeting') {
    return Math.round(jitter(Math.max(3_000, Math.min(typingDelayMs(wordCount), 30_000))));
  }

  const apparition = apparitionDelayMs(lastUserMessageAgoMs);
  const reading = readingDelayMs(unreadMessageCount);
  const typing = typingDelayMs(wordCount);

  return Math.round(jitter(apparition + reading + typing));
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit** — `feat(agent): add TimingCalculator with natural delays`

---

## Task 4: Creer le ReactiveHandler (orchestrateur mode reactif)

**Files:**
- Create: `services/agent/src/reactive/reactive-handler.ts`
- Test: `services/agent/src/__tests__/reactive/reactive-handler.test.ts`

**Step 1: Write failing tests**

Test le flow: detection, triage LLM, generation LLM, timing, enqueue. Mocker LLM/persistence/queue.

```typescript
import { ReactiveHandler } from '../../reactive/reactive-handler';

function makeLlm(triageJson: string, genJson: string) {
  let callCount = 0;
  return {
    name: 'test',
    chat: jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ content: triageJson });
      return Promise.resolve({ content: genJson });
    }),
  };
}

// ... (persistence, stateManager, deliveryQueue mocks as described in design)

describe('ReactiveHandler', () => {
  it('handles mention with triage+generation (2 LLM calls)', async () => {
    const triage = JSON.stringify({
      shouldRespond: true,
      responses: [{ asUserId: 'bot-alice', urgency: 'medium', isGreeting: false,
        needsElaboration: false, suggestedTopic: 'tech' }],
    });
    const gen = JSON.stringify({
      messages: [{ asUserId: 'bot-alice', content: 'React est top',
        replyToId: 'msg-1', wordCount: 3, isGreeting: false }],
    });
    const llm = makeLlm(triage, gen);
    const queue = makeDeliveryQueue();
    const handler = new ReactiveHandler(llm, makePersistence(), makeStateManager(), queue);

    await handler.handleInterpellation({
      conversationId: 'conv1',
      triggerMessage: { id: 'msg-1', senderId: 'user1', senderName: 'Jean',
        content: '@alice avis sur React?', timestamp: Date.now(), originalLanguage: 'fr' },
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
    });

    expect(llm.chat).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('skips when triage says shouldRespond=false', async () => {
    const triage = JSON.stringify({ shouldRespond: false, reason: 'not relevant' });
    const llm = makeLlm(triage, '{}');
    const queue = makeDeliveryQueue();
    const handler = new ReactiveHandler(llm, makePersistence(), makeStateManager(), queue);

    await handler.handleInterpellation({
      conversationId: 'conv1',
      triggerMessage: { id: 'msg1', senderId: 'u1', senderName: 'Jean',
        content: '@alice lol', timestamp: Date.now(), originalLanguage: 'fr' },
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
    });

    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement ReactiveHandler**

Create `services/agent/src/reactive/reactive-handler.ts` with:
- `handleInterpellation()` method
- LLM Call 1: Triage prompt (decide if/how to respond, 128-256 tokens)
- LLM Call 2: Generation batch (create content for each user, 512-1024 tokens)
- TimingCalculator for natural delays
- Queue management: check `getScheduledForUser`, `rescheduleForUser` if conflict
- Update agentHistory in Redis after enqueue

Key: only 2 LLM calls (triage + generation). Quality gate is the optional 3rd call, handled separately.

**Step 4: Run tests, verify pass**

**Step 5: Commit** — `feat(agent): add ReactiveHandler with 2 LLM calls`

---

## Task 5: Rendre la DeliveryQueue intelligente (reordonnancement)

**Files:**
- Modify: `services/agent/src/delivery/delivery-queue.ts`
- Modify: `services/agent/src/__tests__/delivery/delivery-queue.test.ts`

**Step 1: Write failing tests**

```typescript
it('getScheduledForUser returns pending items for a user', () => {
  const queue = new DeliveryQueue(makePublisher(), makePersistence());
  queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 60 })]);
  expect(queue.getScheduledForUser('conv-1', 'bot-alice')).toHaveLength(1);
});

it('rescheduleForUser delays existing items', () => {
  const queue = new DeliveryQueue(makePublisher(), makePersistence());
  queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 30 })]);
  expect(queue.rescheduleForUser('conv-1', 'bot-alice', 60)).toBe(1);
});
```

**Step 2: Run test to verify it fails**

**Step 3: Add methods to DeliveryQueue**

```typescript
getScheduledForUser(conversationId: string, userId: string): DeliveryItem[] {
  return this.queue.filter(
    (item) => item.conversationId === conversationId && item.action.asUserId === userId,
  );
}

rescheduleForUser(conversationId: string, userId: string, additionalDelaySeconds: number): number {
  const items = this.getScheduledForUser(conversationId, userId);
  for (const item of items) {
    clearTimeout(item.timer);
    const newDelay = Math.max(0, item.scheduledAt - Date.now() + additionalDelaySeconds * 1000);
    item.scheduledAt = Date.now() + newDelay;
    item.timer = setTimeout(async () => {
      await this.deliver(item.conversationId, item.action);
    }, newDelay);
  }
  return items.length;
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit** — `feat(agent): add queue introspection and rescheduling`

---

## Task 6: Selection de conversations par type (configurable)

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (AgentConfig)
- Modify: `services/agent/src/memory/mongo-persistence.ts:132-156`
- Modify: `services/agent/src/scheduler/eligible-conversations.ts`

**Step 1: Add fields to AgentConfig schema**

```prisma
eligibleConversationTypes String[] @default(["group", "channel", "public", "global"])
maxConversationsPerCycle  Int      @default(0)  /// 0 = unlimited
messageFreshnessHours     Int      @default(22)
```

**Step 2: Run prisma generate**

**Step 3: Rewrite getEligibleConversations**

Query `Conversation` by type first (not AgentConfig). Conversations without AgentConfig are considered enabled. Only `AgentConfig.enabled = false` excludes. Apply `defaultAgentConfig()` for conversations without explicit config.

**Step 4: Build + test**

**Step 5: Commit** — `feat(agent): type-based conversation selection with configurable defaults`

---

## Task 7: Brancher le ReactiveHandler dans server.ts

**Files:**
- Modify: `services/agent/src/server.ts:68-100`

**Step 1: Update ZMQ event handler**

Replace the current "scan on every message" logic:
- Always update sliding window
- Detect if a controlled user is interpellated (mention or reply)
- If yes: route to `ReactiveHandler.handleInterpellation()`
- If no: just store the message, let the periodic scanner handle it

**Step 2: Resolve replyToUserId from message window**

When `replyToId` exists, look up the original message sender in the sliding window. If that sender is a controlled user, set `replyToUserId`.

**Step 3: Build + verify**

**Step 4: Commit** — `feat(agent): route interpellations to ReactiveHandler`

---

## Task 8: Optimiser le scan periodique

**Files:**
- Modify: `services/agent/src/scheduler/conversation-scanner.ts`

**Step 1: Load global scan config**

Before scanning, load `eligibleConversationTypes`, `maxConversationsPerCycle`, `messageFreshnessHours` from global config and pass to `getEligibleConversations()`.

**Step 2: Verify weighted candidate selection**

Already implemented (shuffle + todayActiveUserIds annotations). Ensure the strategist prompt uses this data.

**Step 3: Build + test**

**Step 4: Commit** — `refactor(agent): optimize periodic scan with configurable selection`

---

## Task 9: Tests d'integration

**Files:**
- Create: `services/agent/src/__tests__/reactive/integration.test.ts`

**Step 1: Test mention triggers reactive response**

Full flow from event to DeliveryQueue with mocked LLM.

**Step 2: Test timing calculation within expected ranges**

**Step 3: Test queue reordering when user has pending message**

**Step 4: Run all tests** — `cd services/agent && pnpm test`

**Step 5: Commit** — `test(agent): add reactive handler integration tests`

---

## Task 10: Routes admin pour les nouveaux champs

**Files:**
- Modify: `services/agent/src/routes/config.ts`

**Step 1: Add new fields to update schema**

`eligibleConversationTypes`, `maxConversationsPerCycle`, `messageFreshnessHours`

**Step 2: Build + test**

**Step 3: Commit** — `feat(agent): expose new scan config fields in admin routes`

---

## Execution Order

```
Tasks 1, 2, 3, 5, 6 — parallelisables (aucune dependance)
Task 4 — depend de 2, 3, 5
Task 7 — depend de 1, 4
Task 8 — depend de 6
Task 9 — depend de 7, 8
Task 10 — depend de 6
```
