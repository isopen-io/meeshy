# Unified Participant Model — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dual-FK pattern (User/AnonymousParticipant) with a single unified `Participant` model across the entire stack — Prisma, gateway, Socket.IO, iOS SDK, web apps.

**Architecture:** Bottom-up migration: schema first, then shared types, then gateway services/routes, then Socket.IO, then iOS SDK, then web apps. Each task uses TDD (RED-GREEN-REFACTOR). Migration script rewrites all existing data in one shot.

**Tech Stack:** Prisma/MongoDB, TypeScript (gateway + shared + web), Swift (iOS SDK + app), Zod (validation), Vitest (testing), XCTest (iOS testing)

**SWE Discipline:**
- TDD strict: every production change starts with a failing test
- Review checkpoint after each task — verify build + tests pass before moving on
- Commit after each green phase
- No legacy code left behind — complete removal of old models

---

## Task 1: Prisma Schema — Create Participant model + composite types

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`

**Step 1: Write the composite types**

Add before the Participant model:

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

type AnonymousSessionDetails {
  sessionTokenHash  String
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

type AnonymousSession {
  shareLinkId       String
  session           AnonymousSessionDetails
  profile           AnonymousProfile
  rights            AnonymousRightsOverride?
}
```

**Step 2: Write the Participant model**

```prisma
model Participant {
  id               String    @id @default(auto()) @map("_id") @db.ObjectId
  conversationId   String    @db.ObjectId
  type             String    // "user" | "anonymous" | "bot"

  userId           String?   @db.ObjectId

  displayName      String
  avatar           String?

  role             String    @default("member")
  permissions      ParticipantPermissions

  language         String    @default("en")

  isActive         Boolean   @default(true)
  isOnline         Boolean   @default(false)
  lastActiveAt     DateTime  @default(now())
  joinedAt         DateTime  @default(now())
  leftAt           DateTime?
  bannedAt         DateTime?

  nickname         String?

  anonymousSession AnonymousSession?

  conversation     Conversation @relation(fields: [conversationId], references: [id])
  user             User?        @relation(fields: [userId], references: [id])

  sentMessages             Message[]              @relation("MessageSender")
  reactions                Reaction[]
  statusEntries            MessageStatusEntry[]
  readCursors              ConversationReadCursor[]
  mentions                 Mention[]
  callParticipations       CallParticipant[]
  attachmentStatusEntries  AttachmentStatusEntry[]
  attachmentReactions      AttachmentReaction[]
  trackingLinkClicks       TrackingLinkClick[]

  @@unique([conversationId, userId], name: "unique_conversation_user")
  @@index([conversationId])
  @@index([userId])
  @@index([userId, isActive])
  @@index([type])
}
```

**Step 3: Update Conversation model relations**

Add to Conversation model:
```prisma
participants     Participant[]
```

Add to User model:
```prisma
participations   Participant[]
```

**Step 4: Run prisma generate to verify schema compiles**

Run: `cd services/gateway && npx prisma generate`
Expected: SUCCESS (no errors). The new model coexists with old models temporarily.

**Step 5: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(schema): add Participant model with composite types"
```

**REVIEW CHECKPOINT: Verify prisma generate succeeds. Do not proceed if schema has errors.**

---

## Task 2: Prisma Schema — Migrate existing models to use Participant FK

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`

**Step 1: Update Message model**

Replace the dual FK pattern:
```prisma
// REMOVE these fields:
//   senderId           String?   @db.ObjectId
//   anonymousSenderId  String?   @db.ObjectId
//   sender             User?     @relation("MessageSender", ...)
//   anonymousSender    AnonymousParticipant? @relation(...)

// ADD:
senderId           String    @db.ObjectId  // -> Participant.id (REQUIRED)
sender             Participant @relation("MessageSender", fields: [senderId], references: [id])
```

Note: `senderId` changes from `String?` to `String` (required).

**Step 2: Update MessageStatusEntry model**

Replace dual FK:
```prisma
// REMOVE: userId?, anonymousId?, user relation, anonymousUser relation
// REMOVE: @@unique message_user_status, @@unique message_anonymous_status
// REMOVE: @@index userId, @@index anonymousId

// ADD:
participantId    String    @db.ObjectId
participant      Participant @relation(fields: [participantId], references: [id])

@@unique([messageId, participantId], name: "message_participant_status")
@@index([participantId])
```

**Step 3: Update ConversationReadCursor model**

Replace dual FK:
```prisma
// REMOVE: userId?, anonymousId?, user relation, anonymousUser relation
// REMOVE: @@unique conversation_user_cursor, @@unique conversation_anonymous_cursor

// ADD:
participantId    String    @db.ObjectId
participant      Participant @relation(fields: [participantId], references: [id])

@@unique([conversationId, participantId], name: "conversation_participant_cursor")
@@index([participantId])
```

**Step 4: Update Reaction model**

Replace:
```prisma
// REMOVE: userId?, anonymousId?, user relation, anonymousUser relation
// REMOVE: @@unique with userId/anonymousId

// ADD:
participantId    String    @db.ObjectId
participant      Participant @relation(fields: [participantId], references: [id])

@@unique([messageId, participantId, emoji], name: "unique_message_participant_reaction")
```

