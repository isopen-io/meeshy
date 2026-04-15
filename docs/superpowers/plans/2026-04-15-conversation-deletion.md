# Conversation Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement "delete for me" (permanent personal removal) and enrich "delete for all" (close conversation with closedAt/closedBy) across gateway, shared types, SDK, and iOS app.

**Architecture:** New gateway route `DELETE /conversations/:id/delete-for-me` sets `deletedForMe` timestamp on participant. Existing `DELETE /conversations/:id` enriched with `closedAt`/`closedBy`. New socket event `conversation:closed`. iOS filters deleted conversations and disables composer on closed ones.

**Tech Stack:** Fastify (gateway), Prisma/MongoDB, Socket.IO, SwiftUI (iOS), MeeshySDK (Swift)

---

### Task 1: Prisma schema — add deletedForMe, closedAt, closedBy

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`

- [ ] **Step 1: Add deletedForMe to Participant model**

After `bannedAt DateTime?` (line 474), add:

```prisma
  /// Permanent personal deletion — conversation hidden forever for this user
  deletedForMe DateTime?
```

- [ ] **Step 2: Add closedAt and closedBy to Conversation model**

After `isActive Boolean @default(true)` (line 302), add:

```prisma
  /// Conversation closed for all — no one can write, messages stay readable
  closedAt  DateTime?
  closedBy  String?   @db.ObjectId
```

- [ ] **Step 3: Generate Prisma client**

Run: `cd packages/shared && npx prisma generate`

- [ ] **Step 4: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "schema: add deletedForMe to Participant, closedAt/closedBy to Conversation"
```

---

### Task 2: Socket event — add CONVERSATION_CLOSED

**Files:**
- Modify: `packages/shared/types/socketio-events.ts`

- [ ] **Step 1: Add CONVERSATION_CLOSED to SERVER_EVENTS**

After `CONVERSATION_PARTICIPANT_BANNED` line, add:

```typescript
  CONVERSATION_CLOSED: 'conversation:closed',
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/types/socketio-events.ts
git commit -m "feat(shared): add CONVERSATION_CLOSED socket event"
```

---

### Task 3: Gateway — new DELETE /conversations/:id/delete-for-me route

**Files:**
- Create: `services/gateway/src/routes/conversations/delete-for-me.ts`
- Modify: `services/gateway/src/routes/conversations/index.ts`

- [ ] **Step 1: Create delete-for-me.ts**

```typescript
import { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess, sendNotFound, sendBadRequest } from '../../utils/response'
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events'
import { resolveConversationId } from '../../utils/conversation-id-cache'

export function registerDeleteForMeRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  _optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = (fastify as any).socketIOHandler

  fastify.delete<{ Params: { id: string } }>(
    '/conversations/:id/delete-for-me',
    {
      schema: {
        description: 'Permanently hide a conversation for the calling user. Does not notify other participants.',
        tags: ['conversations'],
        summary: 'Delete conversation for me',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preValidation: [requiredAuth],
    },
    async (request, reply) => {
      const { id: rawId } = request.params
      const authRequest = request as UnifiedAuthRequest
      const userId = authRequest.authContext.userId

      const conversationId = await resolveConversationId(prisma, rawId) ?? rawId

      const participant = await prisma.participant.findFirst({
        where: { conversationId, userId, isActive: true },
      })

      if (!participant) {
        return sendNotFound(reply, 'Vous ne participez pas a cette conversation')
      }

      // If caller is CREATOR, transfer ownership before deletion
      if (participant.role === 'CREATOR') {
        const successor = await prisma.participant.findFirst({
          where: {
            conversationId,
            isActive: true,
            userId: { not: userId },
          },
          orderBy: [
            { role: 'asc' },     // ADMIN < MEMBER < MODERATOR alphabetically — but we want MODERATOR first
            { joinedAt: 'asc' }, // Then oldest
          ],
        })

        if (successor) {
          // Promote successor: prefer MODERATOR, then oldest member
          await prisma.participant.update({
            where: { id: successor.id },
            data: { role: 'CREATOR' },
          })

          // Broadcast role change
          const socketIOManager = socketIOHandler?.getManager?.()
          const io = socketIOManager?.io || (socketIOHandler as any)?.io
          if (io) {
            io.to(ROOMS.conversation(conversationId)).emit(
              SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED,
              {
                conversationId,
                userId: successor.userId,
                newRole: 'CREATOR',
                promotedBy: userId,
              }
            )
          }
        } else {
          // No other active members — close conversation entirely
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { isActive: false },
          })
        }
      }

      // Mark as deleted for this user
      const now = new Date()
      await prisma.participant.update({
        where: { id: participant.id },
        data: { deletedForMe: now, isActive: false },
      })

      // Remove user from socket room (no broadcast — silent deletion)
      const socketIOManager = socketIOHandler?.getManager?.()
      const io = socketIOManager?.io || (socketIOHandler as any)?.io
      if (io) {
        const userSockets = await io.in(ROOMS.user(userId)).fetchSockets()
        for (const s of userSockets) {
          s.leave(ROOMS.conversation(conversationId))
        }
      }

      return sendSuccess(reply, { conversationId, deletedAt: now.toISOString() })
    }
  )
}
```

