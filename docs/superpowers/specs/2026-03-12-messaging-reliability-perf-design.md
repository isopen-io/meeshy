# Messaging Reliability & Performance — Design Spec

## Context

Two comprehensive reviews were conducted on the optimistic messaging implementation (commit `fb3598de`):

1. **Code Review** — 3 critical, 4 important, 4 suggestions
2. **Vercel React Best Practices Audit** — 2 critical, 5 high, 5 medium

This spec consolidates all 19 issues into 3 independent sub-plans that can be executed in parallel via git worktrees.

### Issue Mapping

| # | Source | Issue | Sub-Plan |
|---|--------|-------|----------|
| 1 | Code Review | Dedup logic duplicated (socket-cache-sync vs RQ hook) | B1 |
| 2 | Code Review | Dedup by content+sender+30s = false positives | B1 |
| 3 | Code Review | `as any` in createOptimisticMessage | B2 |
| 4 | Code Review | CallManager socket null at mount | B3 |
| 5 | Code Review | Zustand store optimistic = dead code | B2 |
| 6 | Code Review | Retry loses attachments/mentions | B2 |
| 7 | Code Review | REST fallback can create duplicates | B1 |
| 8 | Vercel | js-combine-iterations (socket-cache-sync) | B1 (combined iterations happen naturally after dedup simplification) |
| 9 | Vercel | js-combine-iterations (messages-display) | B3 |
| 10 | Vercel | rerender-dependencies (ConversationLayout parallel load effect) | B3 |
| 11 | Vercel | rerender-dependencies (ConversationLayout direct load effect) | B3 |
| 12 | Vercel | Stale closure in handleForceTranslation | B3 |
| 13 | Vercel | rerender-dependencies (ConversationMessages scroll effect) | B3 |
| 14 | Vercel | js-set-map-lookups (conversations findIndex) | B1 (file already owned by B1) |
| 15 | Vercel | MessagesDisplay non-memo | B3 |
| 16 | Vercel | Scroll listener instable (ConversationMessages) | B3 |
| 17 | Vercel | Barrel imports hooks/conversations | B2 |
| 18 | Vercel | handleSendMessage 15+ deps instables | B3 |
| 19 | Vercel | mapTypingUsers Date.now() defeats memo | B3 |

## Engineering Process (Non-Negotiable)

Every task in every sub-plan MUST follow this cycle:

```
Plan d'implementation → Review architecte
  → RED (test failing) → GREEN (impl minimale) → REFACTOR → COMMIT
    → Review tech lead
      → Integration → Review senior full stack
```

- **TDD**: No production code without a failing test first
- **Review gates**: Each sub-plan has a review checkpoint before merge
- **Integration**: Clean build from main after all merges
- **Own-message invariant**: Messages from the connected user MUST always render on the right side. Every optimistic message must have `senderId === currentUser.id` AND `sender.id === currentUser.id`. This is verified at creation, at server replacement, and at retry.

---

## Sub-Plan B1: Reliable Dedup (Gateway + Frontend)

### Goal
Eliminate false-positive dedup via Socket.IO ack pattern. The `clientMessageId` is private to the sender — never broadcasted.

### Architecture

```
Sender                          Gateway                      Others
  │                                │                            │
  ├── message:send ───────────────>│                            │
  │   { content, clientMsgId }     │                            │
  │                                │── message:new ────────────>│
  │                                │   { id, content }          │
  │                                │   (NO clientMsgId)         │
  │                                │                            │
  │<── ack callback ───────────────│                            │
  │   { id, clientMsgId }          │                            │
  │                                │                            │
  └── replace temp → server id     │                            │
```

### Files Changed

