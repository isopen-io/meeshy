# Conversation Management — Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover all conversation management gaps — leave endpoint, real-time socket events, personal preferences tab, admin view with member management, ban/unban, and share link management.

**Architecture:** Feature Slice Vertical — each task delivers Gateway + SDK + iOS changes end-to-end. Two UX surfaces: a "Préférences" tab in the existing ConversationInfoSheet (personal settings) and a full-page ConversationAdminView (admin settings pushed via NavigationStack).

**Tech Stack:** TypeScript/Fastify (gateway), Swift/SwiftUI (iOS + SDK), Prisma (schema), Socket.IO (real-time), Zod (validation)

**Spec:** `docs/superpowers/specs/2026-04-01-conversation-management-complete-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `services/gateway/src/routes/conversations/leave.ts` | Leave conversation endpoint |
| `services/gateway/src/routes/conversations/ban.ts` | Ban/unban participant endpoints |
| `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift` | Personal preferences tab in info sheet |
| `apps/ios/Meeshy/Features/Main/Views/ConversationAdminView.swift` | Full-page admin view |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationAdminViewModel.swift` | Admin view state + save logic |
| `apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift` | Member list + role management + ban/expel |
| `packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputView.swift` | Reusable tag input with autocomplete + FlowLayout |
| `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerView.swift` | Reusable category picker with inline creation |

### Modified Files

| File | Changes |
|------|---------|
| `packages/shared/types/socketio-events.ts` | Add 4 new server events |
| `services/gateway/src/routes/conversations/core.ts` | Enrich PUT with new fields + socket emission |
| `services/gateway/src/routes/conversations/participants.ts` | Remove self-removal block (leave handles it now) |
| `services/gateway/src/routes/conversations/index.ts` | Register new route files |
| `services/gateway/src/socketio/handlers/ConversationHandler.ts` | Add ban check on join |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift` | Add leave(), ban(), unban(), enrich update() |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift` | Add customName to UpdateConversationPreferencesRequest |
| `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` | Add 4 new listeners + publishers |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` | Add missing fields to MeeshyConversation |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift` | Add customName to APIConversationPreferences |
| `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift` | Add 4th tab, change gear → NavigationLink |
| `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` | Fix "Supprimer" label semantics |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` | Subscribe to new socket events |

---

## Task 1: Socket Event Constants (Shared)

**Files:**
- Modify: `packages/shared/types/socketio-events.ts`

- [ ] **Step 1: Add new server event constants**

In `packages/shared/types/socketio-events.ts`, add these entries inside the `SERVER_EVENTS` object (after the existing `PARTICIPANT_ROLE_UPDATED` entry):

```typescript
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_PARTICIPANT_LEFT: 'conversation:participant-left',
  CONVERSATION_PARTICIPANT_BANNED: 'conversation:participant-banned',
  CONVERSATION_PARTICIPANT_UNBANNED: 'conversation:participant-unbanned',
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd services/gateway && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/types/socketio-events.ts
git commit -m "feat(shared): add conversation management socket events"
```

---

## Task 2: Leave Conversation Endpoint (Gateway)

**Files:**
- Create: `services/gateway/src/routes/conversations/leave.ts`
- Modify: `services/gateway/src/routes/conversations/index.ts`

- [ ] **Step 1: Create the leave route file**

Create `services/gateway/src/routes/conversations/leave.ts`:

```typescript
import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { requiredAuth } from '../../middleware/auth'
import { UnifiedAuthRequest } from '../../types/auth'
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events'
import { ROOMS } from '../../socketio/rooms'

export async function leaveRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>(
    '/conversations/:id/leave',
    {
      schema: {
        description: 'Leave a conversation — sets participant as inactive, keeps history readable',
        tags: ['conversations'],
        summary: 'Leave conversation',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preValidation: [requiredAuth],
    },
    async (request, reply) => {
      const { id } = request.params
      const authRequest = request as UnifiedAuthRequest
      const userId = authRequest.authContext.userId

      const participant = await prisma.participant.findFirst({
        where: { conversationId: id, userId, isActive: true },
      })

      if (!participant) {
        return sendNotFound(reply, 'Vous ne participez pas à cette conversation')
      }

      if (participant.role === 'CREATOR') {
        const otherActiveCount = await prisma.participant.count({
          where: { conversationId: id, isActive: true, userId: { not: userId } },
        })
        if (otherActiveCount > 0) {
          return sendBadRequest(
            reply,
            'Le créateur doit transférer l\'ownership ou supprimer la conversation avant de quitter'
          )
        }
      }

      const now = new Date()
      await prisma.participant.update({
        where: { id: participant.id },
        data: { isActive: false, leftAt: now },
      })

      const io = fastify.io
      const room = ROOMS.conversation(id)
      io.to(room).emit(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, {
        conversationId: id,
        userId,
        username: participant.displayName,
        leftAt: now.toISOString(),
      })

      const userSockets = await io.in(ROOMS.user(userId)).fetchSockets()
      for (const s of userSockets) {
        s.leave(room)
      }

      return sendSuccess(reply, { conversationId: id, leftAt: now.toISOString() })
    }
  )
}
```

- [ ] **Step 2: Register the route in the conversations index**

In `services/gateway/src/routes/conversations/index.ts`, find the existing route registrations and add:

```typescript
import { leaveRoutes } from './leave'
```

And in the registration function, add:

```typescript
fastify.register(leaveRoutes)
```

Follow the exact pattern used for other route files in that index (check current imports and registrations).

- [ ] **Step 3: Verify gateway compiles**

Run: `cd services/gateway && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/routes/conversations/leave.ts services/gateway/src/routes/conversations/index.ts
git commit -m "feat(gateway): add POST /conversations/:id/leave endpoint"
```

---

## Task 3: Ban/Unban Endpoints (Gateway)

**Files:**
- Create: `services/gateway/src/routes/conversations/ban.ts`
- Modify: `services/gateway/src/routes/conversations/index.ts`
- Modify: `services/gateway/src/socketio/handlers/ConversationHandler.ts`

- [ ] **Step 1: Create the ban/unban route file**

Create `services/gateway/src/routes/conversations/ban.ts`:

```typescript
import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { requiredAuth } from '../../middleware/auth'
import { UnifiedAuthRequest } from '../../types/auth'
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events'
import { ROOMS } from '../../socketio/rooms'

const ROLE_HIERARCHY: Record<string, number> = {
  CREATOR: 40,
  ADMIN: 30,
  MODERATOR: 20,
  MEMBER: 10,
}

function roleLevel(role: string): number {
  return ROLE_HIERARCHY[role.toUpperCase()] ?? 0
}