- [ ] **Step 2: Fix successor ordering**

The `orderBy: { role: 'asc' }` won't correctly prioritize MODERATOR over MEMBER. Use a raw query or two-step lookup instead:

```typescript
        // Find successor: first try MODERATOR, then ADMIN (unlikely), then oldest MEMBER
        let successor = await prisma.participant.findFirst({
          where: {
            conversationId,
            isActive: true,
            userId: { not: userId },
            role: 'MODERATOR',
          },
          orderBy: { joinedAt: 'asc' },
        })

        if (!successor) {
          successor = await prisma.participant.findFirst({
            where: {
              conversationId,
              isActive: true,
              userId: { not: userId },
            },
            orderBy: { joinedAt: 'asc' },
          })
        }
```

Replace the single `findFirst` with this two-step lookup in the file.

- [ ] **Step 3: Register route in index.ts**

In `services/gateway/src/routes/conversations/index.ts`, add import and registration:

```typescript
import { registerDeleteForMeRoutes } from './delete-for-me';
```

And in the function body, after `registerLeaveRoutes`:

```typescript
  registerDeleteForMeRoutes(fastify, prisma, optionalAuth, requiredAuth);
```

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/routes/conversations/delete-for-me.ts \
      services/gateway/src/routes/conversations/index.ts
git commit -m "feat(gateway): add DELETE /conversations/:id/delete-for-me route"
```

---

### Task 4: Gateway — enrich DELETE /conversations/:id with closedAt/closedBy + socket broadcast

**Files:**
- Modify: `services/gateway/src/routes/conversations/core.ts`

- [ ] **Step 1: Update the DELETE handler**

In `core.ts`, find the existing DELETE handler (around line 1124-1128). Replace:

```typescript
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isActive: false }
      });
```

With:

```typescript
      const now = new Date()
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isActive: false, closedAt: now, closedBy: userId }
      });

      // Broadcast closure to all members
      const socketIOManager = (fastify as any).socketIOHandler?.getManager?.()
      const io = socketIOManager?.io || ((fastify as any).socketIOHandler as any)?.io
      if (io) {
        io.to(ROOMS.conversation(conversationId)).emit(
          SERVER_EVENTS.CONVERSATION_CLOSED,
          { conversationId, closedBy: userId, closedAt: now.toISOString() }
        )
      }
```

Add imports at the top of the file if not already present:

```typescript
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events'
```

- [ ] **Step 2: Filter deletedForMe in GET /conversations**

In the same file, find the list handler's `whereClause` (around line 160). Change:

```typescript
        participants: {
          some: {
            userId: userId,
            isActive: true
          }
        },
```

To:

```typescript
        participants: {
          some: {
            userId: userId,
            isActive: true,
            deletedForMe: null
          }
        },
```

- [ ] **Step 3: Commit**

```bash
git add services/gateway/src/routes/conversations/core.ts
git commit -m "feat(gateway): enrich delete-for-all with closedAt/closedBy + filter deletedForMe in list"
```

---

### Task 5: SDK — add closedAt/closedBy to ConversationModels + socket handler

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`

- [ ] **Step 1: Add fields to APIConversation**

Find `APIConversation` in `ConversationModels.swift`. Add after existing fields:

```swift
public let closedAt: Date?
public let closedBy: String?
```

Add to `CodingKeys` if explicit.

- [ ] **Step 2: Add fields to MeeshyConversation**

Find `MeeshyConversation`. Add:

```swift
public var closedAt: Date?
public var closedBy: String?
```

- [ ] **Step 3: Map in toConversation()**

In the `APIConversation.toConversation()` extension, pass:

```swift
closedAt: closedAt,
closedBy: closedBy,
```

- [ ] **Step 4: Add conversation:closed socket handler**

In `MessageSocketManager.swift`, add a new publisher:

```swift
public let conversationClosed = PassthroughSubject<ConversationClosedEvent, Never>()
```

Add the event struct:

```swift
public struct ConversationClosedEvent: Decodable {
    public let conversationId: String
    public let closedBy: String
    public let closedAt: String
}
```

Add handler in `subscribeToEvents()`:

```swift
socket.on("conversation:closed") { [weak self] data, _ in
    self?.decode(ConversationClosedEvent.self, from: data) { event in
        self?.conversationClosed.send(event)
    }
}
```

- [ ] **Step 5: Build SDK**

Run: `cd packages/MeeshySDK && swift build`

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift \
      packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift
