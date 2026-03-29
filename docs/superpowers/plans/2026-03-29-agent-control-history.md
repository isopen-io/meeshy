# Agent Control & History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full observability and control of the agent scan pipeline — log every scan with per-node costs/decisions, provide 6-month historical charts, and let admins adjust all scan parameters with granular controls.

**Architecture:** New `AgentScanLog` Prisma model stores one row per scan with full context (preconditions, config snapshot, per-node results, costs, decisions). A `ScanTracer` collector accumulates metrics during graph execution and persists after completion. Three new API endpoints serve logs/stats. A new "Control & History" tab in the admin UI combines a Recharts time-series chart with inline config controls.

**Tech Stack:** Prisma/MongoDB (schema), Fastify (API), ioredis (cache keys), LangGraph (graph nodes), Recharts (charts), Next.js/Tailwind/Lucide (UI), Jest (tests)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `services/agent/src/tracing/scan-tracer.ts` | ScanTracer class — accumulates per-node metrics |
| Create | `services/agent/src/tracing/cost-estimator.ts` | USD cost estimation from token counts + model |
| Modify | `packages/shared/prisma/schema.prisma` | Add `AgentScanLog` model |
| Modify | `services/agent/src/graph/graph.ts` | Wrap nodes to capture LLM response metrics |
| Modify | `services/agent/src/scheduler/conversation-scanner.ts` | Create tracer, persist after scan |
| Modify | `services/agent/src/memory/mongo-persistence.ts` | Add `createScanLog` method |
| Modify | `services/gateway/src/routes/admin/agent.ts` | Add 3 scan-log endpoints |
| Modify | `apps/web/services/agent-admin.service.ts` | Add types + service methods |
| Create | `apps/web/components/admin/agent/AgentHistoryTab.tsx` | Main tab component (chart + controls + table) |
| Create | `apps/web/components/admin/agent/ScanHistoryChart.tsx` | Recharts 6-month time-series |
| Create | `apps/web/components/admin/agent/ScanControlPanel.tsx` | Granular config controls |
| Create | `apps/web/components/admin/agent/ScanLogTable.tsx` | Filterable scan log table with drill-down |
| Create | `apps/web/components/admin/agent/ScanLogDetail.tsx` | Single scan detail modal |
| Modify | `apps/web/app/admin/agent/page.tsx` | Add "History" tab |
| Create | `services/agent/src/__tests__/tracing/scan-tracer.test.ts` | Unit tests for tracer |
| Create | `services/agent/src/__tests__/tracing/cost-estimator.test.ts` | Unit tests for cost estimator |

---

## Phase 1: Data Layer — ScanTracer + Prisma Model

### Task 1: AgentScanLog Prisma Model

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (after AgentGlobalConfig model, ~line 3133)

- [ ] **Step 1: Add AgentScanLog model to schema**

Add after the `AgentGlobalConfig` model closing brace:

```prisma
model AgentScanLog {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  conversationId    String   @db.ObjectId

  trigger           String   @default("auto")
  triggeredBy       String?  @db.ObjectId

  startedAt         DateTime @default(now())
  completedAt       DateTime?
  durationMs        Int      @default(0)

  activityScore     Float    @default(0)
  messagesInWindow  Int      @default(0)
  budgetBefore      Json?
  controlledUserIds String[] @db.ObjectId
  configSnapshot    Json?

  nodeResults       Json?

  outcome           String   @default("skipped")
  messagesSent      Int      @default(0)
  reactionsSent     Int      @default(0)
  messagesRejected  Int      @default(0)
  userIdsUsed       String[] @db.ObjectId

  totalInputTokens  Int      @default(0)
  totalOutputTokens Int      @default(0)
  totalLatencyMs    Int      @default(0)
  estimatedCostUsd  Float    @default(0)

  configChangedAt   DateTime?

  conversation      Conversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId])
  @@index([startedAt])
  @@index([trigger])
  @@index([outcome])
}
```

- [ ] **Step 2: Add relation to Conversation model**

Find the `Conversation` model and add `agentScanLogs AgentScanLog[]` to its relations list (alongside existing `agentConfig`, `agentAnalytic`, etc.).

- [ ] **Step 3: Generate Prisma client**

Run: `cd packages/shared && npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 4: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(schema): add AgentScanLog model for scan observability"
```

---

### Task 2: Cost Estimator