export async function banRoutes(fastify: FastifyInstance) {
  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/conversations/:id/participants/:userId/ban',
    {
      schema: {
        description: 'Ban a participant from a conversation',
        tags: ['conversations'],
        summary: 'Ban participant',
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
          },
        },
      },
      preValidation: [requiredAuth],
    },
    async (request, reply) => {
      const { id, userId: targetUserId } = request.params
      const authRequest = request as UnifiedAuthRequest
      const currentUserId = authRequest.authContext.userId

      const [currentParticipant, targetParticipant] = await Promise.all([
        prisma.participant.findFirst({
          where: { conversationId: id, userId: currentUserId, isActive: true },
        }),
        prisma.participant.findFirst({
          where: { conversationId: id, userId: targetUserId },
        }),
      ])

      if (!currentParticipant) {
        return sendForbidden(reply, 'Vous ne participez pas à cette conversation')
      }
      if (!targetParticipant) {
        return sendNotFound(reply, 'Participant non trouvé')
      }
      if (roleLevel(currentParticipant.role) <= roleLevel(targetParticipant.role)) {
        return sendForbidden(reply, 'Vous ne pouvez pas bannir un membre de rang égal ou supérieur')
      }

      const now = new Date()
      await prisma.participant.update({
        where: { id: targetParticipant.id },
        data: { bannedAt: now, isActive: false, leftAt: now },
      })

      const io = fastify.io
      const room = ROOMS.conversation(id)
      io.to(room).emit(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, {
        conversationId: id,
        userId: targetUserId,
        bannedBy: { id: currentUserId },
        bannedAt: now.toISOString(),
      })

      const targetSockets = await io.in(ROOMS.user(targetUserId)).fetchSockets()
      for (const s of targetSockets) {
        s.leave(room)
      }

      return sendSuccess(reply, { userId: targetUserId, bannedAt: now.toISOString() })
    }
  )

  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/conversations/:id/participants/:userId/unban',
    {
      schema: {
        description: 'Unban a participant from a conversation',
        tags: ['conversations'],
        summary: 'Unban participant',
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
          },
        },
      },
      preValidation: [requiredAuth],
    },
    async (request, reply) => {
      const { id, userId: targetUserId } = request.params
      const authRequest = request as UnifiedAuthRequest
      const currentUserId = authRequest.authContext.userId

      const currentParticipant = await prisma.participant.findFirst({
        where: { conversationId: id, userId: currentUserId, isActive: true },
      })

      if (!currentParticipant || roleLevel(currentParticipant.role) < ROLE_HIERARCHY.ADMIN) {
        return sendForbidden(reply, 'Seuls les admins et créateurs peuvent débannir')
      }

      const targetParticipant = await prisma.participant.findFirst({
        where: { conversationId: id, userId: targetUserId, bannedAt: { not: null } },
      })

      if (!targetParticipant) {
        return sendNotFound(reply, 'Aucun participant banni trouvé')
      }

      await prisma.participant.update({
        where: { id: targetParticipant.id },
        data: { bannedAt: null },
      })

      const io = fastify.io
      io.to(ROOMS.conversation(id)).emit(SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED, {
        conversationId: id,
        userId: targetUserId,
      })

      return sendSuccess(reply, { userId: targetUserId })
    }
  )
}
```

- [ ] **Step 2: Register ban routes in conversations index**

In `services/gateway/src/routes/conversations/index.ts`, add:

```typescript
import { banRoutes } from './ban'
```

And register:

```typescript
fastify.register(banRoutes)
```

- [ ] **Step 3: Add ban check to ConversationHandler join**

In `services/gateway/src/socketio/handlers/ConversationHandler.ts`, in the `handleConversationJoin` method, after the `normalizeConversationId` call (around line 47) and BEFORE `socket.join(room)` (line 49), add:

```typescript
    const userId = this.socketToUser.get(socket.id)
    if (userId) {
      const bannedParticipant = await this.prisma.participant.findFirst({
        where: { conversationId: normalizedId, userId, bannedAt: { not: null } },
        select: { id: true },
      })
      if (bannedParticipant) {
        socket.emit(SERVER_EVENTS.ERROR, { message: 'Vous êtes banni de cette conversation' })
        return
      }
    }
```

Note: The existing code gets `userId` from `this.socketToUser.get(socket.id)` AFTER socket.join. Move the userId lookup BEFORE the join and reuse it. Keep the existing code after socket.join that uses userId for emitting `CONVERSATION_JOINED` and stats.

- [ ] **Step 4: Verify gateway compiles**

Run: `cd services/gateway && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/conversations/ban.ts services/gateway/src/routes/conversations/index.ts services/gateway/src/socketio/handlers/ConversationHandler.ts
git commit -m "feat(gateway): add ban/unban endpoints + ban check on socket join"
```

---

## Task 4: Enrich PUT /conversations/:id (Gateway)

**Files:**
- Modify: `services/gateway/src/routes/conversations/core.ts`

- [ ] **Step 1: Extend the PUT handler body destructuring**

In `services/gateway/src/routes/conversations/core.ts`, find the PUT `/conversations/:id` handler (around line 917). Locate the body destructuring line:

```typescript
const { title, description, avatar, banner } = request.body as { /* ... */ };
```

Replace with:

```typescript
const { title, description, avatar, banner, defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled } = request.body as {
  title?: string
  description?: string
  avatar?: string | null
  banner?: string | null
  defaultWriteRole?: string
  isAnnouncementChannel?: boolean
  slowModeSeconds?: number
  autoTranslateEnabled?: boolean
}
```

- [ ] **Step 2: Extend the Prisma update data object**

Find the `prisma.conversation.update` call and extend the `data` object:

```typescript
data: {
  title,
  description,
  ...(avatar !== undefined && { avatar }),
  ...(banner !== undefined && { banner }),
  ...(defaultWriteRole !== undefined && { defaultWriteRole }),
  ...(isAnnouncementChannel !== undefined && { isAnnouncementChannel }),
  ...(slowModeSeconds !== undefined && { slowModeSeconds }),
  ...(autoTranslateEnabled !== undefined && { autoTranslateEnabled }),
},
```

- [ ] **Step 3: Emit socket event after successful update**

After the `prisma.conversation.update` call and BEFORE `return sendSuccess(reply, updatedConversation)`, add:

```typescript
const io = fastify.io
const room = ROOMS.conversation(id)
const changedFields: Record<string, unknown> = {}
if (title !== undefined) changedFields.title = title
if (description !== undefined) changedFields.description = description
if (avatar !== undefined) changedFields.avatar = avatar
if (banner !== undefined) changedFields.banner = banner
if (defaultWriteRole !== undefined) changedFields.defaultWriteRole = defaultWriteRole
if (isAnnouncementChannel !== undefined) changedFields.isAnnouncementChannel = isAnnouncementChannel
if (slowModeSeconds !== undefined) changedFields.slowModeSeconds = slowModeSeconds
if (autoTranslateEnabled !== undefined) changedFields.autoTranslateEnabled = autoTranslateEnabled

io.to(room).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
  conversationId: id,
  ...changedFields,
  updatedBy: { id: userId },
  updatedAt: new Date().toISOString(),
})
```

Make sure `ROOMS` and `SERVER_EVENTS` are imported at the top of the file. Check existing imports — `SERVER_EVENTS` may already be imported. Add `ROOMS` import if missing:

```typescript
import { ROOMS } from '../../socketio/rooms'
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events'
```

- [ ] **Step 4: Verify gateway compiles**

Run: `cd services/gateway && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/conversations/core.ts
git commit -m "feat(gateway): enrich PUT /conversations/:id with permissions fields + socket emission"
```

---

## Task 5: SDK — ConversationService New Methods

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift`

- [ ] **Step 1: Add leave(), banParticipant(), unbanParticipant() to the protocol**

In `ConversationService.swift`, find the `ConversationServiceProviding` protocol (around line 5-18). Add these method signatures:

```swift
func leave(conversationId: String) async throws
func banParticipant(conversationId: String, userId: String) async throws
func unbanParticipant(conversationId: String, userId: String) async throws
```

- [ ] **Step 2: Add the implementations to ConversationService**

