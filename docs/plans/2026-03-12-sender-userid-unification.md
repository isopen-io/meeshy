# Sender User ID Unification Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the User ID vs Participant ID confusion by unifying the sender data shape across REST and Socket.IO, creating a single utility for sender identification, and properly typing `Participant.user`.

**Architecture:** The gateway will add `userId` to REST sender responses (aligning with Socket.IO). A shared utility `getSenderUserId()` will replace all 8+ ad-hoc fallback chains. The frontend transformer will use this utility and set `sender.id` to User.id deterministically. `Participant.user` will be typed as a proper interface instead of `unknown`.

**Tech Stack:** TypeScript, Zod (shared types), Fastify/Prisma (gateway), React (web frontend)

---

## Context

### The Problem
`Message.senderId` in the Prisma schema references `Participant.id` (not `User.id`). A registered user has 1 `User.id` but N `Participant.id` values (one per conversation). The frontend authenticates by `User.id` (JWT/auth-store), so every "is this my message?" check must bridge the gap.

Currently this bridging is done with 8+ copy-pasted fallback chains like:
```typescript
(message.sender as any)?.userId ?? (message.sender as any)?.user?.id ?? (message.sender as any)?.id
```

### Root Causes
1. **Two wire formats**: REST sends `sender.user.id` (nested), Socket.IO sends `sender.userId` (flat)
2. **`transformSender()` silently corrupts**: falls back to Participant.id when User.id is missing
3. **`Participant.user` typed as `unknown`**: TypeScript can't help, everything is `as any`
4. **No shared utility**: the fallback chain is copy-pasted everywhere

### Data Flow (Current)
```
REST:      sender = { id: PARTICIPANT_ID, user: { id: USER_ID } }     — no top-level userId
Socket.IO: sender = { id: PARTICIPANT_ID, userId: USER_ID }           — no nested .user
Transformer: sender.id = nestedUser?.id || sender.userId || sender.id  — guesswork
Component:  sender?.userId ?? sender?.user?.id ?? sender?.id           — 3 fallbacks with `as any`
```

### Data Flow (Target)
```
REST:       sender = { id: PARTICIPANT_ID, userId: USER_ID, user: { id: USER_ID } }
Socket.IO:  sender = { id: PARTICIPANT_ID, userId: USER_ID }
Shared:     getSenderUserId(sender) → USER_ID  (one function, typed, no guessing)
Transformer: sender.id = getSenderUserId(rawSender)  (deterministic)
Component:  message.sender.id === currentUser.id  (direct comparison, no fallback)
```

---

## Task 1: Type `Participant.user` properly instead of `unknown`

**Files:**
- Modify: `packages/shared/types/participant.ts:71`

**Step 1: Define `ParticipantUser` interface and update the Zod schema**

Replace `user: z.unknown().optional()` with a proper typed schema. This user object is a subset of the full User — only the fields the gateway actually selects.

```typescript
// Add before BaseParticipantSchema (around line 52)
export const ParticipantUserSchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  displayName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  avatar: z.string().optional(),
  isOnline: z.boolean().optional(),
  lastActiveAt: z.coerce.date().optional(),
  systemLanguage: z.string().optional(),
  role: z.string().optional(),
})
export type ParticipantUser = z.infer<typeof ParticipantUserSchema>
```

Then in `BaseParticipantSchema`, change line 71:
```typescript
// OLD:
user: z.unknown().optional(),
// NEW:
user: ParticipantUserSchema.optional(),
```

**Step 2: Verify the shared package builds**

Run: `cd packages/shared && npm run build`
Expected: BUILD SUCCESS (no type errors)

**Step 3: Commit**

```bash
git add packages/shared/types/participant.ts
git commit -m "refactor(shared): type Participant.user as ParticipantUser instead of unknown"
```

---

## Task 2: Create `getSenderUserId()` utility in shared package

**Files:**
- Create: `packages/shared/utils/sender-identity.ts`
- Modify: `packages/shared/utils/index.ts` (add export)

**Step 1: Create the utility**

