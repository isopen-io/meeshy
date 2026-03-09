# Unified Participant Model — Design Document

**Date**: 2026-03-08
**Status**: Approved
**Scope**: Full migration — Prisma schema, gateway pipeline, Socket.IO, iOS SDK

## Problem

The current architecture uses a dual-FK pattern throughout:
- `Message.senderId` (User) OR `Message.anonymousSenderId` (AnonymousParticipant)
- `MessageStatusEntry.userId` OR `.anonymousId`
- `ConversationReadCursor.userId` OR `.anonymousId`
- Two membership models: `ConversationMember` (registered) and `AnonymousParticipant` (anonymous)

This causes: duplicated logic in every handler, no DB-level invariant (both FKs can be null/non-null), impossible to extend to bots/agents without adding a 3rd FK, fragmented analytics, and degraded Prisme Linguistique for anonymous users.

## Decision

**Approach A — Participant as unified pivot table.** One `Participant` collection replaces both `ConversationMember` and `AnonymousParticipant`. Every FK in Message, MessageStatusEntry, ConversationReadCursor, and Reaction points to `Participant.id`.

Migration is one-shot (platform in early development, ~dozens of users).

## Data Model

### Participant (NEW — replaces ConversationMember + AnonymousParticipant)

```prisma
model Participant {
  id               String    @id @default(auto()) @map("_id") @db.ObjectId
  conversationId   String    @db.ObjectId
  type             String    // "user" | "anonymous" | "bot"

  // Registered user identity (null if anonymous/bot)
  userId           String?   @db.ObjectId

  // Denormalized display (avoids User join on every message)
  displayName      String
  avatar           String?

  // Role & effective permissions
  role             String    @default("member")  // "member" | "moderator" | "admin"
  permissions      ParticipantPermissions

  // Language for this participant in this conversation
  language         String    @default("en")

  // State
  isActive         Boolean   @default(true)
  isOnline         Boolean   @default(false)
  lastActiveAt     DateTime  @default(now())
  joinedAt         DateTime  @default(now())
  leftAt           DateTime?
  bannedAt         DateTime?

  // Conversation-specific override
  nickname         String?

  // Anonymous sub-document (null if type != "anonymous")
  anonymousSession AnonymousSession?

  // Relations
  conversation     Conversation @relation(fields: [conversationId], references: [id])
  user             User?        @relation(fields: [userId], references: [id])

  sentMessages             Message[]              @relation("MessageSender")
  reactions                Reaction[]
  statusEntries            MessageStatusEntry[]
  readCursors              ConversationReadCursor[]
  mentions                 Mention[]
  callParticipations       CallParticipant[]
  attachmentStatusEntries  AttachmentStatusEntry[]

  @@unique([conversationId, userId], name: "unique_conversation_user")
  @@index([conversationId])
  @@index([userId])
  @@index([userId, isActive])
  @@index([type])
}
```

### Composite Types (embedded documents)

```prisma
type ParticipantPermissions {
  canSendMessages   Boolean @default(true)
  canSendFiles      Boolean @default(false)
  canSendImages     Boolean @default(true)
  canSendVideos     Boolean @default(false)
  canSendAudios     Boolean @default(false)
  canSendLocations  Boolean @default(false)
  canSendLinks      Boolean @default(false)
}

type AnonymousSession {
  shareLinkId       String
  session           AnonymousSessionDetails
  profile           AnonymousProfile
  rights            AnonymousRightsOverride?  // null = no admin override
}

type AnonymousSessionDetails {
  sessionTokenHash  String    // SHA-256, indexed
  ipAddress         String?
  country           String?
  deviceFingerprint String?
  connectedAt       DateTime
}

type AnonymousProfile {
  firstName         String
  lastName          String
  username          String
  email             String?
  birthday          DateTime?
}

type AnonymousRightsOverride {
  canSendMessages   Boolean?
  canSendFiles      Boolean?
  canSendImages     Boolean?
  canSendVideos     Boolean?
  canSendAudios     Boolean?
  canSendLocations  Boolean?
  canSendLinks      Boolean?
}
```