In the `ConversationService` class, add after the existing `deleteForMe` method:

```swift
public func leave(conversationId: String) async throws {
    let _: APIResponse<LeaveConversationResponse> = try await api.post(
        endpoint: "/conversations/\(conversationId)/leave"
    )
}

public func banParticipant(conversationId: String, userId: String) async throws {
    let _: APIResponse<BanParticipantResponse> = try await api.patch(
        endpoint: "/conversations/\(conversationId)/participants/\(userId)/ban"
    )
}

public func unbanParticipant(conversationId: String, userId: String) async throws {
    let _: APIResponse<UnbanParticipantResponse> = try await api.patch(
        endpoint: "/conversations/\(conversationId)/participants/\(userId)/unban"
    )
}
```

- [ ] **Step 3: Add response types**

At the bottom of the file (or in the models section — follow existing convention), add:

```swift
struct LeaveConversationResponse: Decodable {
    let conversationId: String
    let leftAt: String
}

struct BanParticipantResponse: Decodable {
    let userId: String
    let bannedAt: String
}

struct UnbanParticipantResponse: Decodable {
    let userId: String
}
```

- [ ] **Step 4: Enrich update() with new parameters**

Find the existing `update` method signature:

```swift
public func update(conversationId: String, title: String?, description: String?, avatar: String?, banner: String?) async throws -> APIConversation
```

Replace with:

```swift
public func update(
    conversationId: String,
    title: String? = nil,
    description: String? = nil,
    avatar: String? = nil,
    banner: String? = nil,
    defaultWriteRole: String? = nil,
    isAnnouncementChannel: Bool? = nil,
    slowModeSeconds: Int? = nil,
    autoTranslateEnabled: Bool? = nil
) async throws -> APIConversation
```

Update the body construction inside the method to include the new fields. Follow the existing pattern — the method likely builds a dictionary and sends it via `api.put`. Add the new keys:

```swift
if let defaultWriteRole { body["defaultWriteRole"] = defaultWriteRole }
if let isAnnouncementChannel { body["isAnnouncementChannel"] = isAnnouncementChannel }
if let slowModeSeconds { body["slowModeSeconds"] = slowModeSeconds }
if let autoTranslateEnabled { body["autoTranslateEnabled"] = autoTranslateEnabled }
```

Also update the protocol signature to match.

- [ ] **Step 5: Build SDK to verify**

Run: `cd packages/MeeshySDK && swift build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift
git commit -m "feat(sdk): add leave, ban, unban methods + enrich update with permissions"
```

---

## Task 6: SDK — Enrich Models

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift`

- [ ] **Step 1: Add missing fields to MeeshyConversation**

In `CoreModels.swift`, find the `MeeshyConversation` struct (line ~92). It already has `isAnnouncementChannel: Bool`. Add the missing fields near it:

```swift
public var defaultWriteRole: String? = nil
public var slowModeSeconds: Int? = nil
public var autoTranslateEnabled: Bool? = nil
public var mentionsOnlyNotification: Bool = false
```

If `CodingKeys` exist, add entries for these fields. If the struct uses automatic synthesis, no CodingKeys change needed.

- [ ] **Step 2: Add customName to APIConversationPreferences**

In `ConversationModels.swift`, find `APIConversationPreferences` (line ~74). Add:

```swift
public let customName: String?
```

- [ ] **Step 3: Add customName + mentionsOnly to UpdateConversationPreferencesRequest**

In `ServiceModels.swift`, find `UpdateConversationPreferencesRequest` (line ~131). Add the field:

```swift
public var customName: String?
public var mentionsOnly: Bool?
```

And update the `init` to include them:

```swift
public init(isPinned: Bool? = nil, isMuted: Bool? = nil, isArchived: Bool? = nil, categoryId: String? = nil, tags: [String]? = nil, reaction: String? = nil, customName: String? = nil, mentionsOnly: Bool? = nil) {
    self.isPinned = isPinned; self.isMuted = isMuted; self.isArchived = isArchived
    self.categoryId = categoryId; self.tags = tags; self.reaction = reaction
    self.customName = customName; self.mentionsOnly = mentionsOnly
}
```

- [ ] **Step 4: Build SDK to verify**

Run: `cd packages/MeeshySDK && swift build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift
git commit -m "feat(sdk): enrich conversation models with admin fields + customName"
```

---

## Task 7: SDK — Socket Listeners for New Events

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`

- [ ] **Step 1: Add new event structs**

At the top of `MessageSocketManager.swift` (or in a nearby models file — follow convention), add:

```swift
public struct ConversationUpdatedEvent: Decodable, Sendable {
    public let conversationId: String
    public let title: String?
    public let description: String?
    public let avatar: String?
    public let banner: String?
    public let defaultWriteRole: String?
    public let isAnnouncementChannel: Bool?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?
    public let updatedBy: SocketEventUser
    public let updatedAt: String
}

public struct ParticipantLeftEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
    public let username: String
    public let leftAt: String
}

public struct ParticipantBannedEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
    public let bannedBy: SocketEventUser
    public let bannedAt: String
}

public struct ParticipantUnbannedEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
}
```

Note: Use `SocketEventUser` if that type already exists for `updatedBy`/`bannedBy` fields. If the existing code uses a different name (e.g., `EventUser`), match it. Check how `ParticipantRoleUpdatedEvent` references its user field.

- [ ] **Step 2: Add PassthroughSubject publishers**

Find where the existing conversation publishers are declared (near `conversationJoined`, `conversationLeft`, `participantRoleUpdated`). Add:

```swift
public let conversationUpdated = PassthroughSubject<ConversationUpdatedEvent, Never>()
public let participantSelfLeft = PassthroughSubject<ParticipantLeftEvent, Never>()
public let participantBanned = PassthroughSubject<ParticipantBannedEvent, Never>()
public let participantUnbanned = PassthroughSubject<ParticipantUnbannedEvent, Never>()
```

- [ ] **Step 3: Add socket.on listeners**

Find the section with existing conversation event listeners (around line 1027-1055). Add after them, following the exact same pattern:

```swift
socket.on("conversation:updated") { [weak self] data, _ in
    guard let self else { return }
    self.decode(ConversationUpdatedEvent.self, from: data) { [weak self] event in
        self?.conversationUpdated.send(event)
    }
}

socket.on("conversation:participant-left") { [weak self] data, _ in
    guard let self else { return }
    self.decode(ParticipantLeftEvent.self, from: data) { [weak self] event in
        self?.participantSelfLeft.send(event)
    }
}

socket.on("conversation:participant-banned") { [weak self] data, _ in
    guard let self else { return }
    self.decode(ParticipantBannedEvent.self, from: data) { [weak self] event in
        self?.participantBanned.send(event)
    }
}

socket.on("conversation:participant-unbanned") { [weak self] data, _ in
    guard let self else { return }
    self.decode(ParticipantUnbannedEvent.self, from: data) { [weak self] event in
        self?.participantUnbanned.send(event)
    }
}
```

- [ ] **Step 4: Update MessageSocketProviding protocol if it exists**

If `MessageSocketProviding` protocol exists and lists all publishers, add the 4 new publishers to it. Check the protocol definition and match the pattern.

- [ ] **Step 5: Build SDK to verify**

Run: `cd packages/MeeshySDK && swift build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift
git commit -m "feat(sdk): add socket listeners for conversation:updated, participant left/banned/unbanned"
```