```typescript
// packages/shared/utils/sender-identity.ts

import type { Participant, ParticipantUser } from '../types/participant.js';

/**
 * Extracts the User ID from a message sender.
 *
 * The sender can be:
 * - A Participant with nested .user (REST API responses)
 * - A SocketIOMessageSender with flat .userId (Socket.IO broadcasts)
 * - A transformed User-like object where .id is already User.id
 *
 * Priority: userId (flat) > user.id (nested) > null
 * NEVER falls back to sender.id because that could be a Participant.id.
 */
export function getSenderUserId(sender: Record<string, unknown> | null | undefined): string | null {
  if (!sender) return null;

  // Socket.IO path: userId is flat on the sender object
  if (typeof sender.userId === 'string' && sender.userId) {
    return sender.userId;
  }

  // REST path: user is a nested object with its own id
  const user = sender.user as Record<string, unknown> | undefined;
  if (user && typeof user.id === 'string' && user.id) {
    return user.id;
  }

  return null;
}
```

**Step 2: Export from utils/index.ts**

Add to `packages/shared/utils/index.ts`:
```typescript
export { getSenderUserId } from './sender-identity.js';
```

**Step 3: Verify build**

Run: `cd packages/shared && npm run build`
Expected: BUILD SUCCESS

**Step 4: Commit**

```bash
git add packages/shared/utils/sender-identity.ts packages/shared/utils/index.ts
git commit -m "feat(shared): add getSenderUserId() utility for sender identification"
```

---

## Task 3: Add `userId` to REST sender responses in gateway

**Files:**
- Modify: `services/gateway/src/routes/conversations/messages.ts:374-395`

**Step 1: Add `userId: true` to the sender Prisma select**

The REST endpoint currently selects:
```typescript
sender: {
  select: {
    id: true,           // Participant.id
    displayName: true,
    avatar: true,
    type: true,
    role: true,
    language: true,
    user: { select: { id: true, username: true, ... } }
  }
}
```

Add `userId: true` at the same level as `id: true`:
```typescript
sender: {
  select: {
    id: true,           // Participant.id
    userId: true,       // ← ADD: User.id at top level (aligns with Socket.IO shape)
    displayName: true,
    avatar: true,
    type: true,
    role: true,
    language: true,
    user: { select: { id: true, username: true, ... } }
  }
}
```

**Step 2: Find ALL other Prisma sender selects in the gateway and add `userId: true`**

Search for all `sender: { select:` patterns in the gateway routes. Key files:
- `services/gateway/src/routes/conversations/messages.ts` (2 locations: main query ~374 and reply query if separate)
- `services/gateway/src/routes/conversations/core.ts` (lastMessage sender in conversation list/detail)
- `services/gateway/src/routes/conversations/search.ts` (search results with messages)
- `services/gateway/src/socketio/handlers/MessageHandler.ts:499-517` (`_fetchMessageForBroadcast` — already has `userId: true` at line 506, verify)

For EACH: ensure the sender select includes `userId: true`.

Run: `grep -rn "sender:" services/gateway/src/routes/ services/gateway/src/socketio/ | grep "select"` to find all locations.

**Step 3: Commit**

```bash
git add services/gateway/
git commit -m "fix(gateway): add userId to all REST sender Prisma selects"
```

---

## Task 4: Refactor `transformSender()` to use `getSenderUserId()`

**Files:**
- Modify: `apps/web/services/conversations/transformers.service.ts:169-213`

**Step 1: Import and use the utility**

```typescript
import { getSenderUserId } from '@meeshy/shared/utils/sender-identity';
```

Replace the current `transformSender` method (lines 169-213):