**Files:**
- Create: `services/agent/src/tracing/cost-estimator.ts`
- Create: `services/agent/src/__tests__/tracing/cost-estimator.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// services/agent/src/__tests__/tracing/cost-estimator.test.ts
import { estimateCostUsd } from '../../tracing/cost-estimator';

describe('estimateCostUsd', () => {
  it('calculates cost for gpt-4o-mini', () => {
    const cost = estimateCostUsd('gpt-4o-mini', 1000, 500);
    expect(cost).toBeCloseTo(0.000375, 5);
  });

  it('calculates cost for claude-sonnet-4-20250514', () => {
    const cost = estimateCostUsd('claude-sonnet-4-20250514', 1000, 500);
    expect(cost).toBeCloseTo(0.0115, 4);
  });

  it('uses fallback rate for unknown models', () => {
    const cost = estimateCostUsd('unknown-model-v9', 1000, 500);
    expect(cost).toBeGreaterThan(0);
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateCostUsd('gpt-4o-mini', 0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/agent && npx jest src/__tests__/tracing/cost-estimator.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// services/agent/src/tracing/cost-estimator.ts

// Rates per 1M tokens (USD) — updated March 2026
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-20250514': { input: 0.80, output: 4.00 },
};

const FALLBACK_RATE = { input: 3.00, output: 15.00 };

function findRate(model: string): { input: number; output: number } {
  const exact = MODEL_RATES[model];
  if (exact) return exact;
  for (const [key, rate] of Object.entries(MODEL_RATES)) {
    if (model.startsWith(key)) return rate;
  }
  return FALLBACK_RATE;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  if (inputTokens === 0 && outputTokens === 0) return 0;
  const rate = findRate(model);
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/agent && npx jest src/__tests__/tracing/cost-estimator.test.ts --no-coverage`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add services/agent/src/tracing/cost-estimator.ts services/agent/src/__tests__/tracing/cost-estimator.test.ts
git commit -m "feat(agent): add LLM cost estimator with per-model rates"
```

---

### Task 3: ScanTracer

**Files:**
- Create: `services/agent/src/tracing/scan-tracer.ts`
- Create: `services/agent/src/__tests__/tracing/scan-tracer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// services/agent/src/__tests__/tracing/scan-tracer.test.ts
import { ScanTracer } from '../../tracing/scan-tracer';