### Message (modified)

```prisma
model Message {
  // BEFORE: senderId? + anonymousSenderId? (dual FK)
  // AFTER:
  senderId         String    @db.ObjectId  // -> Participant.id (REQUIRED, not nullable)

  sender           Participant @relation("MessageSender", fields: [senderId], references: [id])

  // messageSource stays for system/ads/agent distinction
  messageSource    String    @default("user")

  @@index([senderId])
  // REMOVED: index on anonymousSenderId
}
```

### MessageStatusEntry (modified)

```prisma
model MessageStatusEntry {
  // BEFORE: userId? + anonymousId? (dual FK)
  // AFTER:
  participantId    String    @db.ObjectId

  participant      Participant @relation(fields: [participantId], references: [id])

  @@unique([messageId, participantId], name: "message_participant_status")
  // REMOVED: message_user_status + message_anonymous_status
}
```

### ConversationReadCursor (modified)

```prisma
model ConversationReadCursor {
  // BEFORE: userId? + anonymousId? (dual FK)
  // AFTER:
  participantId    String    @db.ObjectId

  participant      Participant @relation(fields: [participantId], references: [id])

  @@unique([conversationId, participantId], name: "conversation_participant_cursor")
}
```

### Reaction (modified)

```prisma
model Reaction {
  // BEFORE: userId (User only)
  // AFTER:
  participantId    String    @db.ObjectId

  participant      Participant @relation(fields: [participantId], references: [id])
}
```

### Collections removed

- `ConversationMember` -> absorbed by Participant (type: "user")
- `AnonymousParticipant` -> absorbed by Participant (type: "anonymous") + anonymousSession

### Collections unchanged

- `User` — identity model, no structural change
- `Conversation` — replaces `members` + `anonymousParticipants` relations with `participants`
- `ConversationShareLink` — stays, referenced by `anonymousSession.shareLinkId`

## Auth Pipeline

### UnifiedAuthContext v2

```typescript
type ParticipantType = 'user' | 'anonymous' | 'bot'

type UnifiedAuthContext = {
  readonly type: ParticipantType
  readonly isAuthenticated: boolean
  readonly isAnonymous: boolean

  // Identity
  readonly userId?: string
  readonly jwtToken?: string
  readonly sessionToken?: string

  // Participation (resolved per conversation)
  readonly participantId?: string
  readonly participant?: Participant

  // Denormalized shortcuts
  readonly displayName: string
  readonly userLanguage: string
  readonly permissions: ParticipantPermissions
  readonly hasFullAccess: boolean
}
```

### Two-phase resolution

**Phase 1 — Identity (global middleware):**
- JWT -> verify + fetch User
- Session token -> SHA-256 hash -> lookup Participant by `anonymousSession.session.sessionTokenHash`

**Phase 2 — Participant (conversation-scoped):**
- Registered user: find Participant by `{ conversationId, userId }`
- Anonymous: already resolved in phase 1 (Participant IS the identity)

### Access control (simplified)

```typescript
// BEFORE: 2 branches (ConversationMember / AnonymousParticipant)
// AFTER: 1 query
async function canAccessConversation(authContext, conversationId) {
  return await prisma.participant.findFirst({
    where: {
      conversationId,
      id: authContext.participantId,
      isActive: true,
      bannedAt: null
    }
  })
}
```

## Socket.IO

### Connection maps

```typescript
// BEFORE:
connectedUsers: Map<string, SocketUser>       // userId|sessionToken -> user
socketToUser: Map<string, string>             // socketId -> userId|sessionToken

// AFTER:
connectedParticipants: Map<string, SocketParticipant>  // participantId -> participant
socketToParticipant: Map<string, string>               // socketId -> participantId
participantSockets: Map<string, Set<string>>           // participantId -> socketIds
```

### Message handler

