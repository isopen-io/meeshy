# Agent Scheduling: Spread Actions Over Day + Persistent Queue + Web Search

**Date:** 2026-04-05
**Status:** Approved

## Problem Statement

Three issues with the current agent service:

1. **Activity concentrated in short bursts** — `delaySeconds` clamped to 30-180s in strategist, `conversationGap()` maxes at 330s. All actions delivered within minutes of a scan, no activity spread across the day.
2. **Web search not effectively used** — Double gate (`directive.needsWebSearch && state.webSearchEnabled`) with conservative strategist prompt means web search almost never triggers. Default `webSearchEnabled` is `false`.
3. **In-memory delivery queue** — `setTimeout`-based queue loses all scheduled actions on service restart. Incompatible with multi-hour delays.

## Goals

- Actions spread randomly across the entire day (5min to 24h delays), driven by admin config
- Persistent delivery queue that survives restarts
- Topic deduplication: no redundant messages on the same subject from the same user in a day
- Web search effectively available when enabled
- All behavior bounded by existing admin config + new config fields

## Non-Goals

- Changing the LangGraph pipeline structure
- Changing the ZMQ communication protocol
- Modifying the reactive/interpellation path (keeps its fast 2-180s delays)

---

## Design

### 1. Persistent Delivery Queue (Redis Sorted Set)

**Replace in-memory `setTimeout` queue with Redis-backed persistent queue.**

#### Storage Structure

- **Sorted Set** `agent:delivery:pending` — score = `scheduledAt` timestamp (ms), member = serialized JSON `{ id, conversationId, action, topicCategory, topicHash, createdAt }`
- **Hash** `agent:delivery:item:{id}` — full action payload (for edit/inspect via admin API)
- **Set** `agent:delivery:user:{conversationId}:{userId}` — IDs of pending actions for fast per-user lookup
- **TTL**: 48h on item hashes for auto-cleanup

#### Poller

- Runs every 10s via `setInterval`
- `ZRANGEBYSCORE agent:delivery:pending -inf {now} LIMIT 0 10` — fetch ready items
- For each ready item: `ZREM` + deliver via ZMQ publisher
- Before delivery: check for human activity (existing `getRecentMessageCount` logic)
- On service startup: poller starts immediately, picks up where it left off

#### Enqueue Pre-checks (ordered)

Before adding a new action for a user:

1. **Topic conflict** — Read all pending actions for user via `agent:delivery:user:{convId}:{userId}`. If same `topicCategory` exists today → **merge** (keep existing timestamp, update content by combining directives, increment `mergeCount`)
2. **Rate limit** — Count user's actions scheduled in the next 10 minutes. If >= `maxMessagesPerUserPer10Min` (config, default 4) → push action to next available slot after the 10-min window
3. **Tempo minimum** — Find latest scheduled action for same user. Apply `conversationGap()` (existing word-count-based gap calculation). If new action too close → shift forward

#### Merge Logic

- Same user + same `topicCategory` + same calendar day (UTC) = merge
- Keep the earlier `scheduledAt` timestamp
- Content: the new directive enriches the existing one (stored as combined context for regeneration)
- `mergeCount` field tracks how many fusions occurred
- Admin UI shows merge indicator on delivery queue items

### 2. Delay Categories Driven by Admin Config

**New config fields (added to agent config schema):**

| Field | Type | Default | Validation | Description |
|-------|------|---------|------------|-------------|
| `minDelayMinutes` | number | 1 | 1-1440 | Minimum delay before action delivery |
| `maxDelayMinutes` | number | 360 | 1-1440 | Maximum delay before action delivery |
| `spreadOverDayEnabled` | boolean | true | — | Distribute actions across remaining day budget |
| `maxMessagesPerUserPer10Min` | number | 4 | 1-20 | Rate limit per user per 10-minute window |

**Delay categories in strategist:**

The strategist outputs a `delayCategory` per action instead of raw `delaySeconds`:

| Category | Mapping within `[minDelayMinutes, maxDelayMinutes]` | When |
|----------|-----------------------------------------------------|------|
| `immediate` | `min` to `min + 0.1 * (max - min)` | Direct response to active conversation |
| `short` | `min + 0.1 * range` to `min + 0.3 * range` | Reaction to ongoing topic |
| `medium` | `min + 0.3 * range` to `min + 0.7 * range` | Spontaneous contribution, revival |
| `long` | `min + 0.7 * range` to `max` | Thought leadership, deep topic |

Resolution: pick random value within the mapped range, apply 20% jitter.

**Config controls everything:**
- `minDelayMinutes=1, maxDelayMinutes=30` → all activity within 30 minutes
- `minDelayMinutes=5, maxDelayMinutes=1440` → spread across entire day
- `spreadOverDayEnabled=true` → distribute actions uniformly across remaining daily budget

**Tone profile influence:**
- `typicalLength: 'court'` → bias toward `immediate`/`short` categories
- `typicalLength: 'long'` → bias toward `medium`/`long` (more "thoughtful" timing)

**Existing config respected:**
- `burstSize` / `burstIntervalMinutes` / `quietIntervalMinutes` still enforced
- `weekdayMaxMessages` / `weekendMaxMessages` budget still enforced
- `scanIntervalMinutes` controls scan frequency as before
- `minResponsesPerCycle` / `maxResponsesPerCycle` bounds per scan

### 3. Topic Deduplication

**New fields on `PendingAction`:**

