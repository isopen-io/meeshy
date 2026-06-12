# BUG 2 A' — Réactions par-image — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de réagir à UNE image dans un message multi-images (modèle 1-message/N-PJ conservé), via une slice verticale clonant le flux de réactions message-level.

**Architecture:** `AttachmentReaction` (schéma déjà présent, zéro plumbing) reçoit un flux complet : service + handler socket gateway (clones de `ReactionService`/`ReactionHandler`), events `attachment:reaction-*`, réactions agrégées sérialisées sur l'attachment, modèle + socket SDK, toggle optimiste + UI grille app. Coexiste avec les réactions message-level (tables distinctes). Pas de migration GRDB (réactions dans `attachmentsJson`).

**Tech Stack:** Gateway Fastify+TS strict:false (Jest), Prisma/MongoDB, Socket.IO ; SDK/app Swift 6 (XCTest + Swift Testing) ; `@meeshy/shared` types.

Spec : `docs/superpowers/specs/2026-06-11-bug2-per-image-reactions-design.md`.

---

## File Structure

| Fichier | Rôle |
|---|---|
| `packages/shared/types/socketio-events.ts` *(edit)* | 6 constantes `attachment:reaction-*` + types payload |
| `services/gateway/src/services/AttachmentReactionService.ts` *(créer)* | service add/remove/get (clone `ReactionService`) |
| `services/gateway/src/services/__tests__/AttachmentReactionService.test.ts` *(créer)* | tests service |
| `services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts` *(créer)* | handler socket (clone `ReactionHandler`) |
| `services/gateway/src/socketio/MeeshySocketIOManager.ts` *(edit)* | registration du handler |
| `services/gateway/src/socketio/serializeAttachmentForSocket.ts` + message query include + `packages/shared/types/api-schemas.ts` *(edit)* | réactions agrégées sur l'attachment |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` *(edit)* | `MeeshyMessageAttachment.reactions` + `AttachmentReactionSummary` |
| `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` *(edit)* | listeners + send `attachment:reaction-*` |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` *(edit)* | `toggleAttachmentReaction` + subscriber |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift` *(edit)* | badge réactions + long-press picker + callback |
| tests SDK/app *(créer/edit)* | decode + toggle + gate solo |

---

# PHASE 0 — Gateway + SDK (sans UI)

## Task 1: Événements socket `attachment:reaction-*` (shared)

**Files:**
- Modify: `packages/shared/types/socketio-events.ts` (SERVER_EVENTS ~125, CLIENT_EVENTS ~293, ServerToClient map ~952, payload types)

- [ ] **Step 1: Ajouter les constantes d'événements**

Dans `SERVER_EVENTS` (après `REACTION_SYNC: 'reaction:sync'` ~ligne 127) :
```typescript
  ATTACHMENT_REACTION_ADDED: 'attachment:reaction-added',
  ATTACHMENT_REACTION_REMOVED: 'attachment:reaction-removed',
  ATTACHMENT_REACTION_SYNC: 'attachment:reaction-sync',
```
Dans `CLIENT_EVENTS` (après `REACTION_REQUEST_SYNC: 'reaction:request-sync'` ~ligne 295) :
```typescript
  ATTACHMENT_REACTION_ADD: 'attachment:reaction-add',
  ATTACHMENT_REACTION_REMOVE: 'attachment:reaction-remove',
  ATTACHMENT_REACTION_REQUEST_SYNC: 'attachment:reaction-request-sync',
```

- [ ] **Step 2: Ajouter les types payload** (près de `ReactionUpdateEventData` ~ligne 803)

```typescript
export interface AttachmentReactionAggregationEntry {
  readonly emoji: string;
  readonly count: number;
  readonly reactedByMe: boolean;
}

export interface AttachmentReactionUpdateEventData {
  readonly attachmentId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly participantId: string;
  readonly emoji: string;
  readonly action: 'added' | 'removed';
  readonly aggregation: readonly AttachmentReactionAggregationEntry[];
  readonly timestamp: string;
}
```

- [ ] **Step 3: Brancher dans la map `ServerToClientEvents`** (près de ligne 952)