```typescript
private transformSender(sender: any, _unused: any, defaultId: string): User {
  if (!sender) return this.createDefaultUser(defaultId);

  // Resolve User ID deterministically — never fall back to Participant.id
  const userId = getSenderUserId(sender);
  const nestedUser = sender.user as Record<string, unknown> | undefined;

  const username = sender.username || nestedUser?.username;
  const firstName = sender.firstName || nestedUser?.firstName || '';
  const lastName = sender.lastName || nestedUser?.lastName || '';
  const displayName = sender.nickname || sender.displayName || nestedUser?.displayName || username || '';
  const avatar = sender.avatar || nestedUser?.avatar;
  const role = sender.role || nestedUser?.role || 'USER';
  const systemLanguage = sender.systemLanguage || nestedUser?.systemLanguage || 'fr';
  const regionalLanguage = sender.regionalLanguage || nestedUser?.regionalLanguage || 'fr';

  return {
    id: String(userId || defaultId),
    username: username ? String(username) : '',
    firstName: String(firstName),
    lastName: String(lastName),
    displayName: String(displayName),
    email: String(sender.email || ''),
    phoneNumber: String(sender.phoneNumber || ''),
    role: String(role),
    permissions: this.DEFAULT_PERMISSIONS,
    systemLanguage: String(systemLanguage),
    regionalLanguage: String(regionalLanguage),
    customDestinationLanguage: undefined,
    autoTranslateEnabled: Boolean(sender.autoTranslateEnabled),
    translateToSystemLanguage: Boolean(sender.translateToSystemLanguage),
    translateToRegionalLanguage: Boolean(sender.translateToRegionalLanguage),
    useCustomDestination: Boolean(sender.useCustomDestination),
    isOnline: Boolean(sender.isOnline),
    avatar: avatar as string | undefined,
    createdAt: new Date(sender.createdAt || Date.now()),
    lastActiveAt: new Date(sender.lastActiveAt || Date.now()),
    isActive: Boolean(sender.isActive ?? true),
    updatedAt: new Date(sender.updatedAt || Date.now()),
  };
}
```

**Step 2: Verify build**

Run: `cd apps/web && npx next build 2>&1 | tail -20` (or `npx tsc --noEmit`)
Expected: No type errors related to transformSender

**Step 3: Commit**

```bash
git add apps/web/services/conversations/transformers.service.ts
git commit -m "refactor(web): use getSenderUserId() in transformSender — no more fallback chain"
```

---

## Task 5: Replace all ad-hoc sender identification patterns in frontend

**Files to modify** (8 files total):
1. `apps/web/components/common/BubbleMessage.tsx:112`
2. `apps/web/hooks/use-message-interactions.ts:47`
3. `apps/web/app/v2/(protected)/chats/page.tsx:499`
4. `apps/web/components/conversations/ConversationMessages.tsx:172`
5. `apps/web/components/conversations/ConversationMessages.tsx:371`
6. `apps/web/hooks/conversations/use-socket-callbacks.ts:164`
7. `apps/web/hooks/v2/use-conversations-v2.ts:111`
8. `apps/web/hooks/v2/use-messages-v2.ts:100`
9. `apps/web/hooks/queries/use-socket-cache-sync.ts:112`
10. `apps/web/components/common/bubble-stream-page.tsx:256`

**Step 1: Import `getSenderUserId` in each file**

Add at top of each file:
```typescript
import { getSenderUserId } from '@meeshy/shared/utils/sender-identity';
```

**Step 2: Replace each pattern**

In each file, replace the ad-hoc fallback chain with a call to `getSenderUserId()`.

**Pattern A** — Most files use this:
```typescript
// OLD (multiple variants):
const senderUserId = (message.sender as any)?.userId ?? (message.sender as any)?.user?.id ?? (message.sender as any)?.id;

// NEW:
const senderUserId = getSenderUserId(message.sender as Record<string, unknown>) ?? message.sender?.id;
```

Note: after Task 4's transformer fix, `message.sender.id` will already be the User.id for transformed messages. The `getSenderUserId()` call handles raw/untransformed messages (Socket.IO), and the `?? message.sender?.id` fallback handles already-transformed messages where `userId`/`user` are stripped.

**Pattern B** — `BubbleMessage.tsx` has the anonymous path to preserve:
```typescript
// OLD:
const isOwnMessage = useMemo(() => {
  if (!currentUser) return false;
  if (isAnonymous && currentAnonymousUserId) {
    return message.sender?.id === currentAnonymousUserId;
  }
  const senderUserId = (message.sender as any)?.userId ?? (message.sender as any)?.user?.id ?? message.sender?.id;
  return senderUserId === currentUser.id;
}, [message.sender, currentUser, isAnonymous, currentAnonymousUserId]);

// NEW:
const isOwnMessage = useMemo(() => {
  if (!currentUser) return false;
  if (isAnonymous && currentAnonymousUserId) {
    return message.sender?.id === currentAnonymousUserId;
  }
  const senderUserId = getSenderUserId(message.sender as Record<string, unknown>) ?? message.sender?.id;
  return senderUserId === currentUser.id;
}, [message.sender, currentUser, isAnonymous, currentAnonymousUserId]);
```