git commit -m "feat(sdk): add closedAt/closedBy to conversation models + conversation:closed socket"
```

---

### Task 6: iOS — ConversationSettingsView UI for both actions

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationSettingsView.swift`

- [ ] **Step 1: Add deleteForMe UI**

Find the danger section (around line 478-516). Add "Supprimer pour moi" button visible for ALL participants, above the existing leave/delete buttons:

```swift
// Delete for me — available to all participants
Button(role: .destructive) {
    showDeleteForMeAlert = true
} label: {
    Label("Supprimer pour moi", systemImage: "eye.slash")
}
.alert("Supprimer pour moi ?", isPresented: $showDeleteForMeAlert) {
    Button("Annuler", role: .cancel) {}
    Button("Supprimer", role: .destructive) {
        Task {
            try? await ConversationService.shared.deleteForMe(conversationId: conversationId)
            dismiss()
        }
    }
} message: {
    Text("Cette conversation disparaitra definitivement de votre liste. Les autres membres ne seront pas affectes.")
}
```

- [ ] **Step 2: Add showDeleteForMeAlert state**

Add `@State private var showDeleteForMeAlert = false` to the view.

- [ ] **Step 3: Update "Supprimer pour tous" label**

Change the existing delete button label from "Delete conversation" to "Supprimer pour tous" with a distinct icon:

```swift
Label("Supprimer pour tous", systemImage: "trash.fill")
```

Update its confirmation message to clarify the action closes the conversation for everyone.

- [ ] **Step 4: Build and commit**

Run: `./apps/ios/meeshy.sh build`

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationSettingsView.swift
git commit -m "feat(ios): add delete-for-me and rename delete-for-all in conversation settings"
```

---

### Task 7: iOS — handle conversation:closed in ConversationView (disable composer + banner)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

- [ ] **Step 1: Add closedAt observation to ConversationViewModel**

Add a published property:

```swift
@Published var isConversationClosed = false
```

In the socket handler setup, subscribe to `conversation:closed`:

```swift
messageSocket.conversationClosed
    .filter { $0.conversationId == self.conversationId }
    .receive(on: DispatchQueue.main)
    .sink { [weak self] _ in
        self?.isConversationClosed = true
    }
    .store(in: &cancellables)
```

Also check on initial load: if `conversation.closedAt != nil`, set `isConversationClosed = true`.

- [ ] **Step 2: Disable composer when closed**

In `ConversationView.swift`, wrap the `themedComposer` in a condition:

```swift
if viewModel.isConversationClosed {
    closedConversationBanner
} else {
    themedComposer
}
```

Add the banner view:

```swift
private var closedConversationBanner: some View {
    HStack(spacing: 8) {
        Image(systemName: "lock.fill")
            .foregroundColor(.secondary)
        Text("Cette conversation a ete fermee")
            .font(.subheadline)
            .foregroundColor(.secondary)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 14)
    .background(.ultraThinMaterial)
}
```

- [ ] **Step 3: Build and commit**

Run: `./apps/ios/meeshy.sh build`

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
      apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "feat(ios): disable composer and show banner when conversation is closed"
```

---

### Task 8: iOS — filter deletedForMe conversations + SyncEngine + NotificationCoordinator

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`

- [ ] **Step 1: Gateway already filters deletedForMe (Task 4)**

The GET /conversations API now filters `deletedForMe: null`. So the list response won't include deleted conversations. The iOS side just needs to handle the case where a conversation disappears from the list after delete-for-me.

- [ ] **Step 2: After deleteForMe call, remove conversation locally**

In the delete-for-me action (from ConversationSettingsView), after the API call succeeds, notify the ConversationListViewModel to remove the conversation from its local cache:

```swift
Task {
    try? await ConversationService.shared.deleteForMe(conversationId: conversationId)
    await NotificationCoordinator.shared.removeConversation(conversationId)
    await CacheCoordinator.shared.conversations.invalidateAll()
    dismiss()
}
```

`NotificationCoordinator.removeConversation()` already exists and removes the conversation from unread tracking.

- [ ] **Step 3: SyncEngine — handle conversation:closed**

In `ConversationSyncEngine.swift`, subscribe to `conversationClosed` in `startSocketRelay()`:

```swift
messageSocket.conversationClosed
    .sink { [weak self] event in
        guard let self else { return }
        Task {
            await self.cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
                    updated[idx].closedAt = ISO8601DateFormatter().date(from: event.closedAt)
                }
                return updated
            }
            self._conversationsDidChange.send()
        }
    }
    .store(in: &socketSubscriptions)
```

- [ ] **Step 4: Build and commit**

Run: `./apps/ios/meeshy.sh build`

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift \
      packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift \
      packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationSettingsView.swift
git commit -m "feat(ios): filter deletedForMe, handle conversation:closed in SyncEngine"
```