```typescript
  [SERVER_EVENTS.ATTACHMENT_REACTION_ADDED]: (data: AttachmentReactionUpdateEventData) => void;
  [SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED]: (data: AttachmentReactionUpdateEventData) => void;
```

- [ ] **Step 4: Typecheck**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: 0 erreur hors `MessageValidator.ts` (pré-existant).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/types/socketio-events.ts
git commit -m "feat(shared): événements socket attachment:reaction-* (BUG2 A')"
```

---

## Task 2: `AttachmentReactionService` (gateway, clone de `ReactionService`)

**Files:**
- Create: `services/gateway/src/services/AttachmentReactionService.ts`
- Test: `services/gateway/src/services/__tests__/AttachmentReactionService.test.ts`

**Méthode :** cloner `services/gateway/src/services/ReactionService.ts` (template prouvé, cf. `CommentReactionService.ts:1-6` « Mirrors ReactionService exactly »). Deltas vs le template :
1. Table `prisma.attachmentReaction` au lieu de `prisma.reaction`.
2. Clé = `(attachmentId, participantId, emoji)` (unique déjà au schéma) — l'option porte `attachmentId` **et** `messageId`.
3. Résolution conversation : `prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } })` (identique au template, le payload garde `messageId`).
4. Pas de mise à jour `Message.reactionSummary` (c'est par-attachment, pas par-message) — l'agrégation se calcule à la lecture.

- [ ] **Step 1: Write the failing test**

```typescript
// services/gateway/src/services/__tests__/AttachmentReactionService.test.ts
import { AttachmentReactionService } from '../AttachmentReactionService';

const makePrismaMock = () => {
  const rows: any[] = [];
  return {
    rows,
    attachmentReaction: {
      findMany: jest.fn(async ({ where }: any) =>
        rows.filter(r => r.attachmentId === where.attachmentId)),
      upsert: jest.fn(async ({ create }: any) => { rows.push(create); return create; }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].attachmentId === where.attachmentId &&
              rows[i].participantId === where.participantId &&
              rows[i].emoji === where.emoji) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      }),
    },
    message: { findUnique: jest.fn(async () => ({ conversationId: 'conv1' })) },
  } as any;
};

describe('AttachmentReactionService', () => {
  it('adds a reaction and aggregates it', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    const agg = await svc.getAttachmentReactions('att1', 'p1');
    expect(agg).toEqual([{ emoji: '❤️', count: 1, reactedByMe: true }]);
  });

  it('removes a reaction', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    await svc.removeAttachmentReaction({ attachmentId: 'att1', participantId: 'p1', emoji: '❤️' });
    expect(await svc.getAttachmentReactions('att1', 'p1')).toEqual([]);
  });

  it('reactedByMe is false for another participant', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '👍' });
    expect(await svc.getAttachmentReactions('att1', 'p2')).toEqual([{ emoji: '👍', count: 1, reactedByMe: false }]);
  });
});
```

- [ ] **Step 2: Run test → fails** : `cd services/gateway && npx jest --config=jest.config.json AttachmentReactionService` → FAIL (module introuvable).

- [ ] **Step 3: Write the service** (clone du template + deltas)

```typescript
// services/gateway/src/services/AttachmentReactionService.ts
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { sanitizeEmoji, isValidEmoji } from '@meeshy/shared/types/reaction';

export interface AddAttachmentReactionOptions {
  attachmentId: string; messageId: string; participantId: string; emoji: string;
}
export interface RemoveAttachmentReactionOptions {
  attachmentId: string; participantId: string; emoji: string;
}
export interface AttachmentReactionAggregationEntry {
  emoji: string; count: number; reactedByMe: boolean;
}

/** Mirrors ReactionService for per-attachment reactions (BUG2 A'). */
export class AttachmentReactionService {
  private static readonly MAX_REACTIONS_PER_USER = 1;
  constructor(private readonly prisma: PrismaClient) {}