describe('ScanTracer', () => {
  it('initializes with conversation metadata', () => {
    const tracer = new ScanTracer('conv-123', 'auto');
    const log = tracer.finalize();
    expect(log.conversationId).toBe('conv-123');
    expect(log.trigger).toBe('auto');
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records node results and accumulates tokens', () => {
    const tracer = new ScanTracer('conv-123', 'auto');
    tracer.recordNode('observe', {
      inputTokens: 500,
      outputTokens: 200,
      latencyMs: 150,
      model: 'gpt-4o-mini',
      extra: { profilesUpdated: 3, summaryChanged: true },
    });
    tracer.recordNode('strategist', {
      inputTokens: 800,
      outputTokens: 300,
      latencyMs: 200,
      model: 'gpt-4o-mini',
      extra: { decision: 'intervene', reason: 'test', plannedMessages: 2, plannedReactions: 1 },
    });

    const log = tracer.finalize();
    expect(log.totalInputTokens).toBe(1300);
    expect(log.totalOutputTokens).toBe(500);
    expect(log.totalLatencyMs).toBe(350);
    expect(log.estimatedCostUsd).toBeGreaterThan(0);
    expect(log.nodeResults.observe.inputTokens).toBe(500);
    expect(log.nodeResults.strategist.extra.decision).toBe('intervene');
  });

  it('records preconditions', () => {
    const tracer = new ScanTracer('conv-123', 'manual', 'admin-user-1');
    tracer.setPreconditions({
      activityScore: 0.35,
      messagesInWindow: 42,
      budgetBefore: { messagesUsed: 3, messagesMax: 10, usersActive: 2, maxUsers: 4 },
      controlledUserIds: ['u1', 'u2'],
      configSnapshot: { scanIntervalMinutes: 3, burstEnabled: true },
    });
    const log = tracer.finalize();
    expect(log.activityScore).toBe(0.35);
    expect(log.messagesInWindow).toBe(42);
    expect(log.controlledUserIds).toEqual(['u1', 'u2']);
    expect(log.triggeredBy).toBe('admin-user-1');
  });

  it('records outcome', () => {
    const tracer = new ScanTracer('conv-123', 'auto');
    tracer.setOutcome({
      outcome: 'messages_sent',
      messagesSent: 2,
      reactionsSent: 5,
      messagesRejected: 1,
      userIdsUsed: ['u1', 'u2'],
    });
    const log = tracer.finalize();
    expect(log.outcome).toBe('messages_sent');
    expect(log.messagesSent).toBe(2);
    expect(log.userIdsUsed).toEqual(['u1', 'u2']);
  });

  it('records generator per-message metrics', () => {
    const tracer = new ScanTracer('conv-123', 'auto');
    tracer.recordNode('generator', {
      inputTokens: 1000,
      outputTokens: 400,
      latencyMs: 300,
      model: 'gpt-4o-mini',
      extra: {
        messagesGenerated: 2,
        reactionsBuilt: 3,
        webSearchUsed: false,
        perMessage: [
          { asUserId: 'u1', wordCount: 25, inputTokens: 500, outputTokens: 200, latencyMs: 150 },
          { asUserId: 'u2', wordCount: 40, inputTokens: 500, outputTokens: 200, latencyMs: 150 },
        ],
      },
    });
    const log = tracer.finalize();
    expect(log.nodeResults.generator.extra.perMessage).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/agent && npx jest src/__tests__/tracing/scan-tracer.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// services/agent/src/tracing/scan-tracer.ts
import { estimateCostUsd } from './cost-estimator';

type NodeName = 'observe' | 'strategist' | 'generator' | 'qualityGate';

type NodeRecord = {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  costUsd: number;
  extra: Record<string, unknown>;
};

type Preconditions = {
  activityScore: number;
  messagesInWindow: number;
  budgetBefore: Record<string, unknown>;
  controlledUserIds: string[];
  configSnapshot: Record<string, unknown>;
};

type Outcome = {
  outcome: 'messages_sent' | 'reactions_only' | 'skipped' | 'error';
  messagesSent: number;
  reactionsSent: number;
  messagesRejected: number;
  userIdsUsed: string[];
};

export type ScanLogData = {
  conversationId: string;
  trigger: string;
  triggeredBy: string | null;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  activityScore: number;
  messagesInWindow: number;
  budgetBefore: Record<string, unknown> | null;
  controlledUserIds: string[];
  configSnapshot: Record<string, unknown> | null;
  nodeResults: Record<string, NodeRecord>;
  outcome: string;
  messagesSent: number;
  reactionsSent: number;
  messagesRejected: number;
  userIdsUsed: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalLatencyMs: number;
  estimatedCostUsd: number;
  configChangedAt: Date | null;
};

export class ScanTracer {
  private startTime = Date.now();
  private nodes: Record<string, NodeRecord> = {};
  private preconditions: Preconditions | null = null;
  private outcomeData: Outcome | null = null;
  private _configChangedAt: Date | null = null;

  constructor(
    private conversationId: string,
    private trigger: string,
    private triggeredBy: string | null = null,
  ) {}

  recordNode(
    name: NodeName,
    data: { inputTokens: number; outputTokens: number; latencyMs: number; model: string; extra: Record<string, unknown> },
  ): void {
    this.nodes[name] = {
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      latencyMs: data.latencyMs,
      model: data.model,
      costUsd: estimateCostUsd(data.model, data.inputTokens, data.outputTokens),
      extra: data.extra,
    };
  }

  setPreconditions(p: Preconditions): void {
    this.preconditions = p;
  }

  setOutcome(o: Outcome): void {
    this.outcomeData = o;
  }

  setConfigChangedAt(date: Date): void {
    this._configChangedAt = date;
  }

  finalize(): ScanLogData {
    const now = Date.now();
    let totalInput = 0;
    let totalOutput = 0;
    let totalLatency = 0;
    let totalCost = 0;

    for (const node of Object.values(this.nodes)) {
      totalInput += node.inputTokens;
      totalOutput += node.outputTokens;
      totalLatency += node.latencyMs;
      totalCost += node.costUsd;
    }

    return {
      conversationId: this.conversationId,
      trigger: this.trigger,
      triggeredBy: this.triggeredBy,
      startedAt: new Date(this.startTime),
      completedAt: new Date(now),
      durationMs: now - this.startTime,
      activityScore: this.preconditions?.activityScore ?? 0,
      messagesInWindow: this.preconditions?.messagesInWindow ?? 0,
      budgetBefore: this.preconditions?.budgetBefore ?? null,
      controlledUserIds: this.preconditions?.controlledUserIds ?? [],
      configSnapshot: this.preconditions?.configSnapshot ?? null,
      nodeResults: this.nodes,
      outcome: this.outcomeData?.outcome ?? 'skipped',
      messagesSent: this.outcomeData?.messagesSent ?? 0,
      reactionsSent: this.outcomeData?.reactionsSent ?? 0,
      messagesRejected: this.outcomeData?.messagesRejected ?? 0,
      userIdsUsed: this.outcomeData?.userIdsUsed ?? [],
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalLatencyMs: totalLatency,
      estimatedCostUsd: totalCost,
      configChangedAt: this._configChangedAt,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/agent && npx jest src/__tests__/tracing/scan-tracer.test.ts --no-coverage`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add services/agent/src/tracing/scan-tracer.ts services/agent/src/__tests__/tracing/scan-tracer.test.ts
git commit -m "feat(agent): add ScanTracer collector for per-node metrics"
```

---

## Phase 2: Graph Integration — Instrument Nodes + Persist Logs

### Task 4: Wrap Graph Nodes for Tracing

**Files:**
- Modify: `services/agent/src/graph/graph.ts`
- Create: `services/agent/src/tracing/traced-node.ts`

- [ ] **Step 1: Create traced-node wrapper**

```typescript
// services/agent/src/tracing/traced-node.ts
import type { ConversationState } from '../graph/state';
import type { ScanTracer } from './scan-tracer';

type NodeName = 'observe' | 'strategist' | 'generator' | 'qualityGate';

type NodeFn = (state: ConversationState) => Promise<Partial<ConversationState>>;

export function traceNode(name: NodeName, nodeFn: NodeFn, tracerRef: { current: ScanTracer | null }): NodeFn {
  return async (state: ConversationState) => {
    const tracer = tracerRef.current;
    const start = Date.now();
    const result = await nodeFn(state);

    if (tracer) {
      const inputTokens = (result as any)?._traceInputTokens ?? 0;
      const outputTokens = (result as any)?._traceOutputTokens ?? 0;
      const model = (result as any)?._traceModel ?? 'unknown';
      const extra = (result as any)?._traceExtra ?? {};

      tracer.recordNode(name, {
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - start,
        model,
        extra,
      });

      // Clean trace fields from state
      delete (result as any)?._traceInputTokens;
      delete (result as any)?._traceOutputTokens;
      delete (result as any)?._traceModel;
      delete (result as any)?._traceExtra;
    }

    return result;
  };
}
```

- [ ] **Step 2: Update graph builder to accept tracer ref**

Replace `services/agent/src/graph/graph.ts` content:

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';
import { ConversationStateAnnotation } from './state';
import { createObserverNode } from '../agents/observer';
import { createStrategistNode } from '../agents/strategist';
import { createGeneratorNode } from '../agents/generator';
import { createQualityGateNode } from '../agents/quality-gate';
import { traceNode } from '../tracing/traced-node';
import type { LlmProvider } from '../llm/types';
import type { ScanTracer } from '../tracing/scan-tracer';

export type TracerRef = { current: ScanTracer | null };

export function buildAgentGraph(llm: LlmProvider, tracerRef: TracerRef = { current: null }) {
  const graph = new StateGraph(ConversationStateAnnotation)
    .addNode('observe', traceNode('observe', createObserverNode(llm), tracerRef))
    .addNode('strategist', traceNode('strategist', createStrategistNode(llm), tracerRef))
    .addNode('generator', traceNode('generator', createGeneratorNode(llm), tracerRef))
    .addNode('qualityGate', traceNode('qualityGate', createQualityGateNode(llm), tracerRef))
    .addEdge(START, 'observe')
    .addEdge('observe', 'strategist')
    .addEdge('strategist', 'generator')
    .addEdge('generator', 'qualityGate')
    .addEdge(qualityGate, END);

  return graph.compile();
}
```

- [ ] **Step 3: Update each node to emit trace metadata via `_trace*` fields**

In each node's return statement, add trace fields from the LLM response. For example in `services/agent/src/agents/observer.ts`, in the `try` block after the `llm.chat()` call (~line 60), capture `response.usage` and `response.model`:

**observer.ts** — after `const response = await llm.chat(...)` (~line 60):
Add to the final return object at ~line 133:
```typescript
return {
  summary: parsed.summary ?? state.summary,
  toneProfiles: updatedProfiles,
  _traceInputTokens: response.usage.inputTokens,
  _traceOutputTokens: response.usage.outputTokens,
  _traceModel: response.model,
  _traceExtra: {
    profilesUpdated: Object.keys(parsed.profiles ?? {}).length,
    summaryChanged: (parsed.summary ?? '') !== state.summary,
  },
};
```

**strategist.ts** — after each `llm.chat()` call (~line 588), capture response usage. In the final return objects, add trace fields. The main LLM call return (~line 644):
```typescript
_traceInputTokens: response.usage.inputTokens,
_traceOutputTokens: response.usage.outputTokens,
_traceModel: response.model,
_traceExtra: {
  decision: withReactions.length > 0 ? 'intervene' : 'skip',
  reason: parsed.reason ?? '',
  plannedMessages: withReactions.filter(i => i.type === 'message').length,
  plannedReactions: withReactions.filter(i => i.type === 'reaction').length,
},
```

For early returns (activity > 0.7, budget exhausted, !shouldIntervene), set `_traceInputTokens: 0` etc. with appropriate `_traceExtra.decision` values ('skip_active', 'skip_budget', 'skip_no_intervene').

**generator.ts** — accumulate tokens across all `generateMessage` calls. Track per-message breakdown. Return in the node result (~line 239):
```typescript
_traceInputTokens: totalInputTokens,
_traceOutputTokens: totalOutputTokens,
_traceModel: lastModel,
_traceExtra: {
  messagesGenerated: actions.filter(a => a.type === 'message').length,
  reactionsBuilt: actions.filter(a => a.type === 'reaction').length,
  webSearchUsed: actions.some(a => (a as any)._usedWebSearch),
  perMessage: perMessageMetrics,
},
```

To collect per-message metrics, modify `generateMessage()` to return `{ message, metrics }` tuple instead of just `PendingMessage | null`. The `metrics` object: `{ asUserId, wordCount, inputTokens, outputTokens, latencyMs }`.

**quality-gate.ts** — accumulate tokens from LLM quality checks. Track rejections. Return (~line 259):
```typescript
_traceInputTokens: totalInputTokens,
_traceOutputTokens: totalOutputTokens,
_traceModel: lastModel,
_traceExtra: {
  accepted: validatedMessages.filter(a => a.type === 'message').length,
  rejected: messages.length - validatedMessages.filter(a => a.type === 'message').length,
  rejections: rejectionReasons,
},
```

Where `rejectionReasons` is an array built during the loop: `{ asUserId, reason }` for each rejected message.

- [ ] **Step 4: Commit**

```bash
git add services/agent/src/tracing/traced-node.ts services/agent/src/graph/graph.ts services/agent/src/agents/
git commit -m "feat(agent): instrument graph nodes with trace metadata"
```

---

### Task 5: Persist ScanLog from ConversationScanner

**Files:**
- Modify: `services/agent/src/memory/mongo-persistence.ts`
- Modify: `services/agent/src/scheduler/conversation-scanner.ts`
- Modify: `services/agent/src/server.ts`

- [ ] **Step 1: Add createScanLog to MongoPersistence**

Add at end of the class in `services/agent/src/memory/mongo-persistence.ts`:

```typescript
async createScanLog(data: {
  conversationId: string;
  trigger: string;
  triggeredBy?: string | null;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  activityScore: number;
  messagesInWindow: number;
  budgetBefore: any;
  controlledUserIds: string[];
  configSnapshot: any;
  nodeResults: any;
  outcome: string;
  messagesSent: number;
  reactionsSent: number;
  messagesRejected: number;
  userIdsUsed: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalLatencyMs: number;
  estimatedCostUsd: number;
  configChangedAt?: Date | null;
}) {
  return this.prisma.agentScanLog.create({ data });
}
```

- [ ] **Step 2: Update ConversationScanner constructor to accept tracerRef**

In `services/agent/src/scheduler/conversation-scanner.ts`, add import and field:

```typescript
import { ScanTracer } from '../tracing/scan-tracer';
import type { TracerRef } from '../graph/graph';
```

Add to constructor params: `private tracerRef: TracerRef`

- [ ] **Step 3: Instrument processConversation with ScanTracer**

In `processConversation()`, at the top (~line 172), create a tracer:

```typescript
const tracer = new ScanTracer(conversationId, 'auto');
this.tracerRef.current = tracer;
```

After the `detectActivity` call, set preconditions:

```typescript
tracer.setPreconditions({
  activityScore: activity.activityScore,
  messagesInWindow: effectiveMessages.length,
  budgetBefore: {
    messagesUsed: budgetCheck.current,
    messagesMax: budgetCheck.max,
    usersActive: todayStats.usersActive,
    maxUsers: maxUsersToday,
  },
  controlledUserIds: controlledUsers.map(u => u.userId),
  configSnapshot: {
    scanIntervalMinutes: conv.scanIntervalMinutes,
    maxResponsesPerCycle: conv.maxResponsesPerCycle,
    burstEnabled: conv.burstEnabled,
    burstSize: conv.burstSize,
    quietIntervalMinutes: conv.quietIntervalMinutes,
    weekdayMaxMessages: conv.weekdayMaxMessages,
    weekendMaxMessages: conv.weekendMaxMessages,
    maxControlledUsers: config?.maxControlledUsers ?? 5,
    qualityGateEnabled: conv.qualityGateEnabled,
  },
});
```

After graph invocation and action processing (before `return true` at ~line 522), set outcome and persist:

```typescript
const messageActions = pendingActions.filter(a => a.type === 'message');
const reactionActions = pendingActions.filter(a => a.type === 'reaction');
tracer.setOutcome({
  outcome: messageActions.length > 0 ? 'messages_sent' : reactionActions.length > 0 ? 'reactions_only' : 'skipped',
  messagesSent: messageActions.length,
  reactionsSent: reactionActions.length,
  messagesRejected: 0, // will be updated from qualityGate trace
  userIdsUsed: [...new Set(messageActions.map(a => (a as PendingMessage).asUserId))],
});

this.persistence.createScanLog(tracer.finalize()).catch(err =>
  console.error(`[Scanner] Error persisting scan log for conv=${conversationId}:`, err));
this.tracerRef.current = null;
```

For the early return paths (activity.shouldSkip, no controlled users, all on cooldown), also persist a minimal scan log with outcome `'skipped'`.

- [ ] **Step 4: Update server.ts to pass tracerRef**

In `services/agent/src/server.ts` (~line 56):

```typescript
import type { TracerRef } from './graph/graph';

const tracerRef: TracerRef = { current: null };
const graph = buildAgentGraph(llm, tracerRef);
// ...
const scanner = new ConversationScanner(graph, persistence, stateManager, deliveryQueue, redis, configCache, budgetManager, tracerRef);
```

- [ ] **Step 5: Commit**

```bash
git add services/agent/src/memory/mongo-persistence.ts services/agent/src/scheduler/conversation-scanner.ts services/agent/src/server.ts
git commit -m "feat(agent): persist ScanLog after every scan cycle"
```

---

## Phase 3: API Endpoints

### Task 6: Gateway scan-log routes

**Files:**
- Modify: `services/gateway/src/routes/admin/agent.ts`

- [ ] **Step 1: Add GET /scan-logs (paginated + filtered)**

Add before the global-config routes:

```typescript
// GET /scan-logs
fastify.get('/scan-logs', {
  onRequest: [fastify.authenticate, requireAgentAdmin],
  schema: {
    description: 'List scan logs with pagination and filters.',
    tags: ['admin-agent'],
    summary: 'List scan logs',
    security: securityBearerAuth,
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', default: 1 },
        limit: { type: 'integer', default: 20 },
        conversationId: { type: 'string' },
        trigger: { type: 'string' },
        outcome: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
    response: { 200: paginatedArrayResponse, ...stdErrors },
  },
}, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { page = 1, limit = 20, conversationId, trigger, outcome, from, to } = request.query as {
      page?: number; limit?: number; conversationId?: string; trigger?: string; outcome?: string; from?: string; to?: string;
    };

    const where: Record<string, unknown> = {};
    if (conversationId) where.conversationId = conversationId;
    if (trigger) where.trigger = trigger;
    if (outcome) where.outcome = outcome;
    if (from || to) {
      where.startedAt = {};
      if (from) (where.startedAt as Record<string, unknown>).gte = new Date(from);
      if (to) (where.startedAt as Record<string, unknown>).lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      fastify.prisma.agentScanLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          conversationId: true,
          trigger: true,
          startedAt: true,
          durationMs: true,
          outcome: true,
          messagesSent: true,
          reactionsSent: true,
          messagesRejected: true,
          userIdsUsed: true,
          totalInputTokens: true,
          totalOutputTokens: true,
          estimatedCostUsd: true,
          conversation: { select: { id: true, title: true, type: true } },
        },
      }),
      fastify.prisma.agentScanLog.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: logs,
      pagination: { total, page, limit, hasMore: page * limit < total },
    });
  } catch (error) {
    logError(fastify.log, 'Error fetching scan logs:', error);
    return sendInternalError(reply, 'Erreur serveur');
  }
});
```

- [ ] **Step 2: Add GET /scan-logs/stats (aggregated for chart)**

```typescript
// GET /scan-logs/stats
fastify.get('/scan-logs/stats', {
  onRequest: [fastify.authenticate, requireAgentAdmin],
  schema: {
    description: 'Get aggregated scan stats for charting (daily buckets over 6 months).',
    tags: ['admin-agent'],
    summary: 'Get scan stats for chart',
    security: securityBearerAuth,
    querystring: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        months: { type: 'integer', default: 6 },
        bucket: { type: 'string', default: 'day', enum: ['day', 'week'] },
      },
    },
    response: { 200: successDataResponse, ...stdErrors },
  },
}, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { conversationId, months = 6, bucket = 'day' } = request.query as {
      conversationId?: string; months?: number; bucket?: 'day' | 'week';
    };

    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const where: Record<string, unknown> = { startedAt: { gte: since } };
    if (conversationId) where.conversationId = conversationId;

    const logs = await fastify.prisma.agentScanLog.findMany({
      where,
      select: {
        startedAt: true,
        conversationId: true,
        outcome: true,
        messagesSent: true,
        reactionsSent: true,
        userIdsUsed: true,
        estimatedCostUsd: true,
        configChangedAt: true,
      },
      orderBy: { startedAt: 'asc' },
    });

    const buckets = new Map<string, {
      date: string;
      scans: number;
      conversations: Set<string>;
      users: Set<string>;
      messagesSent: number;
      reactionsSent: number;
      costUsd: number;
      configChanges: number;
      outcomes: Record<string, number>;
    }>();

    for (const log of logs) {
      const d = log.startedAt;
      let key: string;
      if (bucket === 'week') {
        const weekStart = new Date(d);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = weekStart.toISOString().slice(0, 10);
      } else {
        key = d.toISOString().slice(0, 10);
      }

      let b = buckets.get(key);
      if (!b) {
        b = { date: key, scans: 0, conversations: new Set(), users: new Set(), messagesSent: 0, reactionsSent: 0, costUsd: 0, configChanges: 0, outcomes: {} };
        buckets.set(key, b);
      }
      b.scans++;
      b.conversations.add(log.conversationId);
      for (const uid of log.userIdsUsed) b.users.add(uid);
      b.messagesSent += log.messagesSent;
      b.reactionsSent += log.reactionsSent;
      b.costUsd += log.estimatedCostUsd;
      if (log.configChangedAt) b.configChanges++;
      b.outcomes[log.outcome] = (b.outcomes[log.outcome] ?? 0) + 1;
    }

    const data = [...buckets.values()].map(b => ({
      date: b.date,
      scans: b.scans,
      conversations: b.conversations.size,
      users: b.users.size,
      messagesSent: b.messagesSent,
      reactionsSent: b.reactionsSent,
      costUsd: Math.round(b.costUsd * 10000) / 10000,
      configChanges: b.configChanges,
      outcomes: b.outcomes,
    }));

    return sendSuccess(reply, { buckets: data, totalLogs: logs.length, since: since.toISOString() });
  } catch (error) {
    logError(fastify.log, 'Error fetching scan stats:', error);
    return sendInternalError(reply, 'Erreur serveur');
  }
});
```

- [ ] **Step 3: Add GET /scan-logs/:id (full detail)**

```typescript
// GET /scan-logs/:id
fastify.get('/scan-logs/:logId', {
  onRequest: [fastify.authenticate, requireAgentAdmin],
  schema: {
    description: 'Get full detail of a single scan log.',
    tags: ['admin-agent'],
    summary: 'Get scan log detail',
    security: securityBearerAuth,
    params: {
      type: 'object',
      required: ['logId'],
      properties: { logId: objectIdParam },
    },
    response: { 200: successDataResponse, ...stdErrorsWithNotFound },
  },
}, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { logId } = request.params as { logId: string };
    if (!validateObjectId(logId, 'logId', reply)) return;

    const log = await fastify.prisma.agentScanLog.findUnique({
      where: { id: logId },
      include: {
        conversation: { select: { id: true, title: true, type: true } },
      },
    });
    if (!log) return sendNotFound(reply, 'Scan log non trouve');

    return sendSuccess(reply, log);
  } catch (error) {
    logError(fastify.log, 'Error fetching scan log detail:', error);
    return sendInternalError(reply, 'Erreur serveur');
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/routes/admin/agent.ts
git commit -m "feat(gateway): add scan-logs list, stats, and detail endpoints"
```

---

## Phase 4: Frontend Service + Types

### Task 7: Frontend Service Methods

**Files:**
- Modify: `apps/web/services/agent-admin.service.ts`

- [ ] **Step 1: Add types**

Add after the `TriggerResult` type:

```typescript
export type ScanLogSummary = {
  id: string;
  conversationId: string;
  trigger: string;
  startedAt: string;
  durationMs: number;
  outcome: string;
  messagesSent: number;
  reactionsSent: number;
  messagesRejected: number;
  userIdsUsed: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  conversation: AgentConfigConversation | null;
};

export type ScanLogDetail = ScanLogSummary & {
  triggeredBy: string | null;
  completedAt: string;
  activityScore: number;
  messagesInWindow: number;
  budgetBefore: { messagesUsed: number; messagesMax: number; usersActive: number; maxUsers: number } | null;
  controlledUserIds: string[];
  configSnapshot: Record<string, unknown> | null;
  nodeResults: Record<string, {
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    model: string;
    costUsd: number;
    extra: Record<string, unknown>;
  }> | null;
  configChangedAt: string | null;
};

export type ScanStatsBucket = {
  date: string;
  scans: number;
  conversations: number;
  users: number;
  messagesSent: number;
  reactionsSent: number;
  costUsd: number;
  configChanges: number;
  outcomes: Record<string, number>;
};

export type ScanStatsData = {
  buckets: ScanStatsBucket[];
  totalLogs: number;
  since: string;
};

export type ScanLogsFilters = {
  page?: number;
  limit?: number;
  conversationId?: string;
  trigger?: string;
  outcome?: string;
  from?: string;
  to?: string;
};
```

- [ ] **Step 2: Add service methods**

Add to `agentAdminService` object, before `resetAll`:

```typescript
async getScanLogs(filters: ScanLogsFilters = {}): Promise<ApiResponse<ScanLogSummary[]>> {
  const response = await apiService.get('/admin/agent/scan-logs', filters);
  return unwrapResponse<ScanLogSummary[]>(response);
},

async getScanLogDetail(logId: string): Promise<ApiResponse<ScanLogDetail>> {
  const response = await apiService.get(`/admin/agent/scan-logs/${logId}`);
  return unwrapResponse<ScanLogDetail>(response);
},

async getScanStats(params: { conversationId?: string; months?: number; bucket?: 'day' | 'week' } = {}): Promise<ApiResponse<ScanStatsData>> {
  const response = await apiService.get('/admin/agent/scan-logs/stats', params);
  return unwrapResponse<ScanStatsData>(response);
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/services/agent-admin.service.ts
git commit -m "feat(web): add scan-logs types and service methods"
```

---

## Phase 5: Frontend UI — History Tab

### Task 8: ScanHistoryChart Component

**Files:**
- Create: `apps/web/components/admin/agent/ScanHistoryChart.tsx`

- [ ] **Step 1: Create the chart component**

Full Recharts ComposedChart with dual Y-axes. See design spec for visual reference. Key features:
- AreaChart for conversations (indigo-200 fill) and users (amber-200 fill)
- LineChart for scans (indigo-600 stroke)
- BarChart for cost on right Y-axis (emerald-400)
- Vertical dashed lines for config changes (`configChanges > 0`)
- Custom tooltip showing all metrics for the hovered bucket
- Period selector: 1m / 3m / 6m
- Bucket selector: day / week
- Conversation filter (ConversationPicker)
- Uses `next/dynamic` for lazy import of Recharts components
- `memo` wrapper, all `&&` → ternary

Full component code: ~200 lines using `ResponsiveContainer`, `ComposedChart`, `Area`, `Line`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ReferenceLine`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/admin/agent/ScanHistoryChart.tsx
git commit -m "feat(web): add ScanHistoryChart with 6-month time series"
```

---

### Task 9: ScanControlPanel Component

**Files:**
- Create: `apps/web/components/admin/agent/ScanControlPanel.tsx`

- [ ] **Step 1: Create the control panel**

Two-mode panel with scope selector (Global / Conversation).

**Global mode** controls (from `AgentGlobalConfig`):
- `maxConversationsPerCycle` — Input number
- `messageFreshnessHours` — Slider 1-168
- `eligibleConversationTypes` — Multi-select chips

**Conversation mode** controls (from `AgentConfig`):
- ConversationPicker at top
- Section "Cadence": `scanIntervalMinutes` slider, `enabled` toggle, burst group
- Section "Scope": `minResponsesPerCycle`, `maxResponsesPerCycle`, `maxReactionsPerCycle` inputs
- Section "Participants": `maxControlledUsers`, `autoPickupEnabled`, `weekdayMaxUsers`, `weekendMaxUsers`, `weekdayMaxMessages`, `weekendMaxMessages`, `inactivityThresholdHours` slider, `inactivityDaysThreshold`
- Each field shows current value + "from last scan" value (gray badge) when different
- "Appliquer" button that calls `upsertConfig` or `updateGlobalConfig`

Uses existing UI patterns from `AgentConfigDialog` (Label + InfoIcon, sections with bg-slate-50/50 styling).

~350 lines.

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/admin/agent/ScanControlPanel.tsx
git commit -m "feat(web): add ScanControlPanel with global/conversation scope"
```

---

### Task 10: ScanLogTable + ScanLogDetail Components

**Files:**
- Create: `apps/web/components/admin/agent/ScanLogTable.tsx`
- Create: `apps/web/components/admin/agent/ScanLogDetail.tsx`

- [ ] **Step 1: Create ScanLogTable**

Paginated table with filters:
- Columns: Time, Conversation, Trigger, Outcome, Messages, Reactions, Rejected, Cost, Duration
- Filter bar: trigger dropdown, outcome dropdown, date range
- Click row → opens ScanLogDetail dialog
- Pagination at bottom
- `formatTimeAgo` for relative timestamps
- Badge colors: messages_sent=emerald, reactions_only=amber, skipped=gray, error=red

~200 lines.

- [ ] **Step 2: Create ScanLogDetail**

Dialog modal showing full scan detail:
- Header: conversation name, trigger badge, timestamp
- Preconditions card: activityScore, messagesInWindow, budgetBefore, controlledUserIds
- Config snapshot (collapsible JSON viewer)
- Node pipeline: 4 cards in sequence (observe → strategist → generator → qualityGate)
  - Each shows: tokens (in/out), latency, cost, model
  - Extra data per node (decisions, rejections, per-message metrics)
- Outcome summary: messages sent, reactions, rejections, users used
- Total cost badge

~250 lines.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/admin/agent/ScanLogTable.tsx apps/web/components/admin/agent/ScanLogDetail.tsx
git commit -m "feat(web): add ScanLogTable and ScanLogDetail components"
```

---

### Task 11: AgentHistoryTab + Wire into Page

**Files:**
- Create: `apps/web/components/admin/agent/AgentHistoryTab.tsx`
- Modify: `apps/web/app/admin/agent/page.tsx`

- [ ] **Step 1: Create AgentHistoryTab**

Composes the 3 sub-components:
```typescript
'use client';

import React, { memo } from 'react';
import dynamic from 'next/dynamic';

const ScanHistoryChart = dynamic(() => import('./ScanHistoryChart'), {
  loading: () => <div className="h-80 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});
const ScanControlPanel = dynamic(() => import('./ScanControlPanel'), {
  loading: () => <div className="h-48 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});
const ScanLogTable = dynamic(() => import('./ScanLogTable'), {
  loading: () => <div className="h-64 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});

export default memo(function AgentHistoryTab() {
  return (
    <div className="space-y-6">
      <ScanControlPanel />
      <ScanHistoryChart />
      <ScanLogTable />
    </div>
  );
});
```

- [ ] **Step 2: Add "History" tab to page.tsx**

In `apps/web/app/admin/agent/page.tsx`:

Add import:
```typescript
import { History } from 'lucide-react';
```

Add dynamic import:
```typescript
const AgentHistoryTab = dynamic(
  () => import('@/components/admin/agent/AgentHistoryTab'),
  { loading: () => <SectionLoader /> }
);
```

Add to tabs array:
```typescript
{ id: 'history', label: 'Controle & Historique', icon: History },
```

Add TabsContent:
```typescript
<TabsContent value="history" className="mt-6">
  <AgentHistoryTab />
</TabsContent>
```

Update grid from `grid-cols-6` to `grid-cols-7` (or use flex-wrap for 7 tabs).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/admin/agent/AgentHistoryTab.tsx apps/web/app/admin/agent/page.tsx
git commit -m "feat(web): add Control & History tab to agent admin page"
```

---

## Phase 6: Verification & Review

### Task 12: TypeScript Compilation Check

- [ ] **Step 1: Check agent service compiles**

Run: `cd services/agent && npx tsc --noEmit`
Expected: Only pre-existing errors (CallEventsHandler etc.), none in our files.

- [ ] **Step 2: Check web app compiles**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | grep -E "ScanHistory|ScanControl|ScanLog|AgentHistory|scan-tracer|cost-estimator|traced-node"`
Expected: "No errors in our files"

- [ ] **Step 3: Check gateway compiles**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | grep "scan-log"`
Expected: No output (no errors)

### Task 13: Run Agent Tests

- [ ] **Step 1: Run all agent tests**

Run: `cd services/agent && npx jest --no-coverage`
Expected: All tests pass including new scan-tracer and cost-estimator tests.

### Task 14: Prisma Generate Validation

- [ ] **Step 1: Verify Prisma schema is valid**

Run: `cd packages/shared && npx prisma validate`
Expected: "The schema is valid."

- [ ] **Step 2: Generate client**

Run: `cd packages/shared && npx prisma generate`
Expected: "Generated Prisma Client"

### Task 15: Final Commit

- [ ] **Step 1: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(agent): complete Control & History module — scan logs, tracing, controls, charts"
```