```typescript
type PendingMessage = {
  // ... existing fields
  topicCategory: string;    // e.g. "sport", "politique", "humour"
  topicHash: string;        // short hash of content for near-duplicate detection
  delayCategory: 'immediate' | 'short' | 'medium' | 'long';
};
```

**Strategist receives scheduled topics:**

Before deciding, the strategist prompt includes:
```
Actions deja programmees pour les prochaines heures:
- {userId} @{username}: "{topicCategory}" dans {remainingMinutes}min
- ...
```

The strategist is instructed to:
- Avoid proposing the same `topicCategory` already scheduled for a user
- Combine with existing `recentTopicCategories` (covers past 6h of delivered content)
- Propose diverse subjects across controlled users

**Scanner pre-check:**

Before invoking the graph, `conversation-scanner.ts`:
1. Reads all pending actions for the conversation from Redis
2. Passes them as `scheduledActions` to the graph state
3. If the number of pending actions already covers the budget → skip to observation only

### 4. Web Search Activation

**Two flags with distinct semantics (preserved):**

- `webSearchEnabled` (config admin per conversation) = **authorization** — "this conversation is allowed to use web search"
  - **Default changes from `false` to `true`**
- `needsWebSearch` (strategist directive) = **need** — "this specific response would benefit from web search"

**Behavior matrix:**

| `webSearchEnabled` | `needsWebSearch` | Result |
|---------------------|-------------------|--------|
| `true` | `true` | Tool available + prompt nudge ("Use web search for current info") |
| `true` | `false` | Tool available (LLM may still use it if relevant) |
| `false` | `true` | No tool (config blocks it) |
| `false` | `false` | No tool |

**Changes:**

1. **`generator.ts`**: Pass `web_search_preview` tool whenever `webSearchEnabled = true` (remove `needsWebSearch` from tool gate)
2. **`generator.ts`**: When `needsWebSearch = true`, add nudge in user prompt + pass `searchHint` from strategist
3. **`strategist.ts`**: New field `searchHint: string | null` — suggested search query when `needsWebSearch = true`
4. **`strategist.ts`**: Less restrictive prompt: "true si la reponse serait enrichie par des informations recentes, des faits verifiables, ou du contexte externe" (was: "true si le sujet requiert des informations actuelles ou factuelles")
5. **Config schema default**: `webSearchEnabled` default `true` in both gateway and agent service

### 5. Scanner Integration

**`conversation-scanner.ts` changes:**

Before invoking the graph:
1. Fetch pending actions for conversation from Redis sorted set
2. If pending action count >= remaining daily budget → skip, log "sufficient actions scheduled"
3. Pass `scheduledActions` (with `topicCategory`, `userId`, `scheduledAt`) to graph state

**Graph state addition:**
```typescript
scheduledActions: Annotation<ScheduledActionSummary[]>({
  reducer: (_current, update) => update,
  default: () => [],
}),
```

Where:
```typescript
type ScheduledActionSummary = {
  userId: string;
  topicCategory: string;
  scheduledAt: number;
  type: 'message' | 'reaction';
};
```

### 6. Reactive Path (Unchanged)

The reactive/interpellation handler (`timing-calculator.ts`) keeps its fast delays (2s-180s). This path handles direct mentions, replies, greetings — these need immediate response.

The only change: respect `minDelayMinutes` from config as a floor if it's > 0 and the interpellation is not a greeting.

---

## Files Modified

| File | Change |
|------|--------|
| `services/agent/src/delivery/delivery-queue.ts` | Full rewrite: Redis sorted set, poller, pre-checks, merge logic |
| `services/agent/src/graph/state.ts` | Add `topicCategory`, `topicHash`, `delayCategory` on PendingAction; add `scheduledActions` on state |
| `services/agent/src/agents/strategist.ts` | Prompt: delay categories, searchHint, scheduled topics context, less restrictive web search |
| `services/agent/src/agents/strategist.ts` | Validation: map delayCategory to seconds within config bounds |
| `services/agent/src/agents/generator.ts` | Web search tool gated on `webSearchEnabled` only; nudge prompt on `needsWebSearch` |
| `services/agent/src/scheduler/conversation-scanner.ts` | Fetch scheduled actions before scan; pass to graph; skip if budget covered |
| `services/agent/src/reactive/timing-calculator.ts` | Respect `minDelayMinutes` config floor |
| `services/gateway/src/routes/admin/agent.ts` | Add 4 new config fields in Zod schema; default `webSearchEnabled` to `true` |
| `apps/web/components/admin/agent/ScanControlPanel.tsx` | UI controls for new config fields |
| `apps/web/services/agent-admin.service.ts` | Add new config types |

## Migration

- Existing conversations with no explicit `webSearchEnabled` will default to `true`
- Existing conversations with no delay config will use `minDelayMinutes=1, maxDelayMinutes=360`
- In-memory delivery queue items at deploy time will be lost (one-time, acceptable since current delays are < 5 min anyway)
- No database migration needed — config fields are schemaless in MongoDB agent config

## Risks

- **Long-delay actions may become stale** — if conversation context changes significantly between scheduling and delivery. Mitigation: before delivery, re-check human activity (existing) + optionally re-validate content freshness
- **Redis memory** — each action is ~1-2KB JSON. Even 10k scheduled actions = ~20MB. Acceptable.
- **Merge quality** — fused actions need coherent content. The merged directive is passed back to generator for regeneration, not string-concatenated.
