# iOS Local-First Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter et durcir le cache iOS existant pour atteindre 100 % de couverture cache-first sur toutes les data REST et 100 % d'actions write offline-capable, en fixant les 3 faiblesses architecturales critiques.

**Architecture:** Étend `CacheCoordinator` (27 stores GRDB + Disk déjà en place) avec nouveaux stores manquants. Généralise `clientMessageId` en `clientMutationId` end-to-end iOS↔Gateway pour dédup de toutes les routes write. Fusionne les 3 queues (OfflineQueue, MessageRetryQueue, ReactionQueue) sur la table `outbox` GRDB unique. Migre les anti-patterns UX (`.value` masquant `.stale`, spinners non cache-aware, `@ObservedObject` sur singletons).

**Tech Stack:** Swift 6 + iOS 16+, GRDB SQLite, Socket.IO, Fastify 5, Prisma ORM (MongoDB), XCTest + Swift Testing + Vitest.

**Source spec :** `docs/superpowers/specs/2026-05-11-ios-local-first-complete-design.md`
**Source audit :** `docs/audit-cache-ios-2026-05-11.md`

**Scope :** Sprints 1-4 uniquement (Vague 1). Vague 2 (SyncEngine centralisé, S5-S12) sera un plan séparé.

**Acceptance criteria (Vague 1) :**
- 100 % des écrans data-driven sont cache-first (Communities, Notifications, Calls, Drafts inclus)
- 100 % des actions write idempotent + offline-capable (14 nouvelles `OutboxKind`)
- Gateway dédup via `@@unique(conversationId, clientMessageId)` + `MutationLog (userId, clientMutationId)` actif
- 0 plaintext leak sur stores encrypted (encryption strict throw)
- 0 spinner réseau quand cache `.stale` ou `.fresh`
- 8 brèches structurelles identifiées dans l'audit : adressées #2 partial, #3-#5, #7-#8 (couverture #1 partielle, push staleTTL=∞ et SyncEngine #6 = Vague 2)

---

## Phase 1 status (mise à jour 2026-05-11 fin de matinée)

**Phase 1 (Sprint 1) est de fait TERMINÉE.** Vérification du code actuel a montré :

| Task | État | Référence |
|------|------|-----------|
| 1.1 Strict encryption | ✅ | commit `5e650328` (cette session) |
| 1.2 Throws propagation | ✅ | commit `079aa9aa` (agent parallèle, try? wrap) |
| 1.3 BGProcessingTask flush | ✅ | commit `fd113508` (agent parallèle) |
| 1.4 Prisma partial unique index | ✅ | migration `2026-05-09-message-client-id.mongodb.js` (Phase 4 §6.2 — pre-session) |
| 1.5 Gateway P2002 catch | ✅ | `MessageProcessor.ts:352-495` (Phase 4 §6.2 — pre-session) |
| 1.6 Socket ACK clientMessageId | ✅ | `MessageHandler.ts:_sendResponse` (Phase 4 §6.2 — pre-session) |
| 1.7 iOS reconciliation by cmid | ≈ | Architecture différente du plan mais SUPÉRIEURE : `pendingServerIds[tempId] = serverId` (mapping local optimal), clientMessageId sert uniquement à la dédup serveur. Pas besoin de changer keyspace. |
| 1.8 OfflineQueue async throws | ✅ | `OfflineQueue.swift:225` (Phase 4 §6.2 — pre-session) |

iOS app build green ✅, MeeshyUITests 611/611 passent, encryption test Task 1.1 vert.

Prochaine étape : **Phase 2** (Sprint 2, ci-dessous) qui couvre les domaines à 0 % de couverture cache (Communities, Notifications, Calls, Drafts).

---

## Phase 1 — Sprint 1 : Foundational fixes (3 faiblesses architecturales) [TERMINÉE]

### Task 1.1: GRDBCacheError + DatabaseEncryption strict failure semantics

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Storage/DatabaseEncryption.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreEncryptionTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// Tests/MeeshySDKTests/Cache/GRDBCacheStoreEncryptionTests.swift
import XCTest
@testable import MeeshySDK