  async addAttachmentReaction(o: AddAttachmentReactionOptions): Promise<void> {
    const emoji = sanitizeEmoji(o.emoji);
    if (!isValidEmoji(emoji)) throw new Error('Invalid emoji');
    const existing = await this.prisma.attachmentReaction.findMany({
      where: { attachmentId: o.attachmentId, participantId: o.participantId },
      select: { emoji: true },
    });
    const set = new Set(existing.map(r => r.emoji));
    if (set.size >= AttachmentReactionService.MAX_REACTIONS_PER_USER && !set.has(emoji)) {
      // remplace l'ancienne (1 emoji/user/PJ, miroir ReactionService)
      await this.prisma.attachmentReaction.deleteMany({
        where: { attachmentId: o.attachmentId, participantId: o.participantId },
      });
    }
    await this.prisma.attachmentReaction.upsert({
      where: { attachmentId_participantId_emoji: {
        attachmentId: o.attachmentId, participantId: o.participantId, emoji } },
      create: { attachmentId: o.attachmentId, messageId: o.messageId, participantId: o.participantId, emoji },
      update: {},
    });
  }

  async removeAttachmentReaction(o: RemoveAttachmentReactionOptions): Promise<void> {
    await this.prisma.attachmentReaction.deleteMany({
      where: { attachmentId: o.attachmentId, participantId: o.participantId, emoji: sanitizeEmoji(o.emoji) },
    });
  }

  async getAttachmentReactions(
    attachmentId: string, currentParticipantId: string
  ): Promise<AttachmentReactionAggregationEntry[]> {
    const rows = await this.prisma.attachmentReaction.findMany({
      where: { attachmentId }, select: { emoji: true, participantId: true },
    });
    const byEmoji = new Map<string, { count: number; reactedByMe: boolean }>();
    for (const r of rows) {
      const e = byEmoji.get(r.emoji) ?? { count: 0, reactedByMe: false };
      e.count += 1;
      if (r.participantId === currentParticipantId) e.reactedByMe = true;
      byEmoji.set(r.emoji, e);
    }
    return Array.from(byEmoji.entries()).map(([emoji, v]) => ({ emoji, count: v.count, reactedByMe: v.reactedByMe }));
  }

  async resolveConversationId(messageId: string): Promise<string | null> {
    const m = await this.prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
    return m?.conversationId ?? null;
  }
}
```

> ⚠️ Vérifier le nom exact de la clé composite Prisma (`attachmentId_participantId_emoji`) générée par `@@unique([attachmentId, participantId, emoji])` dans `packages/shared/prisma/client` ; ajuster si le client la nomme autrement.

- [ ] **Step 4: Run test → passes** : `cd services/gateway && npx jest --config=jest.config.json AttachmentReactionService` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add services/gateway/src/services/AttachmentReactionService.ts services/gateway/src/services/__tests__/AttachmentReactionService.test.ts
git commit -m "feat(gateway): AttachmentReactionService — réactions par-image (BUG2 A')"
```

---

## Task 3: `AttachmentReactionHandler` socket + registration

**Files:**
- Create: `services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts`
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts` (registration, mirror la registration de `ReactionHandler`)

**Méthode :** cloner `ReactionHandler.ts:49-222` (handleReactionAdd/Remove). Delta : payload `{ attachmentId, messageId, emoji }` ; résout conversation via `service.resolveConversationId(messageId)` ; broadcast `SERVER_EVENTS.ATTACHMENT_REACTION_ADDED/REMOVED` avec `AttachmentReactionUpdateEventData` (recalcule l'agrégation via `getAttachmentReactions`).

- [ ] **Step 1: Write the handler**

```typescript
// services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts
import { Server, Socket } from 'socket.io';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { AttachmentReactionService } from '../../services/AttachmentReactionService';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'AttachmentReactionHandler' });

interface Deps {
  io: Server;
  service: AttachmentReactionService;
  resolveParticipantId: (socket: Socket, conversationId: string) => Promise<string | null>;
}

export class AttachmentReactionHandler {
  constructor(private deps: Deps) {}