---

## Task 8: iOS — ConversationPreferencesTab

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`

- [ ] **Step 1: Create ConversationPreferencesTab**

Create `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift`:

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

struct ConversationPreferencesTab: View {
    let conversation: MeeshyConversation
    @Environment(\.themeManager) private var theme
    @State private var customName: String = ""
    @State private var reaction: String = ""
    @State private var isPinned: Bool = false
    @State private var isMuted: Bool = false
    @State private var mentionsOnly: Bool = false
    @State private var selectedCategoryId: String? = nil
    @State private var tags: [String] = []
    @State private var isLoading = false
    @State private var showLeaveConfirmation = false
    @State private var showDeleteConfirmation = false
    @State private var debounceTask: Task<Void, Never>?

    private let preferenceService = PreferenceService.shared
    private let conversationService = ConversationService.shared

    var body: some View {
        VStack(spacing: 16) {
            displaySection
            organizationSection
            notificationSection
            actionsSection
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .task { await loadPreferences() }
    }

    // MARK: - Mon affichage (#A855F7)

    private var displaySection: some View {
        settingsSection(title: "Mon affichage", icon: "paintbrush.pointed.fill", color: "A855F7") {
            VStack(spacing: 0) {
                settingsRow(icon: "character.cursor.ibeam", iconColor: "A855F7", title: "Nom personnalisé") {
                    TextField("Nom personnalisé", text: $customName)
                        .multilineTextAlignment(.trailing)
                        .foregroundColor(theme.textSecondary)
                        .onChange(of: customName) { _ in debounceSave() }
                }

                Divider().padding(.leading, 52)

                settingsRow(icon: "face.smiling", iconColor: "A855F7", title: "Réaction") {
                    Text(reaction.isEmpty ? "Aucune" : reaction)
                        .foregroundColor(theme.textSecondary)
                }
            }
        }
    }

    // MARK: - Organisation (#3B82F6)

    private var organizationSection: some View {
        settingsSection(title: "Organisation", icon: "folder.fill", color: "3B82F6") {
            VStack(spacing: 0) {
                settingsRow(icon: "pin.fill", iconColor: "3B82F6", title: "Épingler") {
                    Toggle("", isOn: $isPinned)
                        .labelsHidden()
                        .onChange(of: isPinned) { _ in saveImmediate() }
                }

                Divider().padding(.leading, 52)

                settingsRow(icon: "folder.badge.plus", iconColor: "3B82F6", title: "Catégorie") {
                    Text(selectedCategoryId ?? "Aucune")
                        .foregroundColor(theme.textSecondary)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }

                Divider().padding(.leading, 52)

                VStack(alignment: .leading, spacing: 8) {
                    settingsRow(icon: "tag.fill", iconColor: "3B82F6", title: "Tags") {
                        EmptyView()
                    }
                    TagInputView(
                        tags: $tags,
                        onTagsChanged: { saveImmediate() }
                    )
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)
                }
            }
        }
    }

    // MARK: - Notifications (#FF6B6B)

    private var notificationSection: some View {
        settingsSection(title: "Notifications", icon: "bell.fill", color: "FF6B6B") {
            VStack(spacing: 0) {
                settingsRow(icon: "bell.slash.fill", iconColor: "FF6B6B", title: "Muet") {
                    Toggle("", isOn: $isMuted)
                        .labelsHidden()
                        .onChange(of: isMuted) { _ in saveImmediate() }
                }

                Divider().padding(.leading, 52)

                settingsRow(icon: "at", iconColor: "FF6B6B", title: "Mentions seulement") {
                    Toggle("", isOn: $mentionsOnly)
                        .labelsHidden()
                        .disabled(isMuted)
                        .onChange(of: mentionsOnly) { _ in saveImmediate() }
                }
                .opacity(isMuted ? 0.4 : 1.0)
            }
        }
    }

    // MARK: - Actions (#6B7280)

    private var actionsSection: some View {
        settingsSection(title: "Actions", icon: "arrow.right.circle.fill", color: "6B7280") {
            VStack(spacing: 0) {
                actionButton(
                    icon: "archivebox.fill",
                    title: conversation.isArchived ? "Désarchiver" : "Archiver",
                    subtitle: "Masquer temporairement de la liste",
                    color: "FBBF24"
                ) {
                    Task { await toggleArchive() }
                }

                if conversation.type != .direct {
                    Divider().padding(.leading, 52)

                    actionButton(
                        icon: "rectangle.portrait.and.arrow.right",
                        title: "Quitter",
                        subtitle: "Se retirer des participants. L'historique reste lisible.",
                        color: "F97316"
                    ) {
                        showLeaveConfirmation = true
                    }
                    .confirmationDialog("Quitter la conversation ?", isPresented: $showLeaveConfirmation, titleVisibility: .visible) {
                        Button("Quitter", role: .destructive) {
                            Task { await leaveConversation() }
                        }
                    } message: {
                        Text("Vous ne recevrez plus de messages. Votre historique restera lisible.")
                    }
                }

                Divider().padding(.leading, 52)

                actionButton(
                    icon: "trash.fill",
                    title: "Supprimer pour moi",
                    subtitle: "La conversation disparaîtra de votre liste.",
                    color: "F87171"
                ) {
                    showDeleteConfirmation = true
                }
                .confirmationDialog("Supprimer pour moi ?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                    Button("Supprimer", role: .destructive) {
                        Task { await deleteForMe() }
                    }
                } message: {
                    Text("La conversation disparaîtra de votre liste. Vous pourrez la restaurer.")
                }
            }
        }
    }

    // MARK: - Section Builder (matches SettingsView pattern)

    private func settingsSection<Content: View>(title: String, icon: String, color: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

            VStack(spacing: 0) {
                content()
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: color))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: color), lineWidth: 1)
                    )
            )
        }
    }

    private func settingsRow<Trailing: View>(icon: String, iconColor: String, title: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: iconColor))
                .frame(width: 28, height: 28)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: iconColor).opacity(0.12)))
            Text(title)
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
            Spacer()
            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func actionButton(icon: String, title: String, subtitle: String, color: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: color))
                    .frame(width: 28, height: 28)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: color).opacity(0.12)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15))
                        .foregroundColor(Color(hex: color))
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                }
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
    }

    // MARK: - Data Operations

    private func loadPreferences() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let prefs = try await preferenceService.getConversationPreferences(conversationId: conversation.id)
            customName = prefs.customName ?? ""
            reaction = prefs.reaction ?? ""
            isPinned = prefs.isPinned ?? false
            isMuted = prefs.isMuted ?? false
            tags = prefs.tags ?? []
            selectedCategoryId = prefs.categoryId
        } catch {
            print("[ConversationPreferencesTab] Failed to load preferences: \(error)")
        }
    }

    private func debounceSave() {
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            await savePreferences()
        }
    }

    private func saveImmediate() {
        Task { await savePreferences() }
    }

    private func savePreferences() async {
        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversation.id,
                request: .init(
                    isPinned: isPinned,
                    isMuted: isMuted,
                    tags: tags,
                    reaction: reaction.isEmpty ? nil : reaction,
                    customName: customName.isEmpty ? nil : customName,
                    mentionsOnly: mentionsOnly
                )
            )
        } catch {
            print("[ConversationPreferencesTab] Failed to save preferences: \(error)")
        }
    }

    private func toggleArchive() async {
        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversation.id,
                request: .init(isArchived: !conversation.isArchived)
            )
        } catch {
            print("[ConversationPreferencesTab] Failed to toggle archive: \(error)")
        }
    }

    private func leaveConversation() async {
        do {
            try await conversationService.leave(conversationId: conversation.id)
        } catch {
            print("[ConversationPreferencesTab] Failed to leave: \(error)")
        }
    }

    private func deleteForMe() async {
        do {
            try await conversationService.deleteForMe(conversationId: conversation.id)
        } catch {
            print("[ConversationPreferencesTab] Failed to delete for me: \(error)")
        }
    }
}
```