**Pattern C** — `use-socket-callbacks.ts` uses OR instead of ??:
```typescript
// OLD:
const isMessageFromCurrentUser =
  currentUser && ((message.sender as any)?.userId === currentUser.id || (message.sender as any)?.user?.id === currentUser.id || (message.sender as any)?.id === currentUser.id);

// NEW:
const senderUserId = getSenderUserId(message.sender as Record<string, unknown>) ?? (message.sender as any)?.id;
const isMessageFromCurrentUser = currentUser && senderUserId === currentUser.id;
```

**Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/
git commit -m "refactor(web): replace 10 ad-hoc sender ID patterns with getSenderUserId()"
```

---

## Task 6: Verify end-to-end correctness

**Step 1: Start the gateway and web app locally**

```bash
# In tmux window 1
cd services/gateway && npm run dev

# In tmux window 2
cd apps/web && npm run dev
```

**Step 2: Log in and verify message alignment**

1. Open `http://localhost:3100` in browser
2. Log in with test credentials (`atabeth` / `pD5p1ir9uxLUf2X2FpNE`)
3. Open any conversation with existing messages
4. Verify: own messages appear on the RIGHT side
5. Verify: other users' messages appear on the LEFT side
6. Send a new message — verify it appears on the RIGHT side immediately

**Step 3: Verify unread counts**

1. Open a second browser/incognito as `jcharlesnm` / `zircy8-kyrgot-putcoC`
2. Send a message from jcharlesnm to atabeth
3. Verify: atabeth's conversation list shows the unread badge (not incrementing for own messages)

**Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix(web): adjustments from e2e verification of sender ID unification"
```

---

## Summary of Changes

| Layer | Before | After |
|-------|--------|-------|
| **Type system** | `Participant.user: unknown` | `Participant.user: ParticipantUser` |
| **Shared utils** | No utility | `getSenderUserId()` — single source of truth |
| **Gateway REST** | `sender.id` only (Participant.id) | `sender.userId` + `sender.user.id` + `sender.id` |
| **Frontend transformer** | `nestedUser?.id \|\| sender.userId \|\| sender.id` (3 fallbacks) | `getSenderUserId(sender)` (deterministic) |
| **Frontend components** | 10 copy-pasted fallback chains with `as any` | `getSenderUserId()` calls, typed |

## Files Changed (Complete List)

1. `packages/shared/types/participant.ts` — type `user` properly
2. `packages/shared/utils/sender-identity.ts` — new utility (CREATE)
3. `packages/shared/utils/index.ts` — export new utility
4. `services/gateway/src/routes/conversations/messages.ts` — add `userId` to sender select
5. `services/gateway/src/routes/conversations/core.ts` — add `userId` to sender select
6. `services/gateway/src/routes/conversations/search.ts` — add `userId` to sender select
7. `apps/web/services/conversations/transformers.service.ts` — use `getSenderUserId()`
8. `apps/web/components/common/BubbleMessage.tsx` — use `getSenderUserId()`
9. `apps/web/hooks/use-message-interactions.ts` — use `getSenderUserId()`
10. `apps/web/app/v2/(protected)/chats/page.tsx` — use `getSenderUserId()`
11. `apps/web/components/conversations/ConversationMessages.tsx` — use `getSenderUserId()` (2 locations)
12. `apps/web/hooks/conversations/use-socket-callbacks.ts` — use `getSenderUserId()`
13. `apps/web/hooks/v2/use-conversations-v2.ts` — use `getSenderUserId()`
14. `apps/web/hooks/v2/use-messages-v2.ts` — use `getSenderUserId()`
15. `apps/web/hooks/queries/use-socket-cache-sync.ts` — use `getSenderUserId()`
16. `apps/web/components/common/bubble-stream-page.tsx` — use `getSenderUserId()`