  async handleAdd(socket: Socket, data: { attachmentId: string; messageId: string; emoji: string },
                  cb?: (r: { success: boolean; error?: string }) => void): Promise<void> {
    try {
      const conversationId = await this.deps.service.resolveConversationId(data.messageId);
      if (!conversationId) { cb?.({ success: false, error: 'message not found' }); return; }
      const participantId = await this.deps.resolveParticipantId(socket, conversationId);
      if (!participantId) { cb?.({ success: false, error: 'not a participant' }); return; }
      await this.deps.service.addAttachmentReaction({ ...data, participantId });
      const aggregation = await this.deps.service.getAttachmentReactions(data.attachmentId, participantId);
      this.deps.io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.ATTACHMENT_REACTION_ADDED, {
        attachmentId: data.attachmentId, messageId: data.messageId, conversationId, participantId,
        emoji: data.emoji, action: 'added', aggregation, timestamp: new Date().toISOString(),
      });
      cb?.({ success: true });
    } catch (e) {
      logger.error('attachment reaction add failed', { error: e });
      cb?.({ success: false, error: 'internal' });
    }
  }

  async handleRemove(socket: Socket, data: { attachmentId: string; messageId: string; emoji: string },
                     cb?: (r: { success: boolean; error?: string }) => void): Promise<void> {
    try {
      const conversationId = await this.deps.service.resolveConversationId(data.messageId);
      if (!conversationId) { cb?.({ success: false, error: 'message not found' }); return; }
      const participantId = await this.deps.resolveParticipantId(socket, conversationId);
      if (!participantId) { cb?.({ success: false, error: 'not a participant' }); return; }
      await this.deps.service.removeAttachmentReaction({ attachmentId: data.attachmentId, participantId, emoji: data.emoji });
      const aggregation = await this.deps.service.getAttachmentReactions(data.attachmentId, participantId);
      this.deps.io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED, {
        attachmentId: data.attachmentId, messageId: data.messageId, conversationId, participantId,
        emoji: data.emoji, action: 'removed', aggregation, timestamp: new Date().toISOString(),
      });
      cb?.({ success: true });
    } catch (e) {
      logger.error('attachment reaction remove failed', { error: e });
      cb?.({ success: false, error: 'internal' });
    }
  }
}
```

- [ ] **Step 2: Register the handler** — dans `MeeshySocketIOManager.ts`, trouver où `ReactionHandler` est instancié + ses `socket.on(CLIENT_EVENTS.REACTION_ADD, ...)` câblés (grep `REACTION_ADD` / `reactionHandler`). Mirror :
```typescript
// près de la registration de ReactionHandler
const attachmentReactionService = new AttachmentReactionService(this.prisma);
const attachmentReactionHandler = new AttachmentReactionHandler({
  io: this.io, service: attachmentReactionService,
  resolveParticipantId: /* réutiliser le même resolver que ReactionHandler */,
});
socket.on(CLIENT_EVENTS.ATTACHMENT_REACTION_ADD, (d, cb) => attachmentReactionHandler.handleAdd(socket, d, cb));
socket.on(CLIENT_EVENTS.ATTACHMENT_REACTION_REMOVE, (d, cb) => attachmentReactionHandler.handleRemove(socket, d, cb));
```
> Réutiliser exactement le mécanisme de résolution `participantId` de `ReactionHandler` (grep son `resolveParticipantId`/équivalent) — ne pas réinventer.

- [ ] **Step 3: Typecheck** : `cd services/gateway && npx tsc --noEmit` → 0 erreur hors pré-existant.

- [ ] **Step 4: Commit**
```bash
git add services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts services/gateway/src/socketio/MeeshySocketIOManager.ts
git commit -m "feat(gateway): handler socket attachment:reaction-* + registration (BUG2 A')"
```

---

## Task 4: Sérialiser les réactions agrégées sur l'attachment

**Files:**
- Modify: `services/gateway/src/socketio/serializeAttachmentForSocket.ts` (ajouter `reactions`)
- Modify: la query qui charge les attachments du message (REST `GET /messages` + `message:new`) pour `include` les `attachmentReactions`
- Modify: `packages/shared/types/api-schemas.ts` (déclarer `reactions` sur l'attachment du `messageSchema`, sinon fast-json-stringify le strippe)

- [ ] **Step 1: Étendre `serializeAttachmentForSocket`** — la fonction reçoit `raw` (la row Prisma attachment, désormais avec `attachmentReactions` inclus). Ajouter dans le `return {...}` :
```typescript
    reactions: aggregateAttachmentReactions(
      (raw as { attachmentReactions?: { emoji: string; participantId: string }[] }).attachmentReactions,
      currentParticipantId
    ),