- [ ] **Step 2: Add the tab to ConversationInfoSheet**

In `ConversationInfoSheet.swift`, find the `InfoTab` enum (line ~41):

```swift
enum InfoTab: String, CaseIterable {
    case members = "Membres"
    case media = "Medias"
    case pinned = "Epingles"
}
```

Add the new case:

```swift
enum InfoTab: String, CaseIterable {
    case members = "Membres"
    case media = "Medias"
    case pinned = "Epingles"
    case preferences = "Préférences"
}
```

- [ ] **Step 3: Add the tab content in the switch**

Find the `tabContent` computed property (line ~319). Add the new case to the switch:

```swift
case .preferences:
    ConversationPreferencesTab(conversation: conversation)
```

- [ ] **Step 4: Add tab count label**

Find `tabCountLabel(for:)` (line ~796). Add:

```swift
case .preferences:
    return nil
```

- [ ] **Step 5: Add the file to the Xcode project**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeds (if the file is auto-discovered). If not, add it to the Xcode project manually.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift
git commit -m "feat(ios): add Préférences tab in ConversationInfoSheet with personal settings"
```

---

## Task 9: SDK — TagInputView Component

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputView.swift`

- [ ] **Step 1: Create TagInputView**

Create `packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputView.swift`:

```swift
import SwiftUI

public struct TagInputView: View {
    @Binding var tags: [String]
    var onTagsChanged: (() -> Void)?
    @State private var inputText: String = ""
    @State private var suggestions: [String] = []
    @Environment(\.themeManager) private var theme

    public init(tags: Binding<[String]>, onTagsChanged: (() -> Void)? = nil) {
        self._tags = tags
        self.onTagsChanged = onTagsChanged
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            FlowLayout(spacing: 6) {
                ForEach(tags, id: \.self) { tag in
                    tagChip(tag)
                }
                inputField
            }
        }
    }

    private func tagChip(_ tag: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(colorForTag(tag))
                .frame(width: 8, height: 8)
            Text(tag)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textPrimary)
            Button {
                removeTag(tag)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule().fill(colorForTag(tag).opacity(0.12))
                .overlay(Capsule().stroke(colorForTag(tag).opacity(0.3), lineWidth: 1))
        )
    }

    private var inputField: some View {
        TextField("Ajouter un tag...", text: $inputText)
            .font(.system(size: 13))
            .foregroundColor(theme.textPrimary)
            .frame(minWidth: 100)
            .onSubmit {
                addTag(inputText)
            }
    }

    private func addTag(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !tags.contains(trimmed) else { return }
        tags.append(trimmed)
        inputText = ""
        onTagsChanged?()
    }

    private func removeTag(_ tag: String) {
        tags.removeAll { $0 == tag }
        onTagsChanged?()
    }

    private func colorForTag(_ tag: String) -> Color {
        let hash = abs(tag.hashValue)
        let colors: [Color] = [
            Color(hex: "3B82F6"), Color(hex: "A855F7"), Color(hex: "F97316"),
            Color(hex: "4ECDC4"), Color(hex: "F8B500"), Color(hex: "FF6B6B"),
            Color(hex: "2ECC71"), Color(hex: "9B59B6"), Color(hex: "45B7D1"),
        ]
        return colors[hash % colors.count]
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), positions)
    }
}
```

- [ ] **Step 2: Build SDK to verify**

Run: `cd packages/MeeshySDK && swift build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputView.swift
git commit -m "feat(sdk): add TagInputView reusable component with FlowLayout"
```

---

## Task 10: iOS — ConversationAdminView + ViewModel

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/ConversationAdminView.swift`
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationAdminViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`

- [ ] **Step 1: Create ConversationAdminViewModel**

Create `apps/ios/Meeshy/Features/Main/ViewModels/ConversationAdminViewModel.swift`:

```swift
import SwiftUI
import MeeshySDK
import PhotosUI

@MainActor
final class ConversationAdminViewModel: ObservableObject {
    let conversationId: String
    private let conversationService: ConversationService
    private let participantService: ParticipantService

    // Identity
    @Published var title: String = ""
    @Published var description: String = ""
    @Published var avatarURL: String? = nil
    @Published var bannerURL: String? = nil
    @Published var selectedAvatarItem: PhotosPickerItem? = nil
    @Published var selectedBannerItem: PhotosPickerItem? = nil
    @Published var isUploadingAvatar = false
    @Published var isUploadingBanner = false

    // Permissions
    @Published var defaultWriteRole: String = "everyone"
    @Published var isAnnouncementChannel: Bool = false
    @Published var slowModeSeconds: Int = 0
    @Published var autoTranslateEnabled: Bool = true

    // Members
    @Published var participants: [APIParticipant] = []
    @Published var isLoadingMembers = false
    @Published var memberSearchText: String = ""
    @Published var totalMemberCount: Int = 0

    // State
    @Published var isSaving = false
    @Published var saveError: String? = nil
    @Published var showDeleteConversation = false

    private var originalTitle: String = ""
    private var originalDescription: String = ""
    private var originalDefaultWriteRole: String = "everyone"
    private var originalIsAnnouncement: Bool = false
    private var originalSlowMode: Int = 0
    private var originalAutoTranslate: Bool = true

    var hasChanges: Bool {
        title != originalTitle ||
        description != originalDescription ||
        defaultWriteRole != originalDefaultWriteRole ||
        isAnnouncementChannel != originalIsAnnouncement ||
        slowModeSeconds != originalSlowMode ||
        autoTranslateEnabled != originalAutoTranslate
    }

    init(
        conversationId: String,
        conversationService: ConversationService = .shared,
        participantService: ParticipantService = .shared
    ) {
        self.conversationId = conversationId
        self.conversationService = conversationService
        self.participantService = participantService
    }

    func load(from conversation: MeeshyConversation) {
        title = conversation.title ?? ""
        description = conversation.description ?? ""
        avatarURL = conversation.avatar
        bannerURL = conversation.banner
        defaultWriteRole = conversation.defaultWriteRole ?? "everyone"
        isAnnouncementChannel = conversation.isAnnouncementChannel
        slowModeSeconds = conversation.slowModeSeconds ?? 0
        autoTranslateEnabled = conversation.autoTranslateEnabled ?? true
        totalMemberCount = conversation.memberCount

        originalTitle = title
        originalDescription = description
        originalDefaultWriteRole = defaultWriteRole
        originalIsAnnouncement = isAnnouncementChannel
        originalSlowMode = slowModeSeconds
        originalAutoTranslate = autoTranslateEnabled
    }

    func save() async {
        isSaving = true
        saveError = nil
        defer { isSaving = false }

        do {
            _ = try await conversationService.update(
                conversationId: conversationId,
                title: title,
                description: description,
                defaultWriteRole: defaultWriteRole,
                isAnnouncementChannel: isAnnouncementChannel,
                slowModeSeconds: slowModeSeconds,
                autoTranslateEnabled: autoTranslateEnabled
            )
            originalTitle = title
            originalDescription = description
            originalDefaultWriteRole = defaultWriteRole
            originalIsAnnouncement = isAnnouncementChannel
            originalSlowMode = slowModeSeconds
            originalAutoTranslate = autoTranslateEnabled
        } catch {
            saveError = "Erreur lors de la sauvegarde: \(error.localizedDescription)"
        }
    }

    func loadMembers() async {
        isLoadingMembers = true
        defer { isLoadingMembers = false }
        do {
            let response = try await conversationService.getParticipants(
                conversationId: conversationId,
                limit: 50,
                cursor: nil
            )
            participants = response.data ?? []
        } catch {
            print("[ConversationAdminVM] Failed to load members: \(error)")
        }
    }

    func updateRole(participantId: String, newRole: String) async {
        do {
            try await conversationService.updateParticipantRole(
                conversationId: conversationId,
                participantId: participantId,
                role: newRole
            )
            await loadMembers()
        } catch {
            print("[ConversationAdminVM] Failed to update role: \(error)")
        }
    }

    func expelParticipant(participantId: String) async {
        do {
            try await conversationService.removeParticipant(
                conversationId: conversationId,
                participantId: participantId
            )
            participants.removeAll { $0.id == participantId }
            totalMemberCount -= 1
        } catch {
            print("[ConversationAdminVM] Failed to expel: \(error)")
        }
    }

    func banParticipant(userId: String) async {
        do {
            try await conversationService.banParticipant(
                conversationId: conversationId,
                userId: userId
            )
            await loadMembers()
        } catch {
            print("[ConversationAdminVM] Failed to ban: \(error)")
        }
    }

    func deleteConversation() async {
        do {
            try await conversationService.delete(conversationId: conversationId)
        } catch {
            print("[ConversationAdminVM] Failed to delete: \(error)")
        }
    }
}
```