```typescript
// BEFORE: extract userId, isAnonymous, jwtToken, sessionToken, call resolveSenderIds
// AFTER:
async handleMessageSend(socket, data) {
  const participant = this._getParticipantContext(socket, data.conversationId)
  await this.messagingService.handleMessage(request, participant.id)
}
```

### Broadcast security

`anonymousSession.session` (IP, fingerprint, token hash) is NEVER exposed via API or Socket.IO broadcast. Only `anonymousSession.profile` (name, username) is shared with other participants.

## Prisme Linguistique

```typescript
function resolveParticipantLanguage(participant: Participant): string {
  if (participant.type === 'user' && participant.user) {
    const user = participant.user
    if (user.customDestinationLanguage) return user.customDestinationLanguage
    if (user.regionalLanguage) return user.regionalLanguage
    return user.systemLanguage
  }
  return participant.language
}
```

Anonymous users get `Participant.language` (set at join, changeable via UI).

## API Response Format

```typescript
type ParticipantResponse = {
  id: string
  conversationId: string
  type: ParticipantType
  displayName: string
  avatar?: string
  role: string
  language: string
  permissions: ParticipantPermissions
  isActive: boolean
  isOnline: boolean
  joinedAt: string
  leftAt?: string
  bannedAt?: string
  nickname?: string

  user?: UserResponse              // full User if type = "user"
  anonymousSession?: {
    profile: AnonymousProfile      // exposed
    // session: NEVER exposed (security)
    // rights: exposed to admins only
  }
}
```

## iOS SDK

```swift
struct Participant: Codable, Identifiable, Sendable {
    let id: String
    let conversationId: String
    let type: ParticipantType
    let displayName: String
    let avatar: String?
    let role: ParticipantRole
    let language: String
    let permissions: ParticipantPermissions
    let isActive: Bool
    let isOnline: Bool
    let joinedAt: Date
    let leftAt: Date?
    let bannedAt: Date?
    let nickname: String?

    let user: User?
    let anonymousProfile: AnonymousProfile?
}

enum ParticipantType: String, Codable, Sendable {
    case user
    case anonymous
    case bot
}
```

Conversation changes from `members` + `anonymousParticipants` to a single `participants` array.

## Session Token Security

Session tokens are hashed with SHA-256 before storage. The client sends the raw token, the server hashes then looks up. This protects against DB dump attacks at zero performance cost (SHA-256 is fast and indexable).

## Migration Strategy

One-shot migration script (platform in early development, ~dozens of users):

1. Create `Participant` for each existing `ConversationMember` (type: "user")
2. Create `Participant` for each existing `AnonymousParticipant` (type: "anonymous", with anonymousSession embedded, sessionToken hashed)
3. Build mapping: old senderId/anonymousSenderId -> new Participant.id
4. Rewrite `Message.senderId` to point to Participant.id
5. Rewrite `MessageStatusEntry` dual FKs to single `participantId`
6. Rewrite `ConversationReadCursor` dual FKs to single `participantId`
7. Rewrite `Reaction` userId to `participantId`
8. Drop old fields and collections
9. Verify data integrity

## Deletions Summary

| Removed | Replaced by |
|---------|-------------|
| `ConversationMember` | `Participant` (type: user) |
| `AnonymousParticipant` | `Participant` (type: anonymous) + `anonymousSession` |
| `Message.anonymousSenderId` | Removed — `senderId` -> `Participant.id` |
| `MessageStatusEntry.userId` + `.anonymousId` | Single `participantId` |
| `ConversationReadCursor.userId` + `.anonymousId` | Single `participantId` |
| `resolveSenderIds()` | Removed — resolution in middleware |
| `canAccessConversation` 2 branches | 1 query on Participant |
| `RegisteredUser` / `AnonymousUser` interfaces | Absorbed into `UnifiedAuthContext` v2 |

## Implementation Approach

- **TDD strict**: RED-GREEN-REFACTOR for every change
- **Review checkpoint** after each implementation step
- **Verification** before marking any step complete
- Bottom-up: schema first, then shared types, then gateway services, then Socket.IO, then API routes, then iOS SDK