```
et le helper pur en bas du fichier :
```typescript
function aggregateAttachmentReactions(
  rows: { emoji: string; participantId: string }[] | undefined,
  currentParticipantId: string | undefined
): { emoji: string; count: number; reactedByMe: boolean }[] {
  if (!rows || rows.length === 0) return [];
  const byEmoji = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const r of rows) {
    const e = byEmoji.get(r.emoji) ?? { count: 0, reactedByMe: false };
    e.count += 1;
    if (currentParticipantId && r.participantId === currentParticipantId) e.reactedByMe = true;
    byEmoji.set(r.emoji, e);
  }
  return Array.from(byEmoji.entries()).map(([emoji, v]) => ({ emoji, count: v.count, reactedByMe: v.reactedByMe }));
}
```
> `serializeAttachmentForSocket` doit recevoir `currentParticipantId` (ajouter le paramètre ; les appelants l'ont déjà via le contexte du destinataire — grep les call sites).

- [ ] **Step 2: Inclure la relation dans la query** — partout où les attachments du message sont chargés (`messageSelect`/`include` dans `routes/conversations/messages.ts` + le builder du payload `message:new`), ajouter `attachmentReactions: { select: { emoji: true, participantId: true } }` à l'`include` des `attachments`. Grep `attachments: { include` / `attachments: true` dans le chemin message.

- [ ] **Step 3: Déclarer `reactions` au schéma de réponse** — dans `packages/shared/types/api-schemas.ts`, sur la définition de l'attachment du `messageSchema`, ajouter :
```typescript
            reactions: { type: 'array', items: { type: 'object', properties: {
              emoji: { type: 'string' }, count: { type: 'number' }, reactedByMe: { type: 'boolean' }
            } } },
```

- [ ] **Step 4: Typecheck** : `cd services/gateway && npx tsc --noEmit` → 0 erreur hors pré-existant.

- [ ] **Step 5: Commit**
```bash
git add services/gateway/src/socketio/serializeAttachmentForSocket.ts services/gateway/src/routes/conversations/messages.ts packages/shared/types/api-schemas.ts
git commit -m "feat(gateway): sérialiser les réactions agrégées par-attachment (BUG2 A')"
```

---

## Task 5: SDK — `MeeshyMessageAttachment.reactions` + `AttachmentReactionSummary`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` (struct ~929)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/AttachmentReactionDecodingTests.swift` *(créer)*

- [ ] **Step 1: Write the failing test** (Swift Testing)
```swift
import Testing
import Foundation
@testable import MeeshySDK

struct AttachmentReactionDecodingTests {
  @Test func attachment_decodes_reactions() throws {
    let json = #"{"id":"a1","fileName":"x","originalName":"x","mimeType":"image/jpeg","fileSize":1,"filePath":"/p","fileUrl":"/u","uploadedBy":"u1","createdAt":"2026-06-11T00:00:00Z","reactions":[{"emoji":"❤️","count":2,"reactedByMe":true}]}"#
    let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
    let att = try dec.decode(MeeshyMessageAttachment.self, from: Data(json.utf8))
    #expect(att.reactions?.count == 1)
    #expect(att.reactions?.first?.emoji == "❤️")
    #expect(att.reactions?.first?.count == 2)
    #expect(att.reactions?.first?.reactedByMe == true)
  }
  @Test func attachment_without_reactions_decodes_nil() throws {
    let json = #"{"id":"a1","fileName":"x","originalName":"x","mimeType":"image/jpeg","fileSize":1,"filePath":"/p","fileUrl":"/u","uploadedBy":"u1","createdAt":"2026-06-11T00:00:00Z"}"#
    let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
    let att = try dec.decode(MeeshyMessageAttachment.self, from: Data(json.utf8))
    #expect(att.reactions == nil)
  }
}
```

- [ ] **Step 2: Run → fails** (type `reactions` absent). Build SDK tests : voir Step 4 pour la commande.

- [ ] **Step 3: Ajouter le type + le champ** — dans `CoreModels.swift`, au-dessus de `MeeshyMessageAttachment` :
```swift
public struct AttachmentReactionSummary: Codable, Sendable, Hashable {
    public let emoji: String
    public let count: Int
    public let reactedByMe: Bool
    public init(emoji: String, count: Int, reactedByMe: Bool) {
        self.emoji = emoji; self.count = count; self.reactedByMe = reactedByMe
    }
}
```
Dans le struct `MeeshyMessageAttachment` (près de `imageVariants` ~ligne 950) :
```swift
    /// BUG2 A' — réactions agrégées par-image (vit dans attachmentsJson, pas de colonne GRDB).
    public var reactions: [AttachmentReactionSummary]?
```
> Si `MeeshyMessageAttachment` a un `CodingKeys` explicite et/ou un `init(from:)` custom, ajouter `case reactions` + `reactions = try c.decodeIfPresent([AttachmentReactionSummary].self, forKey: .reactions)`. Sinon (Codable synthétisé), le champ optionnel `var` suffit.

- [ ] **Step 4: Run → passes**
Run:
```bash
cd packages/MeeshySDK && RB=/tmp/sdk-attreact-$(date +%s).xcresult && rm -rf "$RB" && \
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build \
  -only-testing:MeeshySDKTests/AttachmentReactionDecodingTests \
  -resultBundlePath "$RB" -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | grep -E "Test run|passed|failed"
```
Expected: `Test run with 2 tests ... passed`.

- [ ] **Step 5: Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/AttachmentReactionDecodingTests.swift
git commit -m "feat(sdk): MeeshyMessageAttachment.reactions + AttachmentReactionSummary (BUG2 A')"
```

---

## Task 6: SDK — `MessageSocketManager` listeners + send

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` (listeners ~2065 + emit)

- [ ] **Step 1: Ajouter le publisher + le décodage** — près du publisher des réactions message-level, ajouter un `PassthroughSubject` pour les deltas attachment :
```swift
    /// BUG2 A' — deltas de réactions par-attachment reçus du serveur.
    public let attachmentReactionPublisher = PassthroughSubject<AttachmentReactionDelta, Never>()
```
avec le type (dans le SDK) :
```swift
public struct AttachmentReactionDelta: Sendable {
    public let attachmentId: String
    public let messageId: String
    public let aggregation: [AttachmentReactionSummary]
}
```

- [ ] **Step 2: Brancher les listeners socket** — miroir de `socket.on("reaction:added")` (~2065) :
```swift
        socket.on("attachment:reaction-added") { [weak self] data, _ in
            self?.emitAttachmentReactionDelta(from: data)
        }
        socket.on("attachment:reaction-removed") { [weak self] data, _ in
            self?.emitAttachmentReactionDelta(from: data)
        }
```
+ le parseur (parse `attachmentId`, `messageId`, `aggregation: [{emoji,count,reactedByMe}]` → `AttachmentReactionDelta` → `attachmentReactionPublisher.send`). Wrapper le listener dans `try/catch` (hazard async EventEmitter).

- [ ] **Step 3: Ajouter les méthodes d'envoi** — miroir des emits de réactions message-level :
```swift
    public func addAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        socket?.emit("attachment:reaction-add", ["attachmentId": attachmentId, "messageId": messageId, "emoji": emoji])
    }
    public func removeAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        socket?.emit("attachment:reaction-remove", ["attachmentId": attachmentId, "messageId": messageId, "emoji": emoji])
    }