**Step 5: Update AttachmentStatusEntry model**

Replace dual FK with `participantId`.

**Step 6: Update AttachmentReaction model**

Replace dual FK with `participantId`.

**Step 7: Update CallParticipant model**

Replace dual FK with `participantId`.

**Step 8: Update TrackingLinkClick model**

Replace `anonymousId` with `participantId`.

**Step 9: Remove ConversationMember model entirely**

Delete the entire `model ConversationMember { ... }` block.
Remove `members ConversationMember[]` from Conversation model.
Remove `conversations ConversationMember[]` from User model.

**Step 10: Remove AnonymousParticipant model entirely**

Delete the entire `model AnonymousParticipant { ... }` block.
Remove `anonymousParticipants AnonymousParticipant[]` from Conversation model.
Remove all `AnonymousParticipant` relation references from ConversationShareLink.

**Step 11: Run prisma generate**

Run: `cd services/gateway && npx prisma generate`
Expected: SUCCESS

**Step 12: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(schema): migrate all models to Participant FK, remove ConversationMember + AnonymousParticipant"
```

**REVIEW CHECKPOINT: Verify prisma generate. This is the point of no return for the schema. Every subsequent task builds on this.**

---

## Task 3: Shared Types — Create Participant types

**Files:**
- Create: `packages/shared/types/participant.ts`
- Modify: `packages/shared/types/index.ts`
- Modify: `packages/shared/types/conversation.ts`
- Modify: `packages/shared/types/message-types.ts`

**Step 1: Write failing test for Participant type validation**

Create: `packages/shared/__tests__/types/participant.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { ParticipantSchema, ParticipantType } from '@meeshy/shared/types/participant'

describe('ParticipantSchema', () => {
  it('should validate a registered user participant', () => {
    const participant = {
      id: '507f1f77bcf86cd799439011',
      conversationId: '507f1f77bcf86cd799439012',
      type: 'user' as const,
      userId: '507f1f77bcf86cd799439013',
      displayName: 'John Doe',
      role: 'member',
      language: 'en',
      permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canSendVideos: true, canSendAudios: true, canSendLocations: true, canSendLinks: true },
      isActive: true,
      isOnline: false,
      joinedAt: new Date().toISOString(),
    }
    expect(ParticipantSchema.parse(participant)).toBeDefined()
  })

  it('should validate an anonymous participant with session', () => {
    const participant = {
      id: '507f1f77bcf86cd799439011',
      conversationId: '507f1f77bcf86cd799439012',
      type: 'anonymous' as const,
      displayName: 'Guest User',
      role: 'member',
      language: 'fr',
      permissions: { canSendMessages: true, canSendFiles: false, canSendImages: true, canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false },
      isActive: true,
      isOnline: true,
      joinedAt: new Date().toISOString(),
      anonymousSession: {
        shareLinkId: '507f1f77bcf86cd799439014',
        session: {
          sessionTokenHash: 'a'.repeat(64),
          ipAddress: '192.168.1.1',
          connectedAt: new Date().toISOString(),
        },
        profile: {
          firstName: 'Guest',
          lastName: 'User',
          username: 'guest_user',
        },
      },
    }
    expect(ParticipantSchema.parse(participant)).toBeDefined()
  })

  it('should reject participant without required fields', () => {
    expect(() => ParticipantSchema.parse({ id: '123' })).toThrow()
  })

  it('should reject anonymous participant without anonymousSession', () => {
    const participant = {
      id: '507f1f77bcf86cd799439011',
      conversationId: '507f1f77bcf86cd799439012',
      type: 'anonymous' as const,
      displayName: 'Guest',
      role: 'member',
      language: 'fr',
      permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false, canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false },
      isActive: true,
      isOnline: false,
      joinedAt: new Date().toISOString(),
      // missing anonymousSession
    }
    expect(() => ParticipantSchema.parse(participant)).toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run __tests__/types/participant.test.ts`
Expected: FAIL — module not found

**Step 3: Implement Participant types with Zod schemas**

Create `packages/shared/types/participant.ts`:

```typescript
import { z } from 'zod'

export const ParticipantTypeEnum = z.enum(['user', 'anonymous', 'bot'])
export type ParticipantType = z.infer<typeof ParticipantTypeEnum>

export const ParticipantPermissionsSchema = z.object({
  canSendMessages: z.boolean(),
  canSendFiles: z.boolean(),
  canSendImages: z.boolean(),
  canSendVideos: z.boolean(),
  canSendAudios: z.boolean(),
  canSendLocations: z.boolean(),
  canSendLinks: z.boolean(),
})
export type ParticipantPermissions = z.infer<typeof ParticipantPermissionsSchema>

export const AnonymousSessionDetailsSchema = z.object({
  sessionTokenHash: z.string(),
  ipAddress: z.string().optional(),
  country: z.string().optional(),
  deviceFingerprint: z.string().optional(),
  connectedAt: z.coerce.date(),
})

export const AnonymousProfileSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  username: z.string(),
  email: z.string().optional(),
  birthday: z.coerce.date().optional(),
})
export type AnonymousProfile = z.infer<typeof AnonymousProfileSchema>