- [ ] **Step 2: Create ConversationAdminView**

Create `apps/ios/Meeshy/Features/Main/Views/ConversationAdminView.swift`:

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI
import PhotosUI

struct ConversationAdminView: View {
    let conversation: MeeshyConversation
    let currentUserRole: MemberRole
    @StateObject private var viewModel: ConversationAdminViewModel
    @Environment(\.themeManager) private var theme
    @Environment(\.dismiss) private var dismiss

    init(conversation: MeeshyConversation, currentUserRole: MemberRole) {
        self.conversation = conversation
        self.currentUserRole = currentUserRole
        self._viewModel = StateObject(wrappedValue: ConversationAdminViewModel(conversationId: conversation.id))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                identitySection
                permissionsSection
                MemberManagementSection(
                    viewModel: viewModel,
                    currentUserRole: currentUserRole
                )
                dangerSection
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(theme.backgroundGradient)
        .navigationTitle("Administration")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Enregistrer") {
                    Task { await viewModel.save() }
                }
                .disabled(!viewModel.hasChanges || viewModel.isSaving)
                .fontWeight(.semibold)
            }
        }
        .task {
            viewModel.load(from: conversation)
            await viewModel.loadMembers()
        }
    }

    // MARK: - Identité (#4ECDC4)

    private var identitySection: some View {
        adminSection(title: "Identité", icon: "person.crop.rectangle.fill", color: "4ECDC4") {
            VStack(spacing: 12) {
                // Banner
                ZStack(alignment: .bottomTrailing) {
                    if let bannerURL = viewModel.bannerURL {
                        CachedBannerImage(url: bannerURL, height: 140)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(theme.surfaceGradient(tint: "4ECDC4"))
                            .frame(height: 140)
                    }
                    PhotosPicker(selection: $viewModel.selectedBannerItem, matching: .images) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                            .padding(8)
                            .background(Circle().fill(Color(hex: "4ECDC4")))
                    }
                    .padding(8)
                }

                // Avatar + Title/Description
                HStack(alignment: .top, spacing: 14) {
                    ZStack(alignment: .bottomTrailing) {
                        MeeshyAvatar(
                            name: viewModel.title,
                            avatarURL: viewModel.avatarURL,
                            size: .profile
                        )
                        PhotosPicker(selection: $viewModel.selectedAvatarItem, matching: .images) {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.white)
                                .padding(5)
                                .background(Circle().fill(Color(hex: "4ECDC4")))
                        }
                    }

                    VStack(spacing: 8) {
                        TextField("Titre", text: $viewModel.title)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(RoundedRectangle(cornerRadius: 10).fill(theme.inputBackground))

                        TextEditor(text: $viewModel.description)
                            .font(.system(size: 14))
                            .foregroundColor(theme.textPrimary)
                            .frame(minHeight: 60, maxHeight: 120)
                            .padding(8)
                            .background(RoundedRectangle(cornerRadius: 10).fill(theme.inputBackground))
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 10)
            }
        }
    }

    // MARK: - Permissions (#F8B500)

    private var permissionsSection: some View {
        adminSection(title: "Permissions", icon: "lock.shield.fill", color: "F8B500") {
            VStack(spacing: 0) {
                settingsRow(icon: "pencil.line", iconColor: "F8B500", title: "Qui peut écrire") {
                    Picker("", selection: $viewModel.defaultWriteRole) {
                        Text("Tout le monde").tag("everyone")
                        Text("Membres").tag("member")
                        Text("Modérateurs").tag("moderator")
                        Text("Admins").tag("admin")
                    }
                    .pickerStyle(.menu)
                    .disabled(viewModel.isAnnouncementChannel)
                }

                Divider().padding(.leading, 52)

                settingsRow(icon: "megaphone.fill", iconColor: "F8B500", title: "Mode annonce") {
                    Toggle("", isOn: $viewModel.isAnnouncementChannel)
                        .labelsHidden()
                }

                Divider().padding(.leading, 52)

                settingsRow(icon: "tortoise.fill", iconColor: "F8B500", title: "Mode lent") {
                    Picker("", selection: $viewModel.slowModeSeconds) {
                        Text("Off").tag(0)
                        Text("10s").tag(10)
                        Text("30s").tag(30)
                        Text("60s").tag(60)
                        Text("5min").tag(300)
                    }
                    .pickerStyle(.menu)
                }

                Divider().padding(.leading, 52)

                settingsRow(icon: "globe", iconColor: "F8B500", title: "Traduction auto") {
                    Toggle("", isOn: $viewModel.autoTranslateEnabled)
                        .labelsHidden()
                }
            }
        }
    }

    // MARK: - Zone dangereuse (#F87171)

    private var dangerSection: some View {
        Group {
            if currentUserRole == .creator {
                adminSection(title: "Zone dangereuse", icon: "exclamationmark.triangle.fill", color: "F87171") {
                    Button {
                        viewModel.showDeleteConversation = true
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "trash.fill")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(hex: "F87171"))
                                .frame(width: 28, height: 28)
                                .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: "F87171").opacity(0.12)))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Supprimer la conversation")
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundColor(Color(hex: "F87171"))
                                Text("Irréversible. Tous les messages seront supprimés pour tous.")
                                    .font(.system(size: 11))
                                    .foregroundColor(theme.textMuted)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                    }
                    .confirmationDialog("Supprimer définitivement ?", isPresented: $viewModel.showDeleteConversation, titleVisibility: .visible) {
                        Button("Supprimer pour tous", role: .destructive) {
                            Task {
                                await viewModel.deleteConversation()
                                dismiss()
                            }
                        }
                    } message: {
                        Text("Cette action est irréversible. Tous les messages seront supprimés pour tous les participants.")
                    }
                }
            }
        }
    }

    // MARK: - Section Builders (matching SettingsView pattern)

    private func adminSection<Content: View>(title: String, icon: String, color: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

            VStack(spacing: 0) {
                content()
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: color))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: color), lineWidth: 1)
                    )
            )
        }
    }

    private func settingsRow<Trailing: View>(icon: String, iconColor: String, title: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: iconColor))
                .frame(width: 28, height: 28)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: iconColor).opacity(0.12)))
            Text(title)
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
            Spacer()
            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