final class GRDBCacheStoreEncryptionTests: XCTestCase {
    func test_save_whenEncryptionFails_throwsAndDoesNotPersistPlaintext() async throws {
        let pool = try inMemoryDatabasePool()
        let encryption = ThrowingEncryption()    // stub that returns nil on encrypt()
        let store = GRDBCacheStore<String, TestItem>(
            pool: pool,
            storeName: "tests",
            encrypted: true,
            encryption: encryption
        )
        let item = TestItem(id: "1", title: "secret")

        do {
            try await store.upsert(item, for: "k")
            XCTFail("Expected encryptionFailed throw")
        } catch GRDBCacheError.encryptionFailed { /* ok */ }

        let row: Row? = try await pool.read { db in
            try Row.fetchOne(db, sql: "SELECT encodedData FROM cache_entries WHERE key = ?", arguments: ["k"])
        }
        XCTAssertNil(row, "No row should be persisted on encryption failure")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/GRDBCacheStoreEncryptionTests/test_save_whenEncryptionFails_throwsAndDoesNotPersistPlaintext
```

Expected: FAIL (no `GRDBCacheError`, no `encryption` parameter, no throwing signature).

- [ ] **Step 3: Add `GRDBCacheError` enum + injection point in `GRDBCacheStore.swift`**

```swift
public enum GRDBCacheError: Error, Sendable {
    case encryptionFailed
    case decryptionFailed
    case poolNotConfigured
}
```

Add `init` parameter `encryption: DatabaseEncryptionProviding = DatabaseEncryption.shared` (extract a protocol `DatabaseEncryptionProviding` from the singleton).

- [ ] **Step 4: Replace `?? json` fallbacks**

At `GRDBCacheStore.swift:278/315/409`, replace:
```swift
let data = encryption.encrypt(json, encrypted: encrypted) ?? json
```
with:
```swift
let data: Data
if encrypted {
    guard let encryptedData = encryption.encrypt(json) else {
        Logger.cache.error("Encryption failed for store \(self.storeName), refusing to persist")
        throw GRDBCacheError.encryptionFailed
    }
    data = encryptedData
} else {
    data = json
}
```

Same for the upsert and mergeUpdate sites.

- [ ] **Step 5: Update method signatures to `async throws` in `CacheStoreProtocols.swift`**

```swift
public protocol MutableCacheStore: ReadableCacheStore {
    func save(_ value: Value, for key: Key) async throws
    func upsert(_ value: Value, for key: Key) async throws
    func mergeUpdate(_ value: Value, for key: Key) async throws
    func invalidate(_ key: Key) async
    func invalidateAll() async
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/GRDBCacheStoreEncryptionTests
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheStoreProtocols.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Storage/DatabaseEncryption.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreEncryptionTests.swift
git commit -m "feat(cache): strict encryption failure semantics, no plaintext fallback"
```

---

### Task 1.2: Fix all MutableCacheStore consumers for new throwing signatures

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheFirstLoader.swift`
- Modify: All call sites of `.save(_)` / `.upsert(_)` / `.mergeUpdate(_)` across SDK and app (~30 sites)

- [ ] **Step 1: Identify all call sites**

```bash
grep -rn '\.save(\|\.upsert(\|\.mergeUpdate(' apps/ios packages/MeeshySDK/Sources \
  --include='*.swift' | grep -v test | grep -v 'await store\.save'
```

Save output to a scratch file. Each line is a candidate site.

- [ ] **Step 2: Wrap each call in `try` (one batch per file)**

For each line in the scratch list, change `await ...save(...)` to `try await ...save(...)`. If the caller is inside a non-throwing function, choose one of:
- Convert caller to `async throws` (preferred for ViewModels)
- Wrap in `do/catch` with explicit error log (`Logger.cache.error("Cache write failed: \(error)")`) for fire-and-forget paths

- [ ] **Step 3: Run full test suite**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```

Expected: all existing tests still PASS (no regressions).

- [ ] **Step 4: Build the iOS app**

```bash
./apps/ios/meeshy.sh build
```

Expected: zero compile errors.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK apps/ios
git commit -m "refactor(cache): propagate throwing signatures to all consumers"
```

---

### Task 1.3: BGProcessingTask for cache flush on terminate

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBackgroundFlushTask.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift:362-414`
- Modify: `apps/ios/Meeshy/MeeshyApp.swift` (register task identifier)
- Modify: `apps/ios/Meeshy/Info.plist` (add `BGTaskSchedulerPermittedIdentifiers`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheBackgroundFlushTests.swift`

- [ ] **Step 1: Write the failing test (using mock BGTask)**

```swift
final class CacheBackgroundFlushTests: XCTestCase {
    func test_flushAll_completesWithin30SecondsBudget() async throws {
        let coordinator = CacheCoordinator.makeForTesting()
        try await coordinator.markDirtyForTest(count: 100)
        let task = CacheBackgroundFlushTask()
        let start = Date()

        await task.run(deadline: start.addingTimeInterval(30))

        XCTAssertEqual(await coordinator.dirtyCountForTest(), 0)
        XCTAssertLessThan(Date().timeIntervalSince(start), 30)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/CacheBackgroundFlushTests
```

Expected: FAIL (`CacheBackgroundFlushTask` does not exist).

- [ ] **Step 3: Create `CacheBackgroundFlushTask.swift`**

```swift
import BackgroundTasks
import os

public final class CacheBackgroundFlushTask: Sendable {
    public static let identifier = "me.meeshy.cache.background-flush"

    public init() {}

    public func register() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.identifier,
            using: nil
        ) { task in
            Task {
                await self.run(task: task as! BGProcessingTask)
            }
        }
    }

    func run(task: BGProcessingTask) async {
        let deadline = Date().addingTimeInterval(25)
        task.expirationHandler = { Logger.cache.warning("Background flush task expired") }
        await run(deadline: deadline)
        task.setTaskCompleted(success: true)
    }

    func run(deadline: Date) async {
        await CacheCoordinator.shared.flushAll(deadline: deadline)
    }
}
```

- [ ] **Step 4: Replace semaphore-based flush in `CacheCoordinator.swift:392-402`**

```swift
let terminate = NotificationCenter.default.addObserver(
    forName: UIApplication.willTerminateNotification,
    object: nil, queue: .main
) { [weak self] _ in
    let request = BGProcessingTaskRequest(identifier: CacheBackgroundFlushTask.identifier)
    request.requiresNetworkConnectivity = false
    request.requiresExternalPower = false
    try? BGTaskScheduler.shared.submit(request)
    Task { await self?.flushAll(deadline: Date().addingTimeInterval(4)) }
}
```

Add `flushAll(deadline: Date)` method that batches all dirty keys of all stores in a single GRDB transaction.

- [ ] **Step 5: Register the task in `MeeshyApp.swift`**

```swift
init() {
    CacheBackgroundFlushTask().register()
}
```

Add to `Info.plist`:
```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>me.meeshy.cache.background-flush</string>
</array>
```

- [ ] **Step 6: Run test and build app**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/CacheBackgroundFlushTests
./apps/ios/meeshy.sh build
```

Expected: test PASS, build green.

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK apps/ios/Meeshy/MeeshyApp.swift apps/ios/Meeshy/Info.plist
git commit -m "feat(cache): BGProcessingTask flush on terminate, drop semaphore race"
```

---

### Task 1.4: Prisma migration — `Message.@@unique(conversationId, clientMessageId)`

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (Message model)
- Create: `scripts/migrations/2026-05-11-dedup-message-clientmessageid.ts`
- Test: `services/gateway/test/integration/message-dedup.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// services/gateway/test/integration/message-dedup.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/prisma';

describe('Message dedup', () => {
  let conversationId: string;
  beforeAll(async () => {
    const conv = await prisma.conversation.create({ data: { /* fixture */ } });
    conversationId = conv.id;
  });

  it('rejects a second message with the same (conversationId, clientMessageId)', async () => {
    const cid = `cid_${crypto.randomUUID().toLowerCase()}`;
    await prisma.message.create({
      data: { conversationId, senderId: 'u1', content: 'hi', clientMessageId: cid }
    });
    await expect(
      prisma.message.create({
        data: { conversationId, senderId: 'u1', content: 'hi again', clientMessageId: cid }
      })
    ).rejects.toThrow(/Unique constraint failed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/gateway && pnpm vitest run test/integration/message-dedup.test.ts
```

Expected: FAIL (duplicate accepted; no unique constraint).

- [ ] **Step 3: Pre-migration data cleanup script**

Create `scripts/migrations/2026-05-11-dedup-message-clientmessageid.ts`:
```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const dupes = await prisma.$runCommandRaw({
    aggregate: 'messages',
    pipeline: [
      { $match: { clientMessageId: { $ne: null } } },
      { $group: { _id: { c: '$conversationId', cid: '$clientMessageId' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ],
    cursor: {}
  });
  // For each group, keep the oldest, delete the rest
  // Implementation here, scoped & logged
}
main().finally(() => prisma.$disconnect());
```

Run the script in dry-run mode first against a prod-anonymized dump.

- [ ] **Step 4: Update `schema.prisma`**

In the `Message` model, replace existing `@@index([conversationId, clientMessageId])` with:
```prisma
@@unique([conversationId, clientMessageId], name: "uniq_conv_client_msg")
```

Run Prisma generate:
```bash
cd packages/shared && pnpm prisma generate
```

- [ ] **Step 5: Apply schema change & rerun test**

```bash
cd services/gateway && pnpm vitest run test/integration/message-dedup.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/prisma/schema.prisma scripts/migrations services/gateway/test
git commit -m "feat(prisma): unique constraint on Message(conversationId, clientMessageId)"
```

---

### Task 1.5: Gateway POST /conversations/:id/messages — `catch P2002`

**Files:**
- Modify: `services/gateway/src/routes/conversations/messages.ts:1191+`
- Modify: `services/gateway/src/services/MessagingService.ts` (handleMessage)
- Test: `services/gateway/test/integration/message-post-dedup.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../helpers/app';

describe('POST /conversations/:id/messages dedup', () => {
  it('returns the existing message when clientMessageId already exists', async () => {
    const app = await buildApp();
    const cid = `cid_${crypto.randomUUID().toLowerCase()}`;
    const first = await request(app.server)
      .post('/api/v1/conversations/conv1/messages')
      .set('Authorization', 'Bearer test')
      .send({ content: 'hello', clientMessageId: cid });
    expect(first.status).toBe(200);
    const firstId = first.body.data.id;

    const second = await request(app.server)
      .post('/api/v1/conversations/conv1/messages')
      .set('Authorization', 'Bearer test')
      .send({ content: 'hello duplicate', clientMessageId: cid });
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(firstId);  // same record, no doublon
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/gateway && pnpm vitest run test/integration/message-post-dedup.test.ts
```

Expected: FAIL (second POST creates duplicate or 500s on unique violation).

- [ ] **Step 3: Implement `catch P2002`**

In `MessagingService.handleMessage`:
```typescript
import { Prisma } from '@prisma/client';

async handleMessage(params: HandleMessageParams) {
  try {
    return await prisma.message.create({ data: { ...params } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta as any)?.target as string[] | undefined;
      if (target?.includes('clientMessageId')) {
        const existing = await prisma.message.findFirst({
          where: { conversationId: params.conversationId, clientMessageId: params.clientMessageId }
        });
        if (existing) return existing;
      }
    }
    throw err;
  }
}
```

- [ ] **Step 4: Re-run test**

```bash
cd services/gateway && pnpm vitest run test/integration/message-post-dedup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/MessagingService.ts services/gateway/test
git commit -m "feat(gateway): idempotent POST /messages via P2002 catch"
```

---

### Task 1.6: Socket ACK includes clientMessageId

**Files:**
- Modify: `services/gateway/src/socketio/handlers/MessageHandler.ts:861-878` (`_sendResponse`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` (ack decode)
- Test: `services/gateway/test/unit/message-ack.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('MessageHandler._sendResponse', () => {
  it('includes clientMessageId in ack payload', () => {
    const ack = vi.fn();
    const handler = new MessageHandler(/* deps */);
    handler['_sendResponse'](ack, { id: 'srv1', clientMessageId: 'cid_abc' });
    expect(ack).toHaveBeenCalledWith({
      success: true,
      data: { messageId: 'srv1', clientMessageId: 'cid_abc' }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/gateway && pnpm vitest run test/unit/message-ack.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Update `_sendResponse`**

```typescript
private _sendResponse(ack?: (...args: any[]) => void, data?: any) {
  if (!ack) return;
  ack({
    success: true,
    data: { messageId: data?.id, clientMessageId: data?.clientMessageId }
  });
}
```

- [ ] **Step 4: Update iOS decode in `MessageSocketManager.swift`**

```swift
struct MessageAckPayload: Decodable, Sendable {
    let messageId: String
    let clientMessageId: String?
}
```

In the `emitWithAck` callback, decode `MessageAckPayload` and pass `clientMessageId` to the resolver downstream.

- [ ] **Step 5: Run tests**

```bash
cd services/gateway && pnpm vitest run test/unit/message-ack.test.ts
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/MessageSocketManagerTests
```

Expected: PASS on both.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/socketio/handlers/MessageHandler.ts \
        packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift \
        services/gateway/test packages/MeeshySDK/Tests
git commit -m "feat(socket): include clientMessageId in message ack payload"
```

---

### Task 1.7: iOS OutboxDispatcher — reconciliation by clientMessageId

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxDispatcher.swift:129-141`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:221, 781`
- Test: `apps/ios/Meeshy/Tests/ConversationViewModelTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
func test_socketAck_replacesTempId_byServerId_viaClientMessageId() async {
    let vm = ConversationViewModel(...)
    let cid = "cid_abcdef"
    let tempId = "temp_xyz"
    vm.appendOptimisticMessage(tempId: tempId, clientMessageId: cid, content: "hi")

    vm.handleSocketAck(payload: MessageAckPayload(messageId: "srv1", clientMessageId: cid))

    XCTAssertEqual(vm.pendingServerIds[cid], "srv1")
    XCTAssertNil(vm.pendingServerIds[tempId])
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./apps/ios/meeshy.sh test -only-testing:MeeshyTests/ConversationViewModelTests/test_socketAck_replacesTempId_byServerId_viaClientMessageId
```

Expected: FAIL.

- [ ] **Step 3: Update `pendingServerIds` keyspace**

In `ConversationViewModel.swift:221`, change:
```swift
private var pendingServerIds: [String: String] = [:]  // was tempId → serverId
// becomes:
private var pendingServerIds: [String: String] = [:]  // clientMessageId → serverId
```

Update the socket ack handler at line ~781:
```swift
private func handleSocketAck(payload: MessageAckPayload) {
    guard let cid = payload.clientMessageId else { return }
    pendingServerIds[cid] = payload.messageId
    if let optimistic = messages.first(where: { $0.clientMessageId == cid }) {
        optimistic.id = payload.messageId
        optimistic.deliveryStatus = .delivered
    }
}
```

Update OutboxDispatcher.swift:129-141 similarly to publish `OfflineRetrySuccess` keyed by `clientMessageId` (already mostly the case, verify).

- [ ] **Step 4: Run test**

```bash
./apps/ios/meeshy.sh test -only-testing:MeeshyTests/ConversationViewModelTests/test_socketAck_replacesTempId_byServerId_viaClientMessageId
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxDispatcher.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/Meeshy/Tests
git commit -m "fix(ios): reconcile optimistic messages by clientMessageId not tempId"
```

---

### Task 1.8: OfflineQueue.enqueue `async throws` + propagate errors

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift:225`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1317, 1707`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueErrorPropagationTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
func test_enqueue_whenPoolNotConfigured_throws() async {
    let queue = OfflineQueue.makeForTesting(pool: nil)
    do {
        try await queue.enqueue(OfflineQueueItem(...))
        XCTFail("Expected throw")
    } catch OfflineQueueError.poolNotConfigured { /* ok */ }
}

func test_conversationViewModel_sendMessage_offline_surfacesError() async {
    let queue = MockFailingOfflineQueue()
    let vm = ConversationViewModel(offlineQueue: queue, ...)
    let result = await vm.sendMessage(text: "hi")
    XCTAssertFalse(result.success)
    XCTAssertEqual(vm.lastError, .offlineEnqueueFailed)
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/OfflineQueueErrorPropagationTests
```

Expected: FAIL.

- [ ] **Step 3: Change signature**

```swift
public func enqueue(_ item: OfflineQueueItem) async throws { ... }
```

Already throwing internally; just remove the `try?` consumers.

- [ ] **Step 4: Update consumers**

`ConversationViewModel.swift:1317`:
```swift
do {
    try await OfflineQueue.shared.enqueue(queueItem)
} catch {
    Logger.calls.error("Offline enqueue failed: \(error.localizedDescription)")
    self.lastError = .offlineEnqueueFailed
    return SendResult(success: false, error: error)
}
```

Same pattern at `ConversationViewModel.swift:1707` for audio.

- [ ] **Step 5: Run tests**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/OfflineQueueErrorPropagationTests
./apps/ios/meeshy.sh build
```

Expected: PASS, build green.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK apps/ios
git commit -m "fix(offline): propagate OfflineQueue.enqueue errors to caller"
```

---

## Phase 2 — Sprint 2 : Cache coverage extension

### Task 2.1: Add Communities cache policies + stores

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift:49-70`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift:10-44`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CommunityCachePolicyTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
func test_communityPolicies_areDefined() {
    XCTAssertEqual(CachePolicy.communities.ttl, .hours(24))
    XCTAssertEqual(CachePolicy.communities.staleTTL, .infinity)
    XCTAssertEqual(CachePolicy.communityMembers.maxItemCount, 500)
}
```

- [ ] **Step 2: Run test — FAIL**

- [ ] **Step 3: Add policies**

```swift
public static let communities = CachePolicy(
    ttl: .hours(24), staleTTL: .infinity, maxItemCount: 500, storageLocation: .grdb(encrypted: false)
)
public static let communityMembers = CachePolicy(
    ttl: .hours(24), staleTTL: .infinity, maxItemCount: 500, storageLocation: .grdb(encrypted: false)
)
public static let communityFeed = CachePolicy(
    ttl: .hours(6), staleTTL: .minutes(2), maxItemCount: 200, storageLocation: .grdb(encrypted: false)
)
```

In `CacheCoordinator`, add:
```swift
public let communities: GRDBCacheStore<String, MeeshyCommunity> = .init(policy: .communities, storeName: "communities")
public let communityMembers: GRDBCacheStore<String, [CommunityMember]> = .init(policy: .communityMembers, storeName: "communityMembers")
public let communityFeed: GRDBCacheStore<String, [CommunityPost]> = .init(policy: .communityFeed, storeName: "communityFeed")
```

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK
git commit -m "feat(cache): add policies and stores for communities"
```

---

### Task 2.2: CommunityListViewModel cache-first via CacheFirstLoader

**Files:**
- Modify: `apps/ios/Meeshy/Features/Communities/ViewModels/CommunityListViewModel.swift` (verify path)
- Test: `apps/ios/Meeshy/Tests/CommunityListViewModelTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
final class CommunityListViewModelTests: XCTestCase {
    func test_loadFromCache_returnsFreshDataWithoutNetwork() async {
        let service = MockCommunityService()
        let cache = CacheCoordinator.makeForTesting()
        await cache.communities.upsert([MeeshyCommunity.sample()], for: "list")
        let vm = CommunityListViewModel(service: service, cache: cache)

        await vm.load()

        XCTAssertEqual(vm.communities.count, 1)
        XCTAssertEqual(vm.loadState, .cachedFresh)
        XCTAssertEqual(service.listCallCount, 0)
    }

    func test_loadFromCache_whenStale_revalidatesSilently() async {
        let service = MockCommunityService(stubbed: [MeeshyCommunity.sample(id: "fresh")])
        let cache = CacheCoordinator.makeForTesting(staleNow: true)
        await cache.communities.upsert([MeeshyCommunity.sample(id: "stale")], for: "list")
        let vm = CommunityListViewModel(service: service, cache: cache)

        let task = await vm.load()

        XCTAssertEqual(vm.communities.first?.id, "stale")  // shown immediately
        XCTAssertEqual(vm.loadState, .cachedStale)
        await task?.value                                    // wait revalidation
        XCTAssertEqual(vm.communities.first?.id, "fresh")
        XCTAssertEqual(vm.loadState, .loaded)
    }
}
```

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement using `CacheFirstLoader`**

```swift
@MainActor
final class CommunityListViewModel: ObservableObject {
    @Published var communities: [MeeshyCommunity] = []
    @Published var loadState: LoadState = .empty

    private let service: any CommunityServiceProviding
    private let cache: CacheCoordinator
    private var revalidationTask: Task<Void, Never>?

    init(service: any CommunityServiceProviding = CommunityService.shared,
         cache: CacheCoordinator = .shared) {
        self.service = service
        self.cache = cache
    }

    @discardableResult
    func load() async -> Task<Void, Never>? {
        let loader = CacheFirstLoader(store: cache.communities, key: "list")
        revalidationTask = await loader.load(
            fetch: { try await self.service.list() },
            setLoadState: { [weak self] in self?.loadState = $0 },
            apply: { [weak self] in self?.communities = $0 }
        )
        return revalidationTask
    }
}
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Communities apps/ios/Meeshy/Tests
git commit -m "feat(communities): cache-first list via CacheFirstLoader"
```

---

### Task 2.3: CommunityDetailViewModel + CommunityMembersViewModel cache-first

**Files:**
- Modify: `apps/ios/Meeshy/Features/Communities/ViewModels/CommunityDetailViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Communities/ViewModels/CommunityMembersViewModel.swift`
- Test: corresponding test files

- [ ] **Step 1: Write failing tests** — same pattern as Task 2.2 for `detail/:id` and `members/:id`

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** — apply same `CacheFirstLoader` pattern

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(communities): cache-first detail + members"
```

---

### Task 2.4: NotificationListViewModel cache-first

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/NotificationListViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/NotificationsView.swift` (use new VM)
- Test: `apps/ios/Meeshy/Tests/NotificationListViewModelTests.swift`

- [ ] **Step 1: Write the failing test (cache-first pattern)**

```swift
func test_load_consumesExistingNotificationsCacheStore() async {
    // store already declared in CacheCoordinator (notifications, 24h/2m, encrypted, max 200)
    let cache = CacheCoordinator.makeForTesting()
    await cache.notifications.upsert([MeeshyNotification.sample()], for: "list")
    let service = MockNotificationService()
    let vm = NotificationListViewModel(service: service, cache: cache)

    await vm.load()

    XCTAssertEqual(vm.notifications.count, 1)
    XCTAssertEqual(vm.loadState, .cachedFresh)
    XCTAssertEqual(service.listCallCount, 0)
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Create the ViewModel**

Same pattern as Task 2.2 but on `cache.notifications`. Then update `NotificationsView` to use `NotificationListViewModel`:
```swift
@StateObject private var viewModel = NotificationListViewModel()

var body: some View {
    List(viewModel.notifications) { notif in ... }
        .task { await viewModel.load() }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(notifications): cache-first list via existing store"
```

---

### Task 2.5: CallHistory cache + ViewModel

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift` — add `.callHistory`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` — add `callHistory` store
- Create: `apps/ios/Meeshy/Features/Calls/ViewModels/CallHistoryViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Calls/Views/CallHistoryView.swift`
- Test: `apps/ios/Meeshy/Tests/CallHistoryViewModelTests.swift`

- [ ] **Step 1: Write the failing test** — same cache-first pattern with cursor pagination

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```swift
public static let callHistory = CachePolicy(
    ttl: .days(30), staleTTL: .infinity, maxItemCount: 200, storageLocation: .grdb(encrypted: false)
)

// Cache store
public let callHistory: GRDBCacheStore<String, [CallHistoryEntry]> = .init(
    policy: .callHistory, storeName: "callHistory"
)
```

VM as Task 2.2 but on `cache.callHistory`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(calls): cache-first call history"
```

---

### Task 2.6: Drafts store + ConversationDraftManager

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift` — add `.drafts`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` — add `drafts` store
- Create: `apps/ios/Meeshy/Features/Main/Services/ConversationDraftManager.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (restore + save on text change)
- Test: `apps/ios/Meeshy/Tests/ConversationDraftManagerTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
func test_draft_persistsAcrossViewModelInstances() async throws {
    let mgr = ConversationDraftManager(cache: CacheCoordinator.shared)
    try await mgr.save("Hello world", for: "conv1")
    let restored = await mgr.draft(for: "conv1")
    XCTAssertEqual(restored, "Hello world")
}

func test_draft_debouncesWrites() async throws {
    let mgr = ConversationDraftManager(cache: cache, debounce: 0.1)
    for ch in "abcde" {
        try await mgr.save(String(ch), for: "conv1")
    }
    try await Task.sleep(nanoseconds: 200_000_000)
    let saved = await mgr.draft(for: "conv1")
    XCTAssertEqual(saved, "e")  // only final write persisted
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `ConversationDraftManager`**

```swift
public actor ConversationDraftManager {
    private let cache: CacheCoordinator
    private let debounce: TimeInterval
    private var pendingTask: [String: Task<Void, Never>] = [:]

    public init(cache: CacheCoordinator = .shared, debounce: TimeInterval = 0.5) {
        self.cache = cache
        self.debounce = debounce
    }

    public func save(_ text: String, for conversationId: String) async throws {
        pendingTask[conversationId]?.cancel()
        pendingTask[conversationId] = Task { [debounce, cache] in
            try? await Task.sleep(nanoseconds: UInt64(debounce * 1_000_000_000))
            guard !Task.isCancelled else { return }
            try? await cache.drafts.upsert(text, for: conversationId)
        }
    }

    public func draft(for conversationId: String) async -> String? {
        let result = await cache.drafts.load(for: conversationId)
        switch result {
        case .fresh(let t, _), .stale(let t, _): return t
        case .empty, .expired: return nil
        }
    }
}
```

Wire `ConversationViewModel.viewDidAppear` → restore draft, `messageText.didSet` → `save(...)`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(drafts): persistent conversation drafts via cache"
```

---

## Phase 3 — Sprint 3 : Offline queue extension to all write actions

### Task 3.1: Generalize `ClientMutationId` helper

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMutationId.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Utils/ClientMutationIdTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
func test_generate_returnsCmidPrefix() {
    let cmid = ClientMutationId.generate()
    XCTAssertTrue(cmid.hasPrefix("cmid_"))
    XCTAssertEqual(cmid.count, 42)  // "cmid_" + 36 char UUID + 1 dash → 42
}

func test_isValid_acceptsWellFormed() {
    XCTAssertTrue(ClientMutationId.isValid("cmid_550e8400-e29b-41d4-a716-446655440000"))
    XCTAssertFalse(ClientMutationId.isValid("foo_bar"))
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```swift
public enum ClientMutationId {
    public static func generate() -> String {
        "cmid_\(UUID().uuidString.lowercased())"
    }
    public static let regex = #"^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"#
    public static func isValid(_ s: String) -> Bool {
        s.range(of: Self.regex, options: .regularExpression) != nil
    }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sdk): ClientMutationId helper for generalized idempotency"
```

---

### Task 3.2: Extend OutboxKind with 14 new write mutations

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Mutations/` (one file per kind payload struct)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxKindCodableTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
func test_outboxRecord_encodesAndDecodes_allKinds() throws {
    let allKinds = OutboxKind.allCases
    XCTAssertEqual(allKinds.count, 4 + 14)   // 4 existing + 14 new
    for kind in allKinds {
        let payload: Data = try samplePayload(for: kind)
        let record = OutboxRecord(id: "ofq_x", kind: kind, conversationId: "c1",
                                  clientMutationId: ClientMutationId.generate(),
                                  payload: payload, status: .pending, attempts: 0,
                                  lastError: nil, createdAt: Date(), updatedAt: Date(),
                                  nextAttemptAt: Date())
        let encoded = try JSONEncoder().encode(record)
        let decoded = try JSONDecoder().decode(OutboxRecord.self, from: encoded)
        XCTAssertEqual(record.kind, decoded.kind)
    }
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Extend OutboxKind**

```swift
public enum OutboxKind: String, Codable, CaseIterable, Sendable {
    // Existing
    case sendMessage, editMessage, deleteMessage, sendReaction
    // NEW Wave 1
    case markAsRead
    case sendFriendRequest
    case respondFriendRequest
    case blockUser
    case unblockUser
    case createConversation
    case updateConversation
    case updateProfile
    case updateSettings
    case publishStory
    case repostStory
    case createPost
    case toggleLikePost
    case createComment
    case deleteComment
    case toggleLikeComment
}
```

Create one struct per payload in `Persistence/Mutations/`:
- `MarkAsReadPayload`, `SendFriendRequestPayload`, `RespondFriendRequestPayload`, etc.
- Each `Codable`, `Sendable`, includes `clientMutationId: String`

Add `clientMutationId` column to `OutboxRecord` (replaces `clientMessageId` to be more general; legacy `sendMessage` still uses `cid_...` aliased to `clientMutationId`).

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(outbox): extend OutboxKind with 14 new write mutations"
```

---

### Task 3.3: Prisma MutationLog model

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`
- Create: `services/gateway/src/services/MutationLogService.ts`
- Test: `services/gateway/test/integration/mutation-log.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('MutationLog dedup', () => {
  it('returns existing result if clientMutationId already exists for user', async () => {
    const svc = new MutationLogService(prisma);
    const cmid = `cmid_${crypto.randomUUID().toLowerCase()}`;
    const first = await svc.recordOrReturn('u1', cmid, 'blockUser', async () => ({ id: 'srv1' }));
    const second = await svc.recordOrReturn('u1', cmid, 'blockUser', async () => ({ id: 'srv2' }));
    expect(second.id).toBe('srv1');  // dedup
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Add Prisma model**

```prisma
model MutationLog {
  id               String   @id @default(auto()) @map("_id") @db.ObjectId
  userId           String
  clientMutationId String
  kind             String
  resultId         String?
  createdAt        DateTime @default(now())

  @@unique([userId, clientMutationId])
  @@index([createdAt])
}
```

Run `pnpm prisma generate`.

- [ ] **Step 4: Implement MutationLogService**

```typescript
export class MutationLogService {
  constructor(private prisma: PrismaClient) {}

  async recordOrReturn<T>(
    userId: string,
    cmid: string,
    kind: string,
    op: () => Promise<{ id: string } & T>
  ): Promise<{ id: string } & T> {
    const existing = await this.prisma.mutationLog.findUnique({
      where: { userId_clientMutationId: { userId, clientMutationId: cmid } }
    });
    if (existing?.resultId) {
      // Fetch the original result based on kind
      const result = await this.fetchByKind(kind, existing.resultId);
      if (result) return result as { id: string } & T;
    }
    const created = await op();
    await this.prisma.mutationLog.upsert({
      where: { userId_clientMutationId: { userId, clientMutationId: cmid } },
      create: { userId, clientMutationId: cmid, kind, resultId: created.id },
      update: { resultId: created.id }
    });
    return created;
  }
}
```

- [ ] **Step 5: Run — PASS**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(gateway): MutationLog table for mutation idempotency"
```

---

### Task 3.4: Gateway middleware for clientMutationId header

**Files:**
- Create: `services/gateway/src/middleware/clientMutationId.ts`
- Modify: `services/gateway/src/server.ts` (register middleware)
- Test: `services/gateway/test/unit/clientMutationIdMiddleware.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('clientMutationId middleware', () => {
  it('extracts X-Client-Mutation-Id header into request.clientMutationId', async () => {
    const app = Fastify();
    app.register(clientMutationIdPlugin);
    app.get('/test', (req, reply) => reply.send({ cmid: req.clientMutationId }));
    const res = await app.inject({
      method: 'GET', url: '/test',
      headers: { 'x-client-mutation-id': 'cmid_abc' }
    });
    expect(res.json().cmid).toBe('cmid_abc');
  });

  it('rejects invalid cmid format', async () => {
    const res = await app.inject({
      method: 'GET', url: '/test',
      headers: { 'x-client-mutation-id': 'invalid' }
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement plugin**

```typescript
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const CMID_REGEX = /^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

declare module 'fastify' {
  interface FastifyRequest { clientMutationId?: string; }
}

const clientMutationIdPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const raw = req.headers['x-client-mutation-id'];
    if (typeof raw !== 'string') return;
    if (!CMID_REGEX.test(raw)) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_MUTATION_ID', message: 'Invalid cmid format' } });
    }
    req.clientMutationId = raw;
  });
};

export default fp(clientMutationIdPlugin);
```

- [ ] **Step 4: Register in server.ts**

```typescript
await app.register(clientMutationIdPlugin);
```

- [ ] **Step 5: Run — PASS**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(gateway): clientMutationId middleware for idempotent writes"
```

---

### Task 3.5: Apply MutationLog dedup to friend-request, block, profile, settings routes

**Files:**
- Modify: `services/gateway/src/routes/friends.ts:186` (send + respond)
- Modify: `services/gateway/src/routes/users/profile.ts` (PATCH /profile)
- Modify: `services/gateway/src/routes/users/settings.ts`
- Modify: `services/gateway/src/routes/users/block.ts` (POST/DELETE)
- Modify: `services/gateway/src/routes/posts/likes.ts`
- Modify: `services/gateway/src/routes/posts/comments.ts`
- Test: `services/gateway/test/integration/mutation-dedup-routes.test.ts`

- [ ] **Step 1: Write failing tests (one per route)**

For each route, write a test:
```typescript
it('POST /friend-requests is idempotent via cmid', async () => {
  const cmid = `cmid_${crypto.randomUUID().toLowerCase()}`;
  const a = await request(app).post('/api/v1/friend-requests')
    .set('Authorization', 'Bearer u1').set('X-Client-Mutation-Id', cmid)
    .send({ targetUserId: 'u2' });
  const b = await request(app).post('/api/v1/friend-requests')
    .set('Authorization', 'Bearer u1').set('X-Client-Mutation-Id', cmid)
    .send({ targetUserId: 'u2' });
  expect(a.body.data.id).toBe(b.body.data.id);
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Apply MutationLog wrap**

In each route handler:
```typescript
fastify.post('/friend-requests', async (req, reply) => {
  const userId = req.userId;
  const cmid = req.clientMutationId;
  const op = async () => await friendRequestService.send(userId, req.body.targetUserId);
  const result = cmid
    ? await mutationLogService.recordOrReturn(userId, cmid, 'sendFriendRequest', op)
    : await op();
  return sendSuccess(reply, result);
});
```

Same pattern for the other 5 routes.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(gateway): apply MutationLog dedup to 6 write routes"
```

---

### Task 3.6: Merge ReactionQueue and MessageRetryQueue into OutboxFlusher

**Files:**
- Delete: `apps/ios/Meeshy/Features/Main/Services/MessageRetryQueue.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReactionQueue.swift` (cleanup)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxFlusher.swift` (handle all kinds)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxFlusherUnifiedTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
func test_outboxFlusher_dispatchesAllKinds() async {
    let cache = CacheCoordinator.makeForTesting()
    let queue = OfflineQueue.makeForTesting()
    let dispatcher = MockMutationDispatcher()
    let flusher = OutboxFlusher(queue: queue, dispatcher: dispatcher)
    try await queue.enqueue(.markAsRead(messageId: "m1", cmid: ClientMutationId.generate()))
    try await queue.enqueue(.sendReaction(messageId: "m1", emoji: "👍", cmid: ClientMutationId.generate()))
    try await queue.enqueue(.blockUser(userId: "u2", cmid: ClientMutationId.generate()))

    await flusher.drain()

    XCTAssertEqual(dispatcher.dispatchedKinds, [.markAsRead, .sendReaction, .blockUser])
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Extend OutboxFlusher to dispatch by kind**

```swift
public actor OutboxFlusher {
    private let queue: OfflineQueue
    private let dispatcher: any MutationDispatching

    public func drain() async {
        let pending = await queue.pendingRecords()
        for record in pending {
            await dispatch(record)
        }
    }

    private func dispatch(_ record: OutboxRecord) async {
        do {
            switch record.kind {
            case .sendMessage: try await dispatcher.send(record)
            case .editMessage: try await dispatcher.edit(record)
            // ... all kinds
            case .blockUser: try await dispatcher.blockUser(record)
            // ...
            }
            await queue.dequeue(record.id)
        } catch {
            await queue.markFailed(record.id, error: error)
        }
    }
}
```

Implement `MutationDispatcher` with one method per kind, each calling the corresponding REST route with `X-Client-Mutation-Id: record.clientMutationId`.

- [ ] **Step 4: Delete MessageRetryQueue.swift**

Migrate consumers (`ConversationViewModel`) to call `OfflineQueue.enqueue(.sendMessage(...))` directly when online and rely on `OutboxFlusher` for retry.

- [ ] **Step 5: Run tests — PASS**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/OutboxFlusherUnifiedTests
./apps/ios/meeshy.sh build
```

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(outbox): unify ReactionQueue + MessageRetryQueue into OutboxFlusher"
```

---

### Task 3.7: Wire each new mutation kind from ViewModels to OfflineQueue

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift` (block/unblock)
- Modify: `apps/ios/Meeshy/Features/Contacts/ViewModels/RequestsViewModel.swift` (respond)
- Modify: `apps/ios/Meeshy/Features/Contacts/Views/ContactsListView.swift` (send friend req)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift` (updateProfile)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/SettingsViewModel.swift` (updateSettings)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift` (like, comment)
- Test: one integration test per kind

- [ ] **Step 1: Write the failing test (per kind, example: blockUser)**

```swift
func test_blockUser_enqueuesMutationWhenOffline_appliesOptimistic() async {
    NetworkMonitor.setForTesting(isOnline: false)
    let queue = OfflineQueue.makeForTesting()
    let vm = UserProfileViewModel(offlineQueue: queue, user: .sample(id: "u2"))

    try await vm.blockUser()

    XCTAssertTrue(vm.isBlocked)
    let pending = await queue.pendingRecords()
    XCTAssertTrue(pending.contains { $0.kind == .blockUser })
}
```

- [ ] **Step 2: Run all 14 failing tests — FAIL**

- [ ] **Step 3: Apply pattern in each VM**

```swift
func blockUser() async throws {
    let cmid = ClientMutationId.generate()
    let snapshot = self.user.isBlocked
    self.user.isBlocked = true                       // optimistic
    do {
        try await offlineQueue.enqueue(.blockUser(userId: user.id, cmid: cmid))
    } catch {
        self.user.isBlocked = snapshot               // rollback
        throw error
    }
}
```

Replicate for the 13 other kinds.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ios): route 14 write actions through OfflineQueue with optimistic+rollback"
```

---

### Task 3.8: MutationLog cleanup cron job (30 days)

**Files:**
- Create: `services/gateway/src/cron/mutationLogCleanup.ts`
- Modify: `services/gateway/src/cron/index.ts`
- Test: `services/gateway/test/integration/mutation-log-cleanup.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('deletes MutationLog records older than 30 days', async () => {
  const old = await prisma.mutationLog.create({
    data: { userId: 'u1', clientMutationId: 'cmid_old', kind: 'blockUser',
            createdAt: new Date(Date.now() - 31 * 86400_000) }
  });
  const recent = await prisma.mutationLog.create({
    data: { userId: 'u1', clientMutationId: 'cmid_recent', kind: 'blockUser' }
  });
  await runMutationLogCleanup();
  expect(await prisma.mutationLog.findUnique({ where: { id: old.id } })).toBeNull();
  expect(await prisma.mutationLog.findUnique({ where: { id: recent.id } })).not.toBeNull();
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```typescript
export async function runMutationLogCleanup() {
  const cutoff = new Date(Date.now() - 30 * 86400_000);
  await prisma.mutationLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
}
```

Register in `cron/index.ts` with `node-cron`: `'0 3 * * *'` (daily at 03:00).

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(gateway): daily cron to prune MutationLog older than 30 days"
```

---

## Phase 4 — Sprint 4 : UX local-first

### Task 4.1: SwiftLint custom rule `cacheresult_no_value`

**Files:**
- Modify: `.swiftlint.yml`
- Test: `apps/ios/scripts/swiftlint-self-test.sh`

- [ ] **Step 1: Write the failing self-test**

```bash
#!/bin/bash
set -e
echo 'let x = result.value' > /tmp/bad.swift
swiftlint lint --no-cache --config .swiftlint.yml /tmp/bad.swift | grep cacheresult_no_value
```

- [ ] **Step 2: Run — FAIL (rule not yet defined)**

- [ ] **Step 3: Add rule to `.swiftlint.yml`**

```yaml
custom_rules:
  cacheresult_no_value:
    name: "CacheResult .value usage"
    regex: '\\.load\\([^)]*\\)\\.value'
    message: "Do not use CacheResult.value directly. Switch on .fresh/.stale/.expired/.empty."
    severity: error
    excluded:
      - ".*Tests/.*"
```

- [ ] **Step 4: Run self-test — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "ci(swiftlint): enforce no .value on CacheResult outside tests"
```

---

### Task 4.2: Migrate `.value` site #1 — ConversationListViewModel:1209

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:1209`
- Test: `apps/ios/Meeshy/Tests/ConversationListViewModelTests.swift` (add SWR test)

- [ ] **Step 1: Write the failing test**

```swift
func test_loadStaleMessages_revalidatesSilently_keepsStaleVisible() async {
    let cache = CacheCoordinator.makeForTesting(staleNow: true)
    await cache.messages.upsert([Message.sample(content: "stale")], for: "conv1")
    let service = MockMessageService(stubbed: [Message.sample(content: "fresh")])
    let vm = ConversationListViewModel(messageService: service, cache: cache)

    let task = await vm.loadMessagesPreview(conversationId: "conv1")

    XCTAssertEqual(vm.messagesPreview["conv1"]?.first?.content, "stale")
    await task?.value
    XCTAssertEqual(vm.messagesPreview["conv1"]?.first?.content, "fresh")
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Replace `.value` with switch**

At `ConversationListViewModel.swift:1209`:
```swift
// AVANT
let cached = await CacheCoordinator.shared.messages.load(for: conversationId).value ?? []

// APRÈS
let result = await CacheCoordinator.shared.messages.load(for: conversationId)
switch result {
case .fresh(let cached, _):
    self.messagesPreview[conversationId] = cached
case .stale(let cached, _):
    self.messagesPreview[conversationId] = cached
    return Task { await self.revalidateMessages(conversationId) }
case .expired, .empty:
    return Task { await self.fetchAndApplyMessages(conversationId) }
}
return nil
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(ux): SWR pattern for messages preview in conversation list"
```

---

### Task 4.3: Migrate remaining 6 `.value` sites

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift:252, 333`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift:313`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1886`
- Modify: `apps/ios/Meeshy/Features/Main/Views/UserStatsView.swift:194`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ParticipantService.swift` (3 sites)
- Test: 7 new SWR tests (one per site)

- [ ] **Step 1: Write 7 failing tests** — same SWR shape as Task 4.2

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Apply switch pattern to each site**

(Identical structure to Task 4.2, no repetition needed here.)

- [ ] **Step 4: Run — PASS, and SwiftLint passes**

```bash
swiftlint --config .swiftlint.yml apps/ios packages/MeeshySDK/Sources
```

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(ux): SWR pattern for 7 remaining CacheResult.value sites"
```

---

### Task 4.4: Branch existing skeletons into list views

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`

- [ ] **Step 1: Write the failing snapshot/UI test**

```swift
func test_conversationListView_showsSkeletonOnEmptyLoading() throws {
    let vm = ConversationListViewModel.makeForTesting(loadState: .loading, conversations: [])
    let view = ConversationListView(viewModel: vm)
    let inspectee = try view.inspect().find(SkeletonConversationRow.self)
    XCTAssertNotNil(inspectee)
}

func test_conversationListView_hidesSkeleton_whenCacheStale() throws {
    let vm = ConversationListViewModel.makeForTesting(loadState: .cachedStale, conversations: [.sample()])
    let view = ConversationListView(viewModel: vm)
    XCTAssertThrowsError(try view.inspect().find(SkeletonConversationRow.self))
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Replace ProgressView with conditional skeleton**

In `ConversationListView`:
```swift
if viewModel.loadState == .loading && viewModel.conversations.isEmpty {
    ForEach(0..<6, id: \.self) { _ in SkeletonConversationRow() }
} else {
    ForEach(viewModel.conversations) { ... }
}
```

Same pattern in `ConversationView` with `SkeletonMessageBubble`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ux): branch skeleton placeholders into list views"
```

---

### Task 4.5: Create missing skeletons (Profile, Story, Feed)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonProfileHeader.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonStoryThumb.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonFeedPost.swift`
- Modify: 3 corresponding consuming views

- [ ] **Step 1: Write 3 failing UI tests** — same shape as Task 4.4

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Create the 3 skeleton views**

Reuse `SkeletonShape` and `.skeletonShimmer()` from existing `SkeletonConversationRow`. Each view mirrors the dimensions and structure of its real counterpart.

Branch in `ProfileView`, `StoryTrayView`, `FeedView` under the same `loadState == .loading && data.isEmpty` guard.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ux): add profile/story/feed skeletons and wire into views"
```

---

### Task 4.6: Offline badge + retry button on message bubbles

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MessageBubble.swift` (or equivalent)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift` (add `retryItem(_:)`)
- Test: `apps/ios/Meeshy/Tests/MessageBubbleTests.swift`

- [ ] **Step 1: Write the failing UI test**

```swift
func test_messageBubble_showsHourglassWhenPendingAndOffline() throws {
    let msg = Message.sample(deliveryStatus: .pending)
    NetworkMonitor.setForTesting(isOnline: false)
    let view = MessageBubble(message: msg)
    XCTAssertNoThrow(try view.inspect().find(text: "⏳"))
}

func test_messageBubble_showsRetryButtonWhenFailed() throws {
    let msg = Message.sample(deliveryStatus: .failed)
    let view = MessageBubble(message: msg)
    XCTAssertNoThrow(try view.inspect().find(button: "Retry"))
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement the badges + retry**

```swift
struct DeliveryBadge: View {
    let status: DeliveryStatus
    let isOnline: Bool
    let onRetry: () -> Void
    var body: some View {
        switch status {
        case .pending where !isOnline: Text("⏳").accessibilityLabel("Pending offline")
        case .failed:
            Button(action: onRetry) { Label("Retry", systemImage: "arrow.clockwise") }
        case .sending: ProgressView().controlSize(.mini)
        case .delivered, .read: EmptyView()
        }
    }
}
```

Add `retryItem(_:)` in `OfflineQueue` that re-enqueues a failed/exhausted record as pending.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ux): offline hourglass + retry button on message bubbles"
```

---

### Task 4.7: ConnectionBanner `.syncing` state

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConnectionBanner.swift:22`
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/ConnectionStatusViewModel.swift`
- Test: `apps/ios/Meeshy/Tests/ConnectionBannerTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
func test_connectionBanner_showsSyncing_whenOnlineWithPendingOutbox() async throws {
    let queue = OfflineQueue.makeForTesting()
    try await queue.enqueue(.blockUser(userId: "u2", cmid: ClientMutationId.generate()))
    NetworkMonitor.setForTesting(isOnline: true)
    let vm = ConnectionStatusViewModel(queue: queue)

    XCTAssertEqual(vm.status, .syncing)

    await queue.simulateDrain()
    XCTAssertEqual(vm.status, .connected)
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `ConnectionStatusViewModel`**

```swift
@MainActor
final class ConnectionStatusViewModel: ObservableObject {
    @Published var status: ConnectionStatus = .connected

    private let queue: OfflineQueue
    private var cancellables: Set<AnyCancellable> = []

    init(queue: OfflineQueue = .shared, monitor: any NetworkMonitorProviding = NetworkMonitor.shared) {
        self.queue = queue
        Publishers.CombineLatest(
            monitor.isOnlinePublisher,
            queue.pendingCountPublisher
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] isOnline, pending in
            guard let self else { return }
            self.status =
                !isOnline ? .offline :
                pending > 0 ? .syncing :
                .connected
        }
        .store(in: &cancellables)
    }
}
```

Replace `@ObservedObject` on singletons in `ConnectionBanner.swift:7-8` with `@StateObject var status = ConnectionStatusViewModel()`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ux): ConnectionBanner syncing state via ConnectionStatusViewModel"
```

---

### Task 4.8: Replace `@ObservedObject` singletons (ThemeManager + 6 views)

**Files:**
- Modify: `apps/ios/Meeshy/MeeshyApp.swift:16`
- Modify: `apps/ios/Meeshy/Features/Auth/Views/SecurityView.swift:12, 24`
- Modify: `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift:12`
- Modify: `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift:10-11`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift:13`
- Modify: `apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift:13`

- [ ] **Step 1: Write a UI perf test (count `body` calls)**

```swift
func test_meeshyApp_doesNotRerenderOnThemeChange() {
    let app = MeeshyApp()
    let renderCount = TrackRenderCount(view: app.body)
    ThemeManager.shared.toggleTheme()
    XCTAssertEqual(renderCount.value, 1, "Should not re-render app on theme change")
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Replace singleton observers**

`MeeshyApp.swift:16`:
```swift
// AVANT
@ObservedObject private var theme = ThemeManager.shared

// APRÈS
@Environment(\.colorScheme) private var colorScheme
private var theme: ThemeManager { ThemeManager.shared }
```

Same approach for 6 other views (only observe properties actually used; for stable singletons, just read `.shared` lazily).

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "perf(ux): drop @ObservedObject on singletons in 7 views"
```

---

### Task 4.9: Optimistic + rollback for block/friend-request/profile updates

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift` (block/unblock)
- Modify: `apps/ios/Meeshy/Features/Contacts/ViewModels/RequestsViewModel.swift` (accept/reject)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift` (avatar/bio/displayName)
- Test: corresponding test files

- [ ] **Step 1: Write failing tests (one per action)**

```swift
func test_blockUser_appliesOptimisticAndRollsBackOnExhaustion() async {
    let queue = MockExhaustingQueue()
    let vm = UserProfileViewModel(offlineQueue: queue, user: .sample(id: "u2"))

    do {
        try await vm.blockUser()
    } catch { /* expected */ }

    XCTAssertFalse(vm.user.isBlocked)  // rolled back after exhaustion
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement optimistic + observe outbox status**

```swift
func blockUser() async throws {
    let cmid = ClientMutationId.generate()
    let snapshot = self.user.isBlocked
    self.user.isBlocked = true
    do {
        try await offlineQueue.enqueue(.blockUser(userId: user.id, cmid: cmid))
        observeOutcome(cmid: cmid, rollback: { [weak self] in self?.user.isBlocked = snapshot })
    } catch {
        self.user.isBlocked = snapshot
        throw error
    }
}

private func observeOutcome(cmid: String, rollback: @escaping @MainActor () -> Void) {
    Task { @MainActor in
        for await event in await OfflineQueue.shared.outcomeStream(for: cmid) {
            switch event {
            case .applied: return
            case .exhausted: rollback(); showToast("Action n'a pas pu être synchronisée")
            }
        }
    }
}
```

Repeat for `accept`, `reject`, `updateProfile`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ux): optimistic+rollback for block/friend-request/profile updates"
```

---

## Vague 1 — Definition of Done

Avant de marquer Vague 1 complète, vérifier collectivement :

- [ ] Tous les tests SDK passent : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro'`
- [ ] Tous les tests gateway passent : `cd services/gateway && pnpm vitest run`
- [ ] Build iOS green : `./apps/ios/meeshy.sh build`
- [ ] SwiftLint passe : `swiftlint --strict apps/ios packages/MeeshySDK/Sources`
- [ ] Manual smoke test airplane mode : 10 actions write (1 par `OutboxKind` nouveau) → reconnect → 100 % appliquées
- [ ] Manual smoke test cache chaud : ouvrir 10 écrans data-driven → 0 spinner visible
- [ ] Aucun usage de `CacheResult.value` hors tests (SwiftLint rule active)
- [ ] Matrice `docs/cache-coverage.md` mise à jour (Communities, Notifications, Calls, Drafts cochés)
- [ ] Mise à jour `tasks/lessons.md` avec lessons apprises pendant l'exécution

**Tag git :** `ios-local-first-wave1-complete`

---

## Suite : Vague 2

Une fois Vague 1 mergée et stabilisée (~2 semaines de prod-soak recommandé), générer le plan Vague 2 :

```
docs/superpowers/plans/2026-XX-XX-ios-local-first-wave2-syncengine.md
```

Couvrant les sprints 5-12 de la spec : `/api/v1/sync` endpoint, `_seq` sur 53 events Socket.IO, `SyncEngine` actor, migration progressive des 16 ViewModels vers `SyncEngine.observe(_:)`, conflict resolver pluggable, gap recovery, perf tuning.