```

- [ ] **Step 4: Build SDK** (compile-check)
Run: `cd packages/MeeshySDK && xcodebuild build -scheme MeeshySDK -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -3`
Expected: `BUILD SUCCEEDED`.

- [ ] **Step 5: Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift
git commit -m "feat(sdk): MessageSocketManager attachment:reaction-* send/listen (BUG2 A')"
```

---

# PHASE 1 — App iOS (UI)

## Task 7: `ConversationViewModel.toggleAttachmentReaction` + subscriber

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (près de `toggleReaction` ~2729)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelAttachmentReactionTests.swift` *(créer)*

**Méthode :** miroir de `toggleReaction(messageId:emoji:)` (`:2729-2791`). Persistance optimiste : muter le champ `reactions` de l'attachment ciblé **dans** le message porteur (mettre à jour l'attachment dans `messages` + ré-encoder `attachmentsJson` côté store, miroir de la façon dont `toggleReaction` mute `reactionsJson`). Subscriber `attachmentReactionPublisher` applique les deltas par `(messageId, attachmentId)`.

- [ ] **Step 1: Write the failing test**
```swift
@MainActor
final class ConversationViewModelAttachmentReactionTests: XCTestCase {
  func test_toggleAttachmentReaction_optimisticallyAddsReaction() async {
    let (sut, socket) = makeSUT(withImageMessage: "m1", attachmentId: "a1")
    sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")
    let att = sut.messages.first(where: { $0.id == "m1" })?.attachments.first(where: { $0.id == "a1" })
    XCTAssertEqual(att?.reactions?.first?.emoji, "❤️")
    XCTAssertTrue(att?.reactions?.first?.reactedByMe ?? false)
    XCTAssertEqual(socket.addAttachmentReactionCallCount, 1)
  }
}
```
(Factory `makeSUT` : injecter un `MockMessageSocket` exposant `addAttachmentReaction` + un message image avec 1 attachment. Réutiliser le mock socket existant des tests de réactions message-level.)

- [ ] **Step 2: Run → fails** : `./apps/ios/meeshy.sh test` (ou le filtre du suite) → FAIL (méthode absente).

- [ ] **Step 3: Implémenter** — miroir de `toggleReaction` :
```swift
    func toggleAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        guard let mIdx = messages.firstIndex(where: { $0.id == messageId }),
              let aIdx = messages[mIdx].attachments.firstIndex(where: { $0.id == attachmentId }) else { return }
        var att = messages[mIdx].attachments[aIdx]
        var reactions = att.reactions ?? []
        let mine = reactions.firstIndex(where: { $0.emoji == emoji && $0.reactedByMe })
        if let mine {
            reactions[mine] = AttachmentReactionSummary(emoji: emoji, count: max(0, reactions[mine].count - 1), reactedByMe: false)
            if reactions[mine].count == 0 { reactions.remove(at: mine) }
            messageSocket.removeAttachmentReaction(attachmentId: attachmentId, messageId: messageId, emoji: emoji)
        } else {
            // 1 emoji/user/PJ : retirer un éventuel autre emoji "mine"
            reactions.removeAll { $0.reactedByMe }
            reactions.append(AttachmentReactionSummary(emoji: emoji, count: 1, reactedByMe: true))
            messageSocket.addAttachmentReaction(attachmentId: attachmentId, messageId: messageId, emoji: emoji)
        }
        att.reactions = reactions.isEmpty ? nil : reactions
        messages[mIdx].attachments[aIdx] = att
        persistAttachmentReactions(messageId: messageId)  // ré-encode attachmentsJson (miroir reactionsJson)
    }