| File | Change |
|------|--------|
| `services/gateway/src/socketio/MeeshySocketIOManager.ts` (lines 292+, 540+) | Accept `clientMessageId` in `message:send` and `message:send-with-attachments` payloads, return it in Socket.IO ack callback, DO NOT include in `message:new` broadcast |
| `apps/web/services/socketio/messaging.service.ts` | Send `clientMessageId` in payload, return ack response (not just boolean) |
| `apps/web/hooks/queries/use-conversation-messages-rq.ts` | New `replaceOptimisticMessage(tempId, serverMessage)` method. Remove content-based dedup from `addMessage`. Define `OptimisticMessage` type (shared with B2) |
| `apps/web/hooks/queries/use-socket-cache-sync.ts` | Remove content-based optimistic dedup. Keep ID-only dedup. Single authority for `message:new` cache mutations. Combine `flatMap`+`some` into single loop (#8). Map lookup for conversations (#14) |
| `apps/web/components/conversations/ConversationLayout.tsx` | `handleSendMessage`: use ack callback to replace optimistic. On timeout/error → markMessageFailed |

### Ack Timeout
- Socket.IO ack timeout: **10 seconds** (matches current `emitWithTimeout` value)
- On timeout: mark message as failed, DO NOT auto-fallback to REST
- On ack error response: mark message as failed
- REST fallback only triggers if socket is fully disconnected at send time (not on timeout)

### REST Fallback Safety (Issue #7)
- Before falling back to REST, check if message already in cache (by server ID from a `message:new` that may have arrived)
- REST endpoint also accepts `clientMessageId`, returns it in response
- Use response to replace optimistic message

### Replacement Semantics
- `replaceOptimisticMessage(tempId, serverMessage)` performs a **full replacement**, not a merge
- The server message entirely replaces the optimistic entry in the cache
- No `_sendPayload`, `_tempId`, or `_localStatus` fields survive after replacement

### Own-Message Invariant
- `createOptimisticMessage`: assert `senderId === user.id` and `sender.id === user.id`
- `replaceOptimisticMessage`: verify server response preserves `senderId` consistency
- After retry: use current `user.id`, never copy `senderId` from failed message

---

## Sub-Plan B2: Dead Code & Type Safety

### Goal
Remove dead code, fix type safety, restore lost data on retry, clean imports.

### Files Changed

| File | Change | Issue |
|------|--------|-------|
| `apps/web/stores/conversation-store.ts` | Remove 4 optimistic methods + types from interface | #5 dead code |
| `apps/web/components/conversations/ConversationLayout.tsx` | `createOptimisticMessage` returns `OptimisticMessage` (type imported from RQ hook, defined by B1) without `as any`. Add `_sendPayload` for retry. Replace barrel import with direct imports | #3, #6, #17 |
| `apps/web/components/messages/FailedMessageBar.tsx` | No change needed (reads tempId, handler reads payload from cache) | #6 |

**Note**: `OptimisticMessage` type is defined in `use-conversation-messages-rq.ts` (owned by B1). B2 imports it — no file conflict.

### OptimisticMessage Type

```typescript
type OptimisticMessage = Omit<Message, 'id'> & {
  id: string;          // tempId used as id for rendering
  _tempId: string;
  _localStatus: 'sending' | 'failed';
  _sendPayload: {
    attachmentIds?: string[];
    attachmentMimeTypes?: string[];
    mentionedUserIds?: string[];
  };
};
```

### Retry With Full Payload (Issue #6)
- `handleRetryMessage` reads `_sendPayload` from the failed message in cache
- Passes `attachmentIds`, `attachmentMimeTypes`, `mentionedUserIds` to `sendMessageViaSocket`

### Barrel Import Fix (Issue #17)
Replace barrel import with direct imports:
```typescript
import { useConversationSelection } from '@/hooks/conversations/use-conversation-selection';
import { useConversationUI } from '@/hooks/conversations/use-conversation-ui';
// ... etc for all 9 hooks
```
Verify impact with `ANALYZE=true npm run build` before and after.

---

## Sub-Plan B3: Re-render Optimization

### Goal
Reduce unnecessary re-renders and redundant iterations in the message rendering pipeline.

### Files Changed

| File | Change | Issue |
|------|--------|-------|
| `apps/web/components/common/messages-display.tsx` | Wrap in `memo()`. Combine `filter`+`map` into single loop. Fix stale closure deps | #9, #12, #15 |
| `apps/web/components/conversations/ConversationLayout.tsx` | `useRef` for volatile state in `handleSendMessage`. Narrow effect deps (`conversations` → derived, `user` → `user?.id`) | #10, #11, #18 |
| `apps/web/components/conversations/ConversationView.tsx` | Memoize `mapTypingUsers` result | #19 |
| `apps/web/components/conversations/ConversationMessages.tsx` | `messages` → `messages.length` in scroll effect dep. `useRef` for `handleScroll` | #13, #16 |
| `apps/web/components/video-call/CallManager.tsx` | Handle null socket at mount — retry attach on service-level connect | #4 |

### Key Patterns

**Stable handleSendMessage (Issue #18)**
```typescript
const stateRef = useRef({ newMessage, attachmentIds, selectedLanguage, isTyping, ... });
stateRef.current = { newMessage, attachmentIds, selectedLanguage, isTyping, ... };

const handleSendMessage = useCallback(async () => {
  const { newMessage, attachmentIds, ... } = stateRef.current;
  // ... only stable deps in array
}, [selectedConversation, user?.id, sendMessageViaSocket, addOptimisticMessage, markMessageFailed]);
```

**Memoized mapTypingUsers (Issue #19)**
```typescript
const mappedTypingUsers = useMemo(
  () => mapTypingUsers(typingUsers, conversation.id),
  [typingUsers, conversation.id]
);
```

**Combined iterations (Issues #8, #9)**
```typescript
// Before: flatMap + some = 2 passes (3 with find pre-B1)
// After: true single-pass over nested pages
for (const page of old.pages) {
  for (const m of page.messages) {
    if (m.id === message.id) return old; // already exists
  }
}
// No intermediate array allocation
```

**Narrowed effect dependencies (Issues #10, #11, #13)**
```typescript
// Before: conversations (entire array ref)
// After: derived stable value
const conversationIdSet = useMemo(() => new Set(conversations.map(c => c.id)), [conversations]);
```

---

## Execution Order & Worktree Strategy

```bash
# B1 — Dedup (includes gateway)
git worktree add ../v2_meeshy-feat/messaging-dedup -b feat/messaging-dedup dev

# B2 — Dead code & type safety
git worktree add ../v2_meeshy-feat/messaging-types -b feat/messaging-types dev

# B3 — Re-render optimization
git worktree add ../v2_meeshy-feat/messaging-perf -b feat/messaging-perf dev
```

### File Ownership
- **B1 owns**: `MeeshySocketIOManager.ts`, `messaging.service.ts`, `use-socket-cache-sync.ts`, `use-conversation-messages-rq.ts`
- **B2 owns**: `conversation-store.ts`
- **B3 owns**: `messages-display.tsx`, `ConversationMessages.tsx`, `ConversationView.tsx`, `CallManager.tsx`

### ConversationLayout.tsx Touch Zones (Shared File)
- **B2 touches**: `createOptimisticMessage` function body + import block (barrel → direct imports)
- **B1 touches**: `handleSendMessage` function body only (ack callback, timeout logic)
- **B3 touches**: `useEffect` blocks (deps narrowing) + `useRef` declarations above handlers

Merge order ensures each sub-plan resolves conflicts from the previous merge before applying.

### Test Files
| Sub-Plan | Test Files |
|----------|-----------|
| B1 | `services/gateway/src/socketio/__tests__/message-ack.test.ts` (new), `apps/web/hooks/queries/__tests__/use-socket-cache-sync.test.ts` (new), `apps/web/hooks/queries/__tests__/use-conversation-messages-rq.test.ts` (new) |
| B2 | `apps/web/stores/__tests__/conversation-store.test.ts` (verify methods removed), `apps/web/components/conversations/__tests__/ConversationLayout.test.tsx` (optimistic type + retry payload) |
| B3 | `apps/web/components/common/__tests__/messages-display.test.tsx` (memo + iterations), `apps/web/components/conversations/__tests__/ConversationMessages.test.tsx` (scroll stability) |

### Merge Order
1. **B2** (dead code cleanup, no functional change) — safest first
2. **B1** (dedup refactor, gateway change) — functional change
3. **B3** (perf optimization) — no functional change, adapts to final code shape
4. **Clean build** from main after all merges

### Review Gates
- After each sub-plan implementation: tech lead review
- After each merge to dev: senior full stack review
- After final merge: integration test + manual verification