```

- [ ] **Step 3: Wire gear button in ConversationInfoSheet to NavigationLink**

In `ConversationInfoSheet.swift`, find the gear button that opens `ConversationSettingsView` (search for `ConversationSettingsView` or gear icon). Replace the sheet/navigation to `ConversationSettingsView` with a `NavigationLink` to `ConversationAdminView`:

```swift
NavigationLink {
    ConversationAdminView(
        conversation: conversation,
        currentUserRole: MemberRole(rawValue: conversation.currentUserRole?.lowercased() ?? "member") ?? .member
    )
} label: {
    Image(systemName: "gearshape.fill")
        .font(.system(size: 16, weight: .medium))
        .foregroundColor(theme.textSecondary)
}
```

Ensure the ConversationInfoSheet is wrapped in a `NavigationStack` if not already (check the sheet presentation in the parent view).

- [ ] **Step 4: Build iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationAdminView.swift apps/ios/Meeshy/Features/Main/ViewModels/ConversationAdminViewModel.swift apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift
git commit -m "feat(ios): add ConversationAdminView with identity + permissions + danger zone sections"
```

---

## Task 11: iOS — MemberManagementSection

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift`

- [ ] **Step 1: Create MemberManagementSection**

Create `apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift`:

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

struct MemberManagementSection: View {
    @ObservedObject var viewModel: ConversationAdminViewModel
    let currentUserRole: MemberRole
    @Environment(\.themeManager) private var theme
    @State private var showAddMember = false

    private let sectionColor = "9B59B6"

    var filteredParticipants: [APIParticipant] {
        if viewModel.memberSearchText.isEmpty {
            return viewModel.participants
        }
        let query = viewModel.memberSearchText.lowercased()
        return viewModel.participants.filter {
            $0.displayName.lowercased().contains(query) ||
            ($0.userId?.lowercased().contains(query) ?? false)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "person.3.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: sectionColor))
                Text("MEMBRES (\(viewModel.totalMemberCount))".uppercased())
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: sectionColor))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

            VStack(spacing: 0) {
                // Search bar
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(theme.textMuted)
                        .font(.system(size: 14))
                    TextField("Rechercher un membre", text: $viewModel.memberSearchText)
                        .font(.system(size: 14))
                        .foregroundColor(theme.textPrimary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(theme.inputBackground)

                Divider()

                // Member list
                if viewModel.isLoadingMembers {
                    ProgressView()
                        .padding(.vertical, 20)
                } else {
                    ForEach(filteredParticipants, id: \.id) { participant in
                        memberRow(participant)
                        if participant.id != filteredParticipants.last?.id {
                            Divider().padding(.leading, 62)
                        }
                    }
                }

                Divider()

                // Add member button
                if currentUserRole.hasMinimumRole(.moderator) {
                    Button {
                        showAddMember = true
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "person.badge.plus")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(hex: sectionColor))
                                .frame(width: 28, height: 28)
                                .background(RoundedRectangle(cornerRadius: 8).fill(Color(hex: sectionColor).opacity(0.12)))
                            Text("Ajouter un membre")
                                .font(.system(size: 15))
                                .foregroundColor(Color(hex: sectionColor))
                            Spacer()
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: sectionColor))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: sectionColor), lineWidth: 1)
                    )
            )
        }
    }

    private func memberRow(_ participant: APIParticipant) -> some View {
        let targetRole = MemberRole(rawValue: participant.role.lowercased()) ?? .member
        let canAct = currentUserRole.level > targetRole.level

        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: participant.displayName,
                avatarURL: participant.avatar,
                size: .conversationList
            )

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(participant.displayName)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                    roleBadge(targetRole)
                }
                if let joinedAt = participant.joinedAt {
                    Text("Rejoint \(joinedAt, format: .relative(presentation: .named))")
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                }
            }

            Spacer()

            if canAct {
                Menu {
                    roleActions(for: participant, targetRole: targetRole)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 32, height: 32)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private func roleBadge(_ role: MemberRole) -> some View {
        switch role {
        case .creator:
            Label("Créateur", systemImage: "crown.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(Color(hex: "F8B500"))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(Color(hex: "F8B500").opacity(0.15)))
        case .admin:
            Label("Admin", systemImage: "shield.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(Color(hex: "3B82F6"))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(Color(hex: "3B82F6").opacity(0.15)))
        case .moderator:
            Label("Modérateur", systemImage: "checkmark.shield.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(Color(hex: "4ECDC4"))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(Color(hex: "4ECDC4").opacity(0.15)))
        case .member:
            EmptyView()
        }
    }

    @ViewBuilder
    private func roleActions(for participant: APIParticipant, targetRole: MemberRole) -> some View {
        // Promote to Admin (Creator only)
        if currentUserRole == .creator && targetRole.level < MemberRole.admin.level {
            Button {
                Task { await viewModel.updateRole(participantId: participant.id, newRole: "ADMIN") }
            } label: {
                Label("Promouvoir Admin", systemImage: "shield.fill")
            }
        }

        // Promote to Moderator (Admin+)
        if currentUserRole.hasMinimumRole(.admin) && targetRole == .member {
            Button {
                Task { await viewModel.updateRole(participantId: participant.id, newRole: "MODERATOR") }
            } label: {
                Label("Promouvoir Modérateur", systemImage: "checkmark.shield.fill")
            }
        }

        // Demote to Member
        if currentUserRole.level > targetRole.level && targetRole.level > MemberRole.member.level {
            Button {
                Task { await viewModel.updateRole(participantId: participant.id, newRole: "MEMBER") }
            } label: {
                Label("Rétrograder Membre", systemImage: "person.fill")
            }
            .tint(Color(hex: "F97316"))
        }

        Divider()

        // Expel
        Button(role: .destructive) {
            Task { await viewModel.expelParticipant(participantId: participant.id) }
        } label: {
            Label("Expulser", systemImage: "person.fill.xmark")
        }

        // Ban
        if let userId = participant.userId {
            Button(role: .destructive) {
                Task { await viewModel.banParticipant(userId: userId) }
            } label: {
                Label("Bannir", systemImage: "hand.raised.fill")
            }
        }
    }
}
```

- [ ] **Step 2: Build iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift
git commit -m "feat(ios): add MemberManagementSection with role hierarchy + ban/expel actions"
```

---

## Task 12: iOS — Real-Time Socket Subscriptions

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`

- [ ] **Step 1: Subscribe to conversationUpdated**

In `ConversationListViewModel.swift`, find the section where socket subscriptions are set up (search for `conversationJoined` or `MessageSocketManager`). Add subscriptions for the new events:

```swift
MessageSocketManager.shared.conversationUpdated
    .receive(on: DispatchQueue.main)
    .sink { [weak self] event in
        guard let self, let index = self.convIndex(for: event.conversationId) else { return }
        if let title = event.title { self.conversations[index].title = title }
        if let description = event.description { self.conversations[index].description = description }
        if let avatar = event.avatar { self.conversations[index].avatar = avatar }
        if let banner = event.banner { self.conversations[index].banner = banner }
        if let isAnnouncement = event.isAnnouncementChannel {
            self.conversations[index].isAnnouncementChannel = isAnnouncement
        }
    }
    .store(in: &cancellables)

MessageSocketManager.shared.participantSelfLeft
    .receive(on: DispatchQueue.main)
    .sink { [weak self] event in
        guard let self, let index = self.convIndex(for: event.conversationId) else { return }
        self.conversations[index].memberCount -= 1
    }
    .store(in: &cancellables)

MessageSocketManager.shared.participantBanned
    .receive(on: DispatchQueue.main)
    .sink { [weak self] event in
        guard let self, let index = self.convIndex(for: event.conversationId) else { return }
        self.conversations[index].memberCount -= 1
    }
    .store(in: &cancellables)
```

- [ ] **Step 2: Build iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
git commit -m "feat(ios): subscribe to conversation:updated + participant left/banned socket events"
```

---

## Task 13: iOS — Fix Swipe Action Labels

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

- [ ] **Step 1: Fix the "Supprimer" swipe action label**

In `ConversationListView.swift`, find the delete swipe action (line ~406):

```swift
actions.append(SwipeAction(
    icon: "trash.fill",
    label: String(localized: "swipe.delete", defaultValue: "Supprimer"),
    color: Color(hex: "EF4444")
) {
    Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
})
```

Replace with clearer semantics:

```swift
actions.append(SwipeAction(
    icon: "eye.slash.fill",
    label: String(localized: "swipe.hide", defaultValue: "Masquer"),
    color: Color(hex: "EF4444")
) {
    Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
})
```

- [ ] **Step 2: Build iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "fix(ios): rename 'Supprimer' swipe action to 'Masquer' for clarity"
```

---

## Task 14: Gateway — Mentions-Only Notification Filtering

**Files:**
- Modify: `services/gateway/src/routes/conversation-preferences.ts` (or wherever preferences are handled)
- Modify: `packages/shared/prisma/schema.prisma`

- [ ] **Step 1: Add mentionsOnly field to Prisma schema**

In `packages/shared/prisma/schema.prisma`, find the `UserConversationPreferences` model and add:

```prisma
mentionsOnly      Boolean     @default(false)
```

- [ ] **Step 2: Generate Prisma client**

Run: `cd packages/shared && pnpm exec prisma generate`
Expected: Prisma client generated successfully

- [ ] **Step 3: Add mentionsOnly to the preferences update handler**

In the conversation preferences PUT/PATCH handler in the gateway, add `mentionsOnly` to the accepted body fields and the Prisma update data. Follow the exact pattern used for `isMuted`, `isPinned`, etc.

- [ ] **Step 4: Filter push notifications for mentionsOnly**

In the gateway's push notification sending logic (search for where notifications are emitted for new messages), add a check:

```typescript
const userPrefs = await prisma.userConversationPreferences.findUnique({
  where: { userId_conversationId: { userId, conversationId } },
  select: { isMuted: true, mentionsOnly: true },
})

if (userPrefs?.isMuted) return // Already handled
if (userPrefs?.mentionsOnly) {
  const isMentioned = messageContent.includes(`@${username}`) || messageContent.includes(`@everyone`)
  if (!isMentioned) return // Skip notification
}
```

Find the exact location where push notifications are dispatched and add this guard. This may be in `MeeshySocketIOManager.ts` or a dedicated notification service.

- [ ] **Step 5: Verify gateway compiles**

Run: `cd services/gateway && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/shared/prisma/schema.prisma services/gateway/
git commit -m "feat(gateway): add mentionsOnly preference + push notification filtering"
```

---

## Task 15: SDK — CategoryPickerView Component

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerView.swift`

- [ ] **Step 1: Create CategoryPickerView**

Create `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerView.swift`:

```swift
import SwiftUI
import MeeshySDK

public struct CategoryPickerView: View {
    @Binding var selectedCategoryId: String?
    @State private var categories: [ConversationCategory] = []
    @State private var isCreating = false
    @State private var newCategoryName = ""
    @State private var isLoading = false
    @Environment(\.themeManager) private var theme

    private let preferenceService = PreferenceService.shared

    public init(selectedCategoryId: Binding<String?>) {
        self._selectedCategoryId = selectedCategoryId
    }

    public var body: some View {
        VStack(spacing: 0) {
            if isLoading {
                ProgressView()
                    .padding(.vertical, 12)
            } else {
                ForEach(categories, id: \.id) { category in
                    Button {
                        if selectedCategoryId == category.id {
                            selectedCategoryId = nil
                        } else {
                            selectedCategoryId = category.id
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "folder.fill")
                                .font(.system(size: 14))
                                .foregroundColor(Color(hex: "3B82F6"))
                            Text(category.name)
                                .font(.system(size: 15))
                                .foregroundColor(theme.textPrimary)
                            Spacer()
                            if selectedCategoryId == category.id {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(Color(hex: "3B82F6"))
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                    }
                    Divider().padding(.leading, 52)
                }

                if isCreating {
                    HStack(spacing: 12) {
                        Image(systemName: "folder.badge.plus")
                            .font(.system(size: 14))
                            .foregroundColor(Color(hex: "3B82F6"))
                        TextField("Nom de la catégorie", text: $newCategoryName)
                            .font(.system(size: 15))
                            .foregroundColor(theme.textPrimary)
                            .onSubmit { Task { await createCategory() } }
                        Button {
                            Task { await createCategory() }
                        } label: {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(Color(hex: "3B82F6"))
                        }
                        .disabled(newCategoryName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                } else {
                    Button {
                        isCreating = true
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(Color(hex: "3B82F6"))
                            Text("Nouvelle catégorie")
                                .font(.system(size: 15))
                                .foregroundColor(Color(hex: "3B82F6"))
                            Spacer()
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                    }
                }
            }
        }
        .task { await loadCategories() }
    }

    private func loadCategories() async {
        isLoading = true
        defer { isLoading = false }
        do {
            categories = try await preferenceService.getCategories()
        } catch {
            print("[CategoryPickerView] Failed to load categories: \(error)")
        }
    }

    private func createCategory() async {
        let name = newCategoryName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        newCategoryName = ""
        isCreating = false
        await loadCategories()
    }
}
```

- [ ] **Step 2: Build SDK to verify**

Run: `cd packages/MeeshySDK && swift build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerView.swift
git commit -m "feat(sdk): add CategoryPickerView reusable component"
```

---

## Task 16: Final Integration Verification

- [ ] **Step 1: Verify gateway compiles**

Run: `cd services/gateway && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Verify SDK builds**

Run: `cd packages/MeeshySDK && swift build`
Expected: Build succeeds

- [ ] **Step 3: Verify iOS app builds**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeds

- [ ] **Step 4: Run gateway tests if they exist**

Run: `cd services/gateway && pnpm test`
Expected: All tests pass

- [ ] **Step 5: Commit any final adjustments**

If any compilation fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: integration adjustments for conversation management feature"
```