```
+ `persistAttachmentReactions` : ré-encoder l'attachment muté dans `attachmentsJson` du `MessageRecord` (réutiliser le helper d'update attachment existant — grep `attachmentsJson` / `injectAttachmentMetadata`).
+ subscriber dans le câblage Combine (près de l'abonnement aux réactions message-level) :
```swift
        messageSocket.attachmentReactionPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] delta in self?.applyAttachmentReactionDelta(delta) }
            .store(in: &cancellables)
```
+ `applyAttachmentReactionDelta(_:)` : remplace `att.reactions` de l'attachment `(delta.messageId, delta.attachmentId)` par `delta.aggregation`, puis `persistAttachmentReactions`.

- [ ] **Step 4: Run → passes** : `./apps/ios/meeshy.sh test` (filtre la suite) → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelAttachmentReactionTests.swift
git commit -m "feat(ios): toggleAttachmentReaction optimiste + subscriber (BUG2 A')"
```

---

## Task 8: UI grille — badge réactions + long-press picker + callback

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift` (`makeGridCell` ~113, `BubbleGridCell` ~246)

- [ ] **Step 1: Ajouter le callback à `BubbleGridCell` + `makeGridCell`** — `BubbleGridCell` gagne `let onReactToAttachment: ((String, String) -> Void)?` (attachmentId, emoji), et `makeGridCell` le passe (threadé depuis l'orchestrateur, Task 9). Gater sur `solo == false` (le solo garde la réaction message-level).

- [ ] **Step 2: Ajouter le badge de réactions** (overlay coin, miroir `viewCountBadge` ~370) — affiché si `attachment.reactions?.isEmpty == false` :
```swift
    @ViewBuilder private var reactionsBadge: some View {
        if let r = attachment.reactions, !r.isEmpty {
            HStack(spacing: 2) {
                ForEach(r.prefix(3), id: \.emoji) { Text($0.emoji).font(.system(size: 12)) }
                if r.reduce(0, { $0 + $1.count }) > 1 {
                    Text("\(r.reduce(0, { $0 + $1.count }))").font(.system(size: 10, weight: .semibold)).foregroundColor(.white)
                }
            }
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background(Capsule().fill(Color.black.opacity(0.5)))
        }
    }