export const AnonymousRightsOverrideSchema = z.object({
  canSendMessages: z.boolean().optional(),
  canSendFiles: z.boolean().optional(),
  canSendImages: z.boolean().optional(),
  canSendVideos: z.boolean().optional(),
  canSendAudios: z.boolean().optional(),
  canSendLocations: z.boolean().optional(),
  canSendLinks: z.boolean().optional(),
})

export const AnonymousSessionSchema = z.object({
  shareLinkId: z.string(),
  session: AnonymousSessionDetailsSchema,
  profile: AnonymousProfileSchema,
  rights: AnonymousRightsOverrideSchema.optional(),
})
export type AnonymousSession = z.infer<typeof AnonymousSessionSchema>

const BaseParticipantSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  type: ParticipantTypeEnum,
  userId: z.string().optional(),
  displayName: z.string(),
  avatar: z.string().optional(),
  role: z.string().default('member'),
  language: z.string(),
  permissions: ParticipantPermissionsSchema,
  isActive: z.boolean(),
  isOnline: z.boolean(),
  joinedAt: z.coerce.date(),
  leftAt: z.coerce.date().optional(),
  bannedAt: z.coerce.date().optional(),
  nickname: z.string().optional(),
  lastActiveAt: z.coerce.date().optional(),
  anonymousSession: AnonymousSessionSchema.optional(),
  user: z.any().optional(),
})

export const ParticipantSchema = BaseParticipantSchema.superRefine((data, ctx) => {
  if (data.type === 'anonymous' && !data.anonymousSession) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'anonymousSession is required for anonymous participants',
      path: ['anonymousSession'],
    })
  }
  if (data.type === 'user' && !data.userId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'userId is required for user participants',
      path: ['userId'],
    })
  }
})

export type Participant = z.infer<typeof BaseParticipantSchema>

export const DEFAULT_USER_PERMISSIONS: ParticipantPermissions = {
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: true,
  canSendAudios: true,
  canSendLocations: true,
  canSendLinks: true,
}