```
et l'ajouter dans le ZStack de la cellule en `.overlay(alignment: .bottomLeading)` (ne pas masquer le download badge bottom-trailing).

- [ ] **Step 3: Ajouter le long-press → picker** — sur le ZStack de cellule (qui n'a que `onTapGesture` ~299, geste libre), gater `solo == false` :
```swift
        .modifier(AttachmentReactionLongPress(
            enabled: !solo && onReactToAttachment != nil,
            onPick: { emoji in onReactToAttachment?(attachment.id, emoji) }
        ))
```
où `AttachmentReactionLongPress` présente `EmojiReactionPicker` (`MeeshyUI/Primitives/EmojiReactionPicker.swift`) en popover/overlay ancré sur la cellule au long-press (réutiliser le mode quick-bar du picker). Pour images protégées (`attachmentIsProtected && !isRevealed`), `enabled = false` (le long-press blur possède le geste).

- [ ] **Step 4: Build** : `./apps/ios/meeshy.sh build` → `Build succeeded`, 0 erreur.

- [ ] **Step 5: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift
git commit -m "feat(ios/bubble): badge réactions + long-press picker par-image (BUG2 A')"
```

---

## Task 9: Câbler `onReactToAttachment` → `toggleAttachmentReaction`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` (l'orchestrateur passe le callback à la grille) + le wrapper `ThemedMessageBubble` / `ConversationView` qui fournit les callbacks de la bulle

- [ ] **Step 1: Threader le callback** — depuis `ConversationView` (où `onAddReaction` etc. sont fournis), ajouter `onReactToAttachment: { attachmentId, emoji in viewModel.toggleAttachmentReaction(attachmentId: attachmentId, messageId: msg.id, emoji: emoji) }` et le faire descendre via `ThemedMessageBubble` → `BubbleStandardLayout` → `visualMediaGrid`/`makeGridCell` → `BubbleGridCell`. Suivre le chemin exact de `onConsumeViewOnce` (déjà threadé jusqu'à la cellule).

- [ ] **Step 2: Build + test** : `./apps/ios/meeshy.sh build` puis `./apps/ios/meeshy.sh test` → vert ; pas de régression (1882+ tests).

- [ ] **Step 3: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/Views/Bubble/ThemedMessageBubble.swift
git commit -m "feat(ios): câbler la réaction par-image grille → toggleAttachmentReaction (BUG2 A')"
```

---

## Validation finale
- [ ] Gateway : `cd services/gateway && npx jest --config=jest.config.json AttachmentReaction` vert + `npx tsc --noEmit` (0 hors `MessageValidator.ts`).
- [ ] SDK : `AttachmentReactionDecodingTests` vert.
- [ ] App : `./apps/ios/meeshy.sh build` + `./apps/ios/meeshy.sh test` vert (pas de régression).
- [ ] **Device** (hors env build) : long-press une image dans une grille multi-images → picker → réaction par-image affichée, optimiste puis confirmée, multi-device ; image solo garde la réaction message-level.

## Hors scope (follow-ups)
View-once/statut par-PJ (cheap, `AttachmentStatusEntry` déjà plumbé) ; réaction par-image sur image solo ; onglet detail-sheet par-PJ ; parité offline-queue ; reaction:request-sync attachment (resync au cold start si nécessaire).