export const DEFAULT_ANONYMOUS_PERMISSIONS: ParticipantPermissions = {
  canSendMessages: true,
  canSendFiles: false,
  canSendImages: true,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: false,
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared && npx vitest run __tests__/types/participant.test.ts`
Expected: PASS

**Step 5: Update index.ts exports**

Add to `packages/shared/types/index.ts`:
```typescript
export * from './participant'
```

Remove or deprecate exports from `anonymous.ts` and `ConversationMember` from `conversation.ts`.

**Step 6: Commit**

```bash
git add packages/shared/types/participant.ts packages/shared/__tests__/types/participant.test.ts packages/shared/types/index.ts
git commit -m "feat(shared): add unified Participant Zod schema + types with TDD"
```

**REVIEW CHECKPOINT: All shared type tests pass. Types compile. Exports updated.**

---

## Task 4: Shared Types — Update conversation.ts, message-types.ts, remove anonymous.ts

**Files:**
- Modify: `packages/shared/types/conversation.ts`
- Modify: `packages/shared/types/message-types.ts`
- Modify: `packages/shared/types/anonymous.ts` (then delete)
- Modify: `packages/shared/types/socketio-events.ts` (if needed)

**Step 1: Update existing tests that reference ConversationMember / AnonymousParticipant**

Search all test files in `packages/shared/__tests__/` for references to old types and update them to use `Participant`.

**Step 2: Update conversation.ts**

- Remove `ConversationMember` interface (replaced by Participant)
- Remove `ConversationMemberCompat` type alias
- Update `Conversation` type to use `participants: readonly Participant[]` instead of `members` + `anonymousParticipants`
- Update `canMemberSendMessage` to accept `Participant`
- Update `ConversationReadCursor` to use `participantId` instead of `userId`/`anonymousId`
- Update all DTO types (AddConversationMemberDTO → AddParticipantDTO, etc.)

**Step 3: Update message-types.ts**

- Replace `anonymousSenderId` with single `senderId` (now Participant.id)
- Replace `sender?: User | AnonymousParticipant` with `sender?: Participant`
- Update `MessageStatusEntry` type to use `participantId`
- Remove `AnonymousParticipant` imports

**Step 4: Delete anonymous.ts**

Remove the file entirely. All its types are now in `participant.ts`.

**Step 5: Update index.ts**

Remove `export * from './anonymous'`

**Step 6: Run all shared package tests**

Run: `cd packages/shared && npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add -A packages/shared/
git commit -m "feat(shared): migrate all types to unified Participant, remove anonymous.ts + ConversationMember"
```

**REVIEW CHECKPOINT: Shared package fully migrated. All tests pass. No references to old types remain in packages/shared/.**

---

## Task 5: Shared Utils — Update conversation-helpers.ts (Prisme Linguistique)

**Files:**
- Modify: `packages/shared/utils/conversation-helpers.ts`

**Step 1: Write failing test for resolveParticipantLanguage**

```typescript
import { describe, it, expect } from 'vitest'
import { resolveParticipantLanguage } from '../conversation-helpers'

describe('resolveParticipantLanguage', () => {
  it('should return customDestinationLanguage for user with custom preference', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: 'ja', regionalLanguage: 'es', systemLanguage: 'en' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('ja')
  })

  it('should return regionalLanguage when no custom destination', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: null, regionalLanguage: 'es', systemLanguage: 'en' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('es')
  })

  it('should return systemLanguage as fallback for user', () => {
    const participant = {
      type: 'user' as const,
      language: 'en',
      user: { customDestinationLanguage: null, regionalLanguage: null, systemLanguage: 'fr' },
    }
    expect(resolveParticipantLanguage(participant)).toBe('fr')
  })

  it('should return participant.language for anonymous', () => {
    const participant = { type: 'anonymous' as const, language: 'fr' }
    expect(resolveParticipantLanguage(participant)).toBe('fr')
  })

  it('should return participant.language for bot', () => {
    const participant = { type: 'bot' as const, language: 'en' }
    expect(resolveParticipantLanguage(participant)).toBe('en')
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement resolveParticipantLanguage**

```typescript
type LanguageResolvable = {
  type: string
  language: string
  user?: {
    customDestinationLanguage?: string | null
    regionalLanguage?: string | null
    systemLanguage: string
  } | null
}

export function resolveParticipantLanguage(participant: LanguageResolvable): string {
  if (participant.type === 'user' && participant.user) {
    if (participant.user.customDestinationLanguage) return participant.user.customDestinationLanguage
    if (participant.user.regionalLanguage) return participant.user.regionalLanguage
    return participant.user.systemLanguage
  }
  return participant.language
}
```

**Step 4: Run test — expect PASS**

**Step 5: Remove or update old resolveUserLanguage if it exists**

**Step 6: Commit**

```bash
git commit -m "feat(shared): add resolveParticipantLanguage for unified Prisme Linguistique"
```

**REVIEW CHECKPOINT: Language resolution works for all participant types.**

---

## Task 6: Gateway — Session token hashing utility

**Files:**
- Create: `services/gateway/src/utils/session-token.ts`
- Create: `services/gateway/src/__tests__/unit/utils/session-token.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { hashSessionToken, generateSessionToken } from '../../../utils/session-token'

describe('hashSessionToken', () => {
  it('should return a 64-char hex SHA-256 hash', () => {
    const hash = hashSessionToken('anon_123_abc')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should be deterministic', () => {
    const hash1 = hashSessionToken('anon_123_abc')
    const hash2 = hashSessionToken('anon_123_abc')
    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different tokens', () => {
    const hash1 = hashSessionToken('anon_123_abc')
    const hash2 = hashSessionToken('anon_456_def')
    expect(hash1).not.toBe(hash2)
  })
})

describe('generateSessionToken', () => {
  it('should start with anon_ prefix', () => {
    const token = generateSessionToken()
    expect(token).toMatch(/^anon_/)
  })

  it('should generate unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()))
    expect(tokens.size).toBe(100)
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

```typescript
import crypto from 'node:crypto'

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateSessionToken(deviceFingerprint?: string): string {
  const timestamp = Date.now().toString()
  const randomPart = crypto.randomBytes(16).toString('hex')
  const devicePart = deviceFingerprint
    ? crypto.createHash('sha256').update(deviceFingerprint).digest('hex').slice(0, 8)
    : crypto.randomBytes(4).toString('hex')
  return `anon_${timestamp}_${randomPart}_${devicePart}`
}
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git commit -m "feat(gateway): add SHA-256 session token hashing utility with TDD"
```

**REVIEW CHECKPOINT: Hashing utility tested and working.**

---

## Task 7: Gateway — Update auth middleware (UnifiedAuthContext v2)

**Files:**
- Modify: `services/gateway/src/middleware/auth.ts`
- Update tests: `services/gateway/src/__tests__/unit/middleware/auth.test.ts`

**Step 1: Write failing test for new auth context shape**

Test that the middleware resolves a `participantId` for anonymous users via session token hash lookup, and that registered users get `type: 'user'` with `userId`.

**Step 2: Update UnifiedAuthContext interface**

Replace `RegisteredUser`/`AnonymousUser` with unified shape per design doc.

**Step 3: Update createAuthContext**

- JWT path: resolve User, set `type: 'user'`, `userId`, `hasFullAccess: true`
- Session token path: hash with SHA-256, lookup `Participant` by `anonymousSession.session.sessionTokenHash`, set `type: 'anonymous'`, `participantId`
- Add participant resolution for conversation-scoped requests

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git commit -m "feat(gateway): migrate auth middleware to UnifiedAuthContext v2 with Participant resolution"
```

**REVIEW CHECKPOINT: Auth middleware compiles and tests pass. Both JWT and session token paths work.**

---

## Task 8: Gateway — Update MessagingService

**Files:**
- Modify: `services/gateway/src/services/messaging/MessagingService.ts`
- Modify: `services/gateway/src/services/messaging/MessageProcessor.ts`
- Update tests

**Step 1: Write failing test**

Test that `handleMessage` accepts a single `participantId` and creates a message with `senderId = participantId`.

**Step 2: Simplify handleMessage signature**

```typescript
// BEFORE: handleMessage(request, senderId, isAuthenticated, jwtToken?, sessionToken?)
// AFTER:
async handleMessage(request: MessageRequest, participantId: string): Promise<MessageResponse>
```

**Step 3: Remove resolveSenderIds method entirely**

**Step 4: Update message creation**

```typescript
await prisma.message.create({
  data: {
    senderId: participantId,  // single FK, always filled
    conversationId,
    content,
    originalLanguage,
    messageType,
    messageSource,
    ...
  }
})
```

**Step 5: Update MessageProcessor similarly**

**Step 6: Run tests — expect PASS**

**Step 7: Commit**

```bash
git commit -m "feat(gateway): simplify MessagingService to single participantId, remove resolveSenderIds"
```

**REVIEW CHECKPOINT: Messaging service uses single FK. No dual FK logic remains.**

---

## Task 9: Gateway — Update MessageReadStatusService

**Files:**
- Modify: `services/gateway/src/services/MessageReadStatusService.ts`
- Update tests

**Step 1: Write failing test for status entries using participantId**

**Step 2: Replace all userId/anonymousId dual FK logic with single participantId**

Every `MessageStatusEntry` and `ConversationReadCursor` creation/query uses `participantId` instead of the dual FK.

**Step 3: Run tests — expect PASS**

**Step 4: Commit**

```bash
git commit -m "feat(gateway): migrate MessageReadStatusService to participantId"
```

**REVIEW CHECKPOINT: Read status tracking uses unified FK.**

---

## Task 10: Gateway — Update ReactionService

**Files:**
- Modify: `services/gateway/src/services/ReactionService.ts`
- Update tests

**Step 1: Replace userId/anonymousId params with single participantId**

**Step 2: Update all Reaction queries to use participantId**

**Step 3: Run tests — expect PASS**

**Step 4: Commit**

```bash
git commit -m "feat(gateway): migrate ReactionService to participantId"
```

---

## Task 11: Gateway — Update MessageTranslationService

**Files:**
- Modify: `services/gateway/src/services/message-translation/MessageTranslationService.ts`
- Update tests

**Step 1: Replace anonymousSenderId with senderId (Participant.id)**

**Step 2: Update translation target language resolution to use resolveParticipantLanguage**

**Step 3: Run tests — expect PASS**

**Step 4: Commit**

```bash
git commit -m "feat(gateway): migrate MessageTranslationService to Participant model"
```

---

## Task 12: Gateway — Update Socket.IO handlers

**Files:**
- Modify: `services/gateway/src/socketio/handlers/AuthHandler.ts`
- Modify: `services/gateway/src/socketio/handlers/MessageHandler.ts`
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts`
- Modify: `services/gateway/src/socketio/CallEventsHandler.ts`

**Step 1: Update AuthHandler connection maps**

Replace `connectedUsers`/`socketToUser`/`userSockets` with `connectedParticipants`/`socketToParticipant`/`participantSockets`.

**Step 2: Update socket auth flow**

- JWT: verify user, then resolve Participant(s) for the user's conversations
- Session token: hash, lookup Participant directly

**Step 3: Update MessageHandler**

Replace `_getUserContext` with `_getParticipantContext(socket, conversationId)`.
Simplify message send to pass `participantId` to MessagingService.

**Step 4: Update MeeshySocketIOManager**

Update all broadcast logic to use Participant-based sender info.
Ensure `anonymousSession.session` is NEVER broadcast (security).

**Step 5: Update CallEventsHandler**

Replace dual FK call participant logic with `participantId`.

**Step 6: Run gateway tests**

Run: `cd services/gateway && npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git commit -m "feat(gateway): migrate all Socket.IO handlers to Participant model"
```

**REVIEW CHECKPOINT: All Socket.IO handlers migrated. Gateway tests pass. No references to old models remain in socketio/.**

---

## Task 13: Gateway — Update API routes

**Files:**
- Modify: `services/gateway/src/routes/conversations/participants.ts`
- Modify: `services/gateway/src/routes/conversations/messages.ts`
- Modify: `services/gateway/src/routes/conversations/messages-advanced.ts`
- Modify: `services/gateway/src/routes/messages.ts`
- Modify: `services/gateway/src/routes/reactions.ts`
- Modify: `services/gateway/src/routes/anonymous.ts`
- Modify: `services/gateway/src/routes/links/messages.ts`
- Modify: `services/gateway/src/routes/links/retrieval.ts`
- Modify: `services/gateway/src/routes/conversations/utils/access-control.ts`
- Modify: `services/gateway/src/routes/tracking-links/tracking.ts`

**Step 1: Update access-control.ts**

Replace 2-branch logic with single Participant query:
```typescript
async function canAccessConversation(authContext, conversationId) {
  return await prisma.participant.findFirst({
    where: { conversationId, id: authContext.participantId, isActive: true, bannedAt: null }
  })
}
```

**Step 2: Update participants.ts route**

Replace separate ConversationMember + AnonymousParticipant queries with single `prisma.participant.findMany({ where: { conversationId } })`.

**Step 3: Update messages.ts and messages-advanced.ts**

- Message queries: select `senderId` only (no more `anonymousSenderId`)
- Include `sender` relation (Participant with optional User include)
- Update all reaction/status queries to use `participantId`

**Step 4: Update anonymous.ts (join flow)**

Replace `prisma.anonymousParticipant.create()` with `prisma.participant.create()` with `type: 'anonymous'` and `anonymousSession` embedded document. Hash the session token with SHA-256 before storage.

**Step 5: Update reactions.ts**

Use `participantId` for add/remove reaction.

**Step 6: Update links routes**

Replace anonymous participant queries with Participant queries filtered by `type: 'anonymous'`.

**Step 7: Update tracking routes**

Replace `anonymousId` with `participantId`.

**Step 8: Run all gateway tests**

Run: `cd services/gateway && npx vitest run`
Expected: ALL PASS

**Step 9: Commit**

```bash
git commit -m "feat(gateway): migrate all API routes to Participant model"
```

**REVIEW CHECKPOINT: All gateway routes migrated. Full gateway test suite passes.**

---

## Task 14: Gateway — Full build verification

**Step 1: Run TypeScript compilation**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: No errors

**Step 2: Run all tests**

Run: `cd services/gateway && npx vitest run`
Expected: ALL PASS

**Step 3: Grep for any remaining old references**

Run grep for: `ConversationMember`, `AnonymousParticipant`, `anonymousSenderId`, `anonymousId` across `services/gateway/src/`
Expected: ZERO matches

**Step 4: Commit (if any fixes needed)**

**REVIEW CHECKPOINT: Gateway is fully migrated. Zero legacy references. All tests pass. TypeScript compiles clean.**

---

## Task 15: Migration Script — Create data migration

**Files:**
- Create: `scripts/migrations/migrate-to-participant-model.ts`

**Step 1: Write the migration script**

The script must:

1. Connect to MongoDB directly (not through Prisma, for raw bulk operations)
2. For each `ConversationMember`: create a `Participant` with `type: "user"`, copy role/permissions/nickname/dates, set `userId`
3. For each `AnonymousParticipant`: create a `Participant` with `type: "anonymous"`, build `anonymousSession` sub-document, hash `sessionToken` with SHA-256
4. Build old-ID → new-Participant-ID mapping
5. Bulk update `Message.senderId`: if old `senderId` (User.id) → find Participant by `{ conversationId, userId }` → set new `senderId` = Participant.id. If old `anonymousSenderId` → find Participant by old AnonymousParticipant.id mapping → set `senderId` = Participant.id
6. Remove `anonymousSenderId` field from all messages
7. Bulk update `MessageStatusEntry`: replace `userId`/`anonymousId` with `participantId`
8. Bulk update `ConversationReadCursor`: same
9. Bulk update `Reaction`: same
10. Bulk update `AttachmentStatusEntry`, `AttachmentReaction`, `CallParticipant`, `TrackingLinkClick`: same
11. Drop old collections: `ConversationMember`, `AnonymousParticipant`
12. Verify data integrity: count participants == count old members + count old anonymous

**Step 2: Write verification queries**

After migration, verify:
- Every Message has a valid `senderId` pointing to a Participant
- No Message has `anonymousSenderId` field
- Participant count == old ConversationMember count + old AnonymousParticipant count
- All unique constraints hold

**Step 3: Test on local DB first**

Run: `npx tsx scripts/migrations/migrate-to-participant-model.ts --dry-run`
Then: `npx tsx scripts/migrations/migrate-to-participant-model.ts`

**Step 4: Commit**

```bash
git commit -m "feat(migration): add one-shot migration script for Participant model"
```

**REVIEW CHECKPOINT: Migration script tested locally. Data integrity verified. Ready for production.**

---

## Task 16: iOS SDK — Create Participant Swift model

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/ParticipantModels.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/ParticipantModelsTests.swift`

**Step 1: Write failing test**

```swift
import XCTest
@testable import MeeshySDK

final class ParticipantModelsTests: XCTestCase {
    func test_decode_userParticipant_fromJSON() throws {
        let json = """
        {
            "id": "507f1f77bcf86cd799439011",
            "conversationId": "507f1f77bcf86cd799439012",
            "type": "user",
            "userId": "507f1f77bcf86cd799439013",
            "displayName": "John Doe",
            "role": "member",
            "language": "en",
            "permissions": { "canSendMessages": true, "canSendFiles": true, "canSendImages": true, "canSendVideos": true, "canSendAudios": true, "canSendLocations": true, "canSendLinks": true },
            "isActive": true,
            "isOnline": false,
            "joinedAt": "2026-03-08T00:00:00Z",
            "user": { "id": "507f1f77bcf86cd799439013", "username": "johndoe", "displayName": "John Doe" }
        }
        """.data(using: .utf8)!

        let participant = try JSONDecoder.meeshy.decode(Participant.self, from: json)
        XCTAssertEqual(participant.type, .user)
        XCTAssertEqual(participant.displayName, "John Doe")
        XCTAssertNotNil(participant.user)
        XCTAssertNil(participant.anonymousProfile)
    }

    func test_decode_anonymousParticipant_fromJSON() throws {
        let json = """
        {
            "id": "507f1f77bcf86cd799439011",
            "conversationId": "507f1f77bcf86cd799439012",
            "type": "anonymous",
            "displayName": "Guest User",
            "role": "member",
            "language": "fr",
            "permissions": { "canSendMessages": true, "canSendFiles": false, "canSendImages": true, "canSendVideos": false, "canSendAudios": false, "canSendLocations": false, "canSendLinks": false },
            "isActive": true,
            "isOnline": true,
            "joinedAt": "2026-03-08T00:00:00Z",
            "anonymousSession": {
                "profile": { "firstName": "Guest", "lastName": "User", "username": "guest_user" }
            }
        }
        """.data(using: .utf8)!

        let participant = try JSONDecoder.meeshy.decode(Participant.self, from: json)
        XCTAssertEqual(participant.type, .anonymous)
        XCTAssertNotNil(participant.anonymousProfile)
        XCTAssertNil(participant.user)
    }
}
```

**Step 2: Run test — expect FAIL**

Run: `./apps/ios/meeshy.sh test`

**Step 3: Implement Participant model**

```swift
enum ParticipantType: String, Codable, Sendable {
    case user
    case anonymous
    case bot
}

struct ParticipantPermissions: Codable, Sendable {
    let canSendMessages: Bool
    let canSendFiles: Bool
    let canSendImages: Bool
    let canSendVideos: Bool
    let canSendAudios: Bool
    let canSendLocations: Bool
    let canSendLinks: Bool
}

struct AnonymousProfile: Codable, Sendable {
    let firstName: String
    let lastName: String
    let username: String
    let email: String?
    let birthday: Date?
}

struct AnonymousSessionResponse: Codable, Sendable {
    let profile: AnonymousProfile
}

struct Participant: Codable, Identifiable, Sendable {
    let id: String
    let conversationId: String
    let type: ParticipantType
    let userId: String?
    let displayName: String
    let avatar: String?
    let role: String
    let language: String
    let permissions: ParticipantPermissions
    let isActive: Bool
    let isOnline: Bool
    let joinedAt: Date
    let leftAt: Date?
    let bannedAt: Date?
    let nickname: String?
    let user: User?
    let anonymousSession: AnonymousSessionResponse?

    var anonymousProfile: AnonymousProfile? {
        anonymousSession?.profile
    }

    var isBanned: Bool { bannedAt != nil }
}
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git commit -m "feat(sdk): add unified Participant Swift model with TDD"
```

**REVIEW CHECKPOINT: iOS SDK Participant model decodes correctly for both user and anonymous types.**

---

## Task 17: iOS SDK — Update MessageModels, ConversationModels

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`
- Remove: Any `AnonymousParticipant` model file
- Remove: Any `ConversationMember` model file
- Update tests

**Step 1: Update Message model**

Replace `senderId: String?` + `anonymousSenderId: String?` with `senderId: String`.
Replace `sender: User?` with `sender: Participant?`.

**Step 2: Update Conversation model**

Replace `members: [ConversationMember]` + `anonymousParticipants: [AnonymousParticipant]` with `participants: [Participant]`.

**Step 3: Remove old model types**

Delete `ConversationMember` struct and `AnonymousParticipant` struct from SDK.

**Step 4: Update all tests**

**Step 5: Run iOS tests**

Run: `./apps/ios/meeshy.sh test`
Expected: ALL PASS

**Step 6: Commit**

```bash
git commit -m "feat(sdk): migrate Message + Conversation models to Participant, remove legacy types"
```

**REVIEW CHECKPOINT: SDK fully migrated. No legacy types remain. All tests pass.**

---

## Task 18: iOS SDK — Update services

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/MessageService.swift`
- Update tests

**Step 1: Update ConversationService to return Participant instead of ConversationMember**

**Step 2: Update MessageService to work with new senderId field**

**Step 3: Run tests — expect PASS**

**Step 4: Commit**

```bash
git commit -m "feat(sdk): migrate SDK services to Participant model"
```

---

## Task 19: iOS App — Update ViewModels and Views

**Files:**
- Modify: All ViewModels/Views referencing `ConversationMember` or `AnonymousParticipant`
- Modify: Mock files in tests
- Run through `apps/ios/` for remaining references

**Step 1: Search for all old type references in apps/ios/**

Run grep for: `ConversationMember`, `AnonymousParticipant`, `anonymousSenderId`

**Step 2: Update each file to use Participant**

**Step 3: Build iOS app**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 4: Run iOS tests**

Run: `./apps/ios/meeshy.sh test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git commit -m "feat(ios): migrate app layer to Participant model"
```

**REVIEW CHECKPOINT: iOS app builds and tests pass. Zero legacy references.**

---

## Task 20: Web App — Update types and services

**Files:**
- Modify: `apps/web/types/socketio.ts`
- Modify: `apps/web/services/conversations/types.ts`
- Modify: `apps/web/services/conversations/transformers.service.ts`
- Modify: `apps/web/services/meeshy-socketio.service.ts`
- Modify: `apps/web/services/socketio/messaging.service.ts`
- Modify: `apps/web/services/link-conversation.service.ts`
- Modify: `apps/web/services/anonymous-chat.service.ts`
- Modify: `apps/web/utils/user-display-name.ts`
- Modify: `apps/web/lib/user-status.ts`

**Step 1: Update all type definitions to use Participant**

**Step 2: Update Socket.IO event handlers**

**Step 3: Update all service files**

**Step 4: Run web app tests and build**

Run: `cd apps/web && npm run build`
Expected: BUILD SUCCESS

**Step 5: Commit**

```bash
git commit -m "feat(web): migrate types and services to Participant model"
```

---

## Task 21: Web App — Update components and hooks

**Files:**
- Modify: All components in `apps/web/components/conversations/` referencing old types
- Modify: All hooks in `apps/web/hooks/` referencing old types
- Update component tests

**Step 1: Update participant display components**

**Step 2: Update message interaction hooks**

**Step 3: Update reaction hooks**

**Step 4: Run all web tests**

**Step 5: Commit**

```bash
git commit -m "feat(web): migrate components and hooks to Participant model"
```

---

## Task 22: Web_v2 App — Mirror all web changes

**Files:** All equivalent files in `apps/web_v2/`

**Step 1: Apply same changes as Task 20-21 to web_v2**

**Step 2: Run build**

**Step 3: Commit**

```bash
git commit -m "feat(web_v2): migrate to Participant model"
```

**REVIEW CHECKPOINT: Both web apps migrated. All builds pass.**

---

## Task 23: Final Verification — Full stack grep + build

**Step 1: Grep entire codebase for legacy references**

Search for: `ConversationMember`, `AnonymousParticipant`, `anonymousSenderId`, `anonymousId` (in FK context)
Expected: ZERO matches (except migration script and git history)

**Step 2: Run all test suites**

```bash
cd packages/shared && npx vitest run
cd services/gateway && npx vitest run
cd apps/web && npm run build
cd apps/web_v2 && npm run build  # if applicable
./apps/ios/meeshy.sh build
./apps/ios/meeshy.sh test
```

**Step 3: Run Prisma generate one final time**

```bash
cd services/gateway && npx prisma generate
```

**Step 4: Commit any final fixes**

**FINAL REVIEW CHECKPOINT: Zero legacy code. All tests pass. All apps build. Schema is clean. Ready for production migration.**

---

## Task 24: Production Migration

**Step 1: Backup production database**

```bash
ssh root@meeshy.me "mongodump --uri='mongodb://...' --out=/opt/meeshy/backups/pre-participant-migration"
```

**Step 2: Deploy new code (without starting services)**

**Step 3: Run migration script against production DB**

```bash
npx tsx scripts/migrations/migrate-to-participant-model.ts --production
```

**Step 4: Verify migration on production**

Run verification queries from Task 15.

**Step 5: Start services and verify**

```bash
docker compose up -d
```

Test: login as `atabeth`, send a message, verify it appears correctly.
Test: join as anonymous via share link, send a message, verify sender is correct.

**Step 6: Commit migration completion record**

```bash
git commit -m "chore: production migration to Participant model complete"
```

---

## Summary

| Task | Scope | TDD | Review Gate |
|------|-------|-----|-------------|
| 1 | Prisma: create Participant model | N/A (schema) | prisma generate |
| 2 | Prisma: migrate all FKs | N/A (schema) | prisma generate |
| 3 | Shared types: Participant Zod schema | YES | vitest pass |
| 4 | Shared types: migrate conversation + message types | YES | vitest pass |
| 5 | Shared utils: resolveParticipantLanguage | YES | vitest pass |
| 6 | Gateway: session token hashing | YES | vitest pass |
| 7 | Gateway: auth middleware v2 | YES | vitest pass |
| 8 | Gateway: MessagingService | YES | vitest pass |
| 9 | Gateway: MessageReadStatusService | YES | vitest pass |
| 10 | Gateway: ReactionService | YES | vitest pass |
| 11 | Gateway: MessageTranslationService | YES | vitest pass |
| 12 | Gateway: Socket.IO handlers | YES | vitest pass |
| 13 | Gateway: API routes | YES | vitest pass |
| 14 | Gateway: full build verification | N/A | tsc + vitest + grep |
| 15 | Migration script | YES (verification) | local DB test |
| 16 | iOS SDK: Participant model | YES | XCTest pass |
| 17 | iOS SDK: Message + Conversation models | YES | XCTest pass |
| 18 | iOS SDK: services | YES | XCTest pass |
| 19 | iOS app: ViewModels + Views | YES | build + test |
| 20 | Web: types + services | YES | build pass |
| 21 | Web: components + hooks | YES | build + test |
| 22 | Web_v2: mirror changes | YES | build pass |
| 23 | Final verification | N/A | full stack grep + build |
| 24 | Production migration | N/A | data integrity check |
