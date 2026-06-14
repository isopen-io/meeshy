# Capture d'engagement des posts (iOS) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturer une session d'engagement structurée (temps passé + micro-actions) pour chaque consommation d'un post (story/status/reel/post), persistée durablement et envoyée par batch au backend, sans modifier les structures existantes.

**Architecture:** SDK fournit les modèles `Sendable` + un `EngagementOutbox` (actor SQLite autonome calqué sur `ConversationStateOutbox`) + `PostService.recordEngagement`. L'app fournit un `EngagementTracker` (@MainActor) qui décide quand begin/checkpoint/end, applique le gating consentement et le seuil qualifié, accumule dwell + watch + actions, et pousse des sessions opaques vers l'outbox. Le backend ajoute un modèle Prisma append-only `PostEngagement` + un endpoint d'ingestion idempotent.

**Tech Stack:** Swift 6 (SDK `swiftLanguageMode(.v6)`, core nonisolated par défaut ; MeeshyUI `defaultIsolation(MainActor)`), GRDB (SQLite), XCTest (SDK + app), SwiftUI ; Fastify 5 + Prisma (MongoDB) + Zod + Jest (gateway).

**Spec de référence:** `docs/superpowers/specs/2026-06-14-ios-post-engagement-capture-design.md`

---

## Ajustement vs spec (découverte d'exploration)

Le spec proposait « 2ᵉ instance de `OutboxFlusher` ». L'exploration a montré que `OutboxFlusher` est **typé en dur sur `OutboxRecord`** (table `outbox`, `OutboxKind`) et **ne peut pas** piloter une autre table. Le bon modèle réutilisable est **`ConversationStateOutbox`** (`packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStateOutbox.swift`) : un `actor` autonome avec son propre `DatabaseQueue` dédié, sa table, son `createSchema`, son `flush(via:)`, backoff, init test-injectable `init(dbPath:clock:)`. **`EngagementOutbox` clone ce modèle.** Tout le reste du spec est inchangé.

---

## File Structure

**SDK — `packages/MeeshySDK/Sources/MeeshySDK/`**
- Create `Models/EngagementModels.swift` — `EngagementSession`, `EngagementAction`, `WatchSample`, `EngagementSurface`, `ActionType` (value types `Codable, Sendable, Hashable`).
- Create `Store/EngagementOutbox.swift` — actor SQLite (table `engagement_sessions`, lifecycle open/finalized, enqueueOpen/checkpoint/finalize/flush/bootSweep/purge).
- Modify `Services/PostService.swift` — protocol `PostServiceProviding` + `recordEngagement(_:)`.

**SDK UI — `packages/MeeshySDK/Sources/MeeshyUI/Media/`**
- Modify `SharedAVPlayerManager.swift` — seam `watchSamples` (PassthroughSubject) émis sur play/tick~10s/pause/end, sans toucher `reportWatchProgress`.

**App — `apps/ios/Meeshy/`**
- Create `Features/Main/Services/EngagementTracker.swift` — @MainActor singleton (begin/recordAction/attachWatchSource/checkpoint/end, gating consent, seuil qualifié).
- Create `Features/Main/Services/EngagementDispatcher.swift` — `EngagementDispatching` impl (appelle `PostService.recordEngagement`) + `EngagementFlushTrigger` + `EngagementRetryScheduler`.
- Create `Features/Main/Views/Modifiers/TrackEngagementModifier.swift` — `.trackEngagement(postId:contentType:surface:)`.
- Modify `Core/DependencyContainer.swift` — 2ᵉ pool/chemin engagement (ou injecter le chemin dans `EngagementOutbox.shared`).
- Modify `MeeshyApp.swift` — boot sweep+flush engagement, checkpoint au `.background`, observe reconnexion.
- Modify `Features/Main/Services/BackgroundTransitionCoordinator.swift` — flush engagement dans `resumeFromBackground()`.
- Modify `Features/Main/Views/PostDetailView.swift`, `ReelsPlayerView.swift`, `Features/Story/.../StoryViewerView.swift`, `Features/Main/Services/StatusBubbleController.swift` — branchement.
- Modify `apps/ios/Meeshy.xcodeproj/project.pbxproj` — entrées des 3 nouveaux fichiers app.
- Modify `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` — purge `engagement_sessions` dans `reset()`.

**Backend — gateway + shared**
- Modify `packages/shared/prisma/schema.prisma` — modèle `PostEngagement` + relations `Post`/`User`.
- Modify `services/gateway/src/routes/posts/types.ts` — `EngagementBatchSchema` (Zod).
- Modify `services/gateway/src/routes/posts/interactions.ts` — `POST /posts/engagement/batch`.
- Modify `services/gateway/src/services/PostService.ts` — `recordEngagementBatch(...)`.
- Modify `services/gateway/src/middleware/rate-limiter.ts` — ajouter `'engagement'` au type.

**Tests**
- `packages/MeeshySDK/Tests/MeeshySDKTests/Models/EngagementModelsTests.swift`
- `packages/MeeshySDK/Tests/MeeshySDKTests/Store/EngagementOutboxTests.swift`
- `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceTests.swift` (ajout)
- `apps/ios/MeeshyTests/Unit/Services/EngagementTrackerTests.swift`
- `services/gateway/src/__tests__/posts-engagement.test.ts`

**Commandes de test**
- SDK : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/<Suite> 2>&1 | xcbeautify`
- App : `./apps/ios/meeshy.sh test`
- Gateway : `cd services/gateway && pnpm jest src/__tests__/posts-engagement.test.ts`

---

# LOT 1 — SDK : modèles + outbox + service

## Task 1.1 — Modèles d'engagement (value types)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/EngagementModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/EngagementModelsTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// EngagementModelsTests.swift
import XCTest
@testable import MeeshySDK

final class EngagementModelsTests: XCTestCase {
    private func makeSession() -> EngagementSession {
        EngagementSession(
            sessionId: "11111111-1111-1111-1111-111111111111",
            userId: "u1",
            postId: "p1",
            contentType: .reel,
            surface: .reels,
            startedAt: Date(timeIntervalSince1970: 1_700_000_000),
            dwellMs: 4200,
            watchMs: 3900,
            mediaDurationMs: 15000,
            completed: false,
            truncated: false,
            consent: "granted",
            actions: [EngagementAction(type: .replayed, atMs: 1200)],
            watchSamples: [WatchSample(positionMs: 0, atMs: 0), WatchSample(positionMs: 3900, atMs: 3900)]
        )
    }

    func test_session_roundTrips_throughCodable_withSortedKeys() throws {
        let session = makeSession()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]   // iOS 26 key-order non-déterministe
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(session)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(EngagementSession.self, from: data)

        XCTAssertEqual(decoded, session)
    }

    func test_contentType_usesUppercaseRawValues() {
        XCTAssertEqual(EngagementSession.ContentType.post.rawValue, "POST")
        XCTAssertEqual(EngagementSession.ContentType.reel.rawValue, "REEL")
        XCTAssertEqual(EngagementSession.ContentType.story.rawValue, "STORY")
        XCTAssertEqual(EngagementSession.ContentType.status.rawValue, "STATUS")
    }

    func test_session_isSendableValueType_equatableByValue() {
        XCTAssertEqual(makeSession(), makeSession())
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/EngagementModelsTests 2>&1 | xcbeautify`
Expected: FAIL — "cannot find 'EngagementSession' in scope".

- [ ] **Step 3: Write minimal implementation**

```swift
// EngagementModels.swift
import Foundation

/// One micro-action recorded during a consumption session.
/// `atMs` is the monotonic offset from the session start (NOT wall-clock).
public struct EngagementAction: Codable, Sendable, Hashable {
    public enum ActionType: String, Codable, Sendable, Hashable, CaseIterable {
        case openedComments, tappedProfile, expandedText, replayed, muted, unmuted
        case paused, resumed, swipedAway, reacted, shared, bookmarked, commented, reported
    }
    public let type: ActionType
    public let atMs: Int
    public init(type: ActionType, atMs: Int) { self.type = type; self.atMs = atMs }
}

/// One video playback position sample (heartbeat).
public struct WatchSample: Codable, Sendable, Hashable {
    public let positionMs: Int
    public let atMs: Int
    public init(positionMs: Int, atMs: Int) { self.positionMs = positionMs; self.atMs = atMs }
}

/// A finalized (or crash-recovered) consumption session for one post on one surface.
public struct EngagementSession: Codable, Sendable, Hashable {
    public enum ContentType: String, Codable, Sendable, Hashable {
        case post = "POST", reel = "REEL", story = "STORY", status = "STATUS"
    }
    public enum Surface: String, Codable, Sendable, Hashable {
        case detail, reels, storyViewer, statusBubble
    }

    public let sessionId: String
    public let userId: String
    public let postId: String
    public let contentType: ContentType
    public let surface: Surface
    public let startedAt: Date
    public let dwellMs: Int
    public let watchMs: Int?
    public let mediaDurationMs: Int?
    public let completed: Bool
    public let truncated: Bool
    public let consent: String
    public let actions: [EngagementAction]
    public let watchSamples: [WatchSample]

    public init(sessionId: String, userId: String, postId: String,
                contentType: ContentType, surface: Surface, startedAt: Date,
                dwellMs: Int, watchMs: Int?, mediaDurationMs: Int?,
                completed: Bool, truncated: Bool, consent: String,
                actions: [EngagementAction], watchSamples: [WatchSample]) {
        self.sessionId = sessionId; self.userId = userId; self.postId = postId
        self.contentType = contentType; self.surface = surface; self.startedAt = startedAt
        self.dwellMs = dwellMs; self.watchMs = watchMs; self.mediaDurationMs = mediaDurationMs
        self.completed = completed; self.truncated = truncated; self.consent = consent
        self.actions = actions; self.watchSamples = watchSamples
    }
}

public typealias EngagementSurface = EngagementSession.Surface
```

- [ ] **Step 4: Run test to verify it passes**

Run: same as Step 2.
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/EngagementModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/EngagementModelsTests.swift
git commit -m "feat(sdk): modèles EngagementSession/Action/WatchSample (Codable/Sendable)"
```

---

## Task 1.2 — EngagementOutbox (actor SQLite, lifecycle 2 états)

Calqué sur `ConversationStateOutbox` (`Store/ConversationStateOutbox.swift`) : `DatabaseQueue` dédié, `createSchema`, `init(dbPath:clock:)` test-injectable, `flush(via:)`, backoff.

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Store/EngagementOutbox.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Store/EngagementOutboxTests.swift`

- [ ] **Step 1: Write the failing test (persist .open invisible to dispatch)**

```swift
// EngagementOutboxTests.swift
import XCTest
import GRDB
@testable import MeeshySDK

final class EngagementOutboxTests: XCTestCase {
    private func makeOutbox() -> EngagementOutbox {
        let path = FileManager.default.temporaryDirectory
            .appendingPathComponent("engagement-\(UUID().uuidString).db").path
        return EngagementOutbox(dbPath: path)
    }

    private func makeSession(_ id: String, dwellMs: Int = 4000) -> EngagementSession {
        EngagementSession(
            sessionId: id, userId: "u1", postId: "p1", contentType: .post, surface: .detail,
            startedAt: Date(timeIntervalSince1970: 1_700_000_000), dwellMs: dwellMs,
            watchMs: nil, mediaDurationMs: nil, completed: false, truncated: false,
            consent: "granted", actions: [], watchSamples: []
        )
    }

    func test_openSession_isNotDispatched() async {
        let outbox = makeOutbox()
        await outbox.beginSession(makeSession("s1"))   // lifecycle = .open

        let dispatched = SyncBox<[String]>([])
        await outbox.flush { session in
            dispatched.mutate { $0.append(session.sessionId) }
            return .completed
        }
        XCTAssertEqual(dispatched.value, [], "open sessions must be invisible to dispatch")
    }

    func test_finalizedSession_isDispatchedThenDeleted() async {
        let outbox = makeOutbox()
        await outbox.beginSession(makeSession("s1"))
        await outbox.finalizeSession(makeSession("s1", dwellMs: 5000))   // → .finalized

        let dispatched = SyncBox<[String]>([])
        await outbox.flush { session in
            dispatched.mutate { $0.append(session.sessionId) }
            return .completed
        }
        XCTAssertEqual(dispatched.value, ["s1"])

        // Second flush: row deleted on success → nothing left.
        let again = SyncBox<[String]>([])
        await outbox.flush { s in again.mutate { $0.append(s.sessionId) }; return .completed }
        XCTAssertEqual(again.value, [])
    }

    func test_bootSweep_finalizesOrphanOpenSessions_truncated() async {
        let path = FileManager.default.temporaryDirectory
            .appendingPathComponent("engagement-\(UUID().uuidString).db").path
        let first = EngagementOutbox(dbPath: path)
        await first.beginSession(makeSession("s1"))   // simulate crash: stays .open

        let recovered = EngagementOutbox(dbPath: path)  // re-open same file
        await recovered.bootSweep()

        let dispatched = SyncBox<[EngagementSession]>([])
        await recovered.flush { s in dispatched.mutate { $0.append(s) }; return .completed }
        XCTAssertEqual(dispatched.value.map(\.sessionId), ["s1"])
        XCTAssertTrue(dispatched.value.first?.truncated == true)
    }

    func test_purge_dropsRowsOlderThanCutoff() async {
        let outbox = makeOutbox()
        await outbox.beginSession(makeSession("old"))
        await outbox.finalizeSession(makeSession("old"))
        await outbox.purge(olderThan: Date(timeIntervalSince1970: 9_999_999_999), maxRows: 5000)

        let dispatched = SyncBox<[String]>([])
        await outbox.flush { s in dispatched.mutate { $0.append(s.sessionId) }; return .completed }
        XCTAssertEqual(dispatched.value, [], "rows older than cutoff are purged before flush")
    }
}

/// Tiny thread-safe box for test assertions across the actor boundary.
final class SyncBox<T>: @unchecked Sendable {
    private let lock = NSLock(); private var _value: T
    init(_ v: T) { _value = v }
    var value: T { lock.lock(); defer { lock.unlock() }; return _value }
    func mutate(_ f: (inout T) -> Void) { lock.lock(); f(&_value); lock.unlock() }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/EngagementOutboxTests 2>&1 | xcbeautify`
Expected: FAIL — "cannot find 'EngagementOutbox' in scope".

- [ ] **Step 3: Write minimal implementation**

```swift
// EngagementOutbox.swift
import Foundation
import GRDB

public enum EngagementDispatchOutcome: Sendable, Equatable {
    case completed
    case failedPermanent
    case failedTransient
}

public actor EngagementOutbox {
    public static let shared = EngagementOutbox()

    private let db: DatabaseQueue
    private let now: @Sendable () -> Date

    // Backoff identique au pattern existant : min(60s, 2^attempts × 5s)
    private static func backoff(attempts: Int) -> TimeInterval {
        min(60, pow(2.0, Double(max(0, attempts))) * 5)
    }

    public init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let path = dir.appendingPathComponent("meeshy_engagement_outbox.db").path
        self.db = Self.makeQueue(path: path)
        self.now = { Date() }
    }

    /// Test-only / injectable init.
    public init(dbPath: String, clock: @escaping @Sendable () -> Date = { Date() }) {
        self.db = Self.makeQueue(path: dbPath)
        self.now = clock
    }

    private static func makeQueue(path: String) -> DatabaseQueue {
        let queue = (try? DatabaseQueue(path: path)) ?? (try! DatabaseQueue())
        try? createSchema(in: queue)
        return queue
    }

    private static func createSchema(in db: DatabaseQueue) throws {
        try db.write { db in
            try db.create(table: "engagement_sessions", ifNotExists: true) { t in
                t.column("session_id", .text).primaryKey()       // idempotence
                t.column("lifecycle", .text).notNull()           // "open" | "finalized"
                t.column("payload_json", .text).notNull()        // EngagementSession encodé
                t.column("created_at", .double).notNull()
                t.column("attempts", .integer).notNull().defaults(to: 0)
                t.column("next_retry_at", .double)
            }
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_eng_lifecycle ON engagement_sessions(lifecycle, next_retry_at)")
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_eng_created ON engagement_sessions(created_at)")
        }
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; e.dateEncodingStrategy = .iso8601; return e
    }()
    private static let decoder: JSONDecoder = {
        let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d
    }()

    public func beginSession(_ session: EngagementSession) async {
        guard let json = try? Self.encoder.encode(session),
              let text = String(data: json, encoding: .utf8) else { return }
        let createdAt = now().timeIntervalSince1970
        try? await db.write { db in
            try db.execute(sql: """
                INSERT OR REPLACE INTO engagement_sessions
                (session_id, lifecycle, payload_json, created_at, attempts, next_retry_at)
                VALUES (?, 'open', ?, ?, 0, NULL)
                """, arguments: [session.sessionId, text, createdAt])
        }
    }

    public func finalizeSession(_ session: EngagementSession) async {
        guard let json = try? Self.encoder.encode(session),
              let text = String(data: json, encoding: .utf8) else { return }
        try? await db.write { db in
            // Only finalize rows still .open — never re-touch already-finalized (avoids double-finalize).
            try db.execute(sql: """
                UPDATE engagement_sessions
                SET lifecycle = 'finalized', payload_json = ?, next_retry_at = NULL
                WHERE session_id = ? AND lifecycle = 'open'
                """, arguments: [text, session.sessionId])
        }
    }

    /// Persist the current dwell/watch into the open row (crash-resilience checkpoint).
    public func checkpoint(_ session: EngagementSession) async {
        guard let json = try? Self.encoder.encode(session),
              let text = String(data: json, encoding: .utf8) else { return }
        try? await db.write { db in
            try db.execute(sql: """
                UPDATE engagement_sessions SET payload_json = ?
                WHERE session_id = ? AND lifecycle = 'open'
                """, arguments: [text, session.sessionId])
        }
    }

    /// At boot, finalize orphan .open rows (crashed sessions) with truncated=true.
    public func bootSweep() async {
        let nowTs = now().timeIntervalSince1970
        try? await db.write { db in
            let rows = try Row.fetchAll(db, sql: "SELECT session_id, payload_json FROM engagement_sessions WHERE lifecycle = 'open'")
            for row in rows {
                let id: String = row["session_id"]
                let text: String = row["payload_json"]
                guard let data = text.data(using: .utf8),
                      let s = try? Self.decoder.decode(EngagementSession.self, from: data) else { continue }
                let truncated = EngagementSession(
                    sessionId: s.sessionId, userId: s.userId, postId: s.postId,
                    contentType: s.contentType, surface: s.surface, startedAt: s.startedAt,
                    dwellMs: s.dwellMs, watchMs: s.watchMs, mediaDurationMs: s.mediaDurationMs,
                    completed: s.completed, truncated: true, consent: s.consent,
                    actions: s.actions, watchSamples: s.watchSamples
                )
                guard let json = try? Self.encoder.encode(truncated),
                      let newText = String(data: json, encoding: .utf8) else { continue }
                try db.execute(sql: """
                    UPDATE engagement_sessions SET lifecycle = 'finalized', payload_json = ?, next_retry_at = NULL
                    WHERE session_id = ?
                    """, arguments: [newText, id])
                _ = nowTs
            }
        }
    }

    public func purge(olderThan cutoff: Date, maxRows: Int) async {
        let cutoffTs = cutoff.timeIntervalSince1970
        try? await db.write { db in
            try db.execute(sql: "DELETE FROM engagement_sessions WHERE lifecycle = 'finalized' AND created_at < ?", arguments: [cutoffTs])
            // Row cap — evict oldest finalized beyond maxRows.
            try db.execute(sql: """
                DELETE FROM engagement_sessions WHERE session_id IN (
                  SELECT session_id FROM engagement_sessions WHERE lifecycle = 'finalized'
                  ORDER BY created_at DESC LIMIT -1 OFFSET ?
                )
                """, arguments: [maxRows])
        }
    }

    public func purgeAll() async {
        try? await db.write { db in try db.execute(sql: "DELETE FROM engagement_sessions") }
    }

    public func flush(via dispatch: @Sendable (EngagementSession) async -> EngagementDispatchOutcome) async {
        let nowTs = now().timeIntervalSince1970
        let ready: [(String, EngagementSession, Int)] = (try? await db.read { db -> [(String, EngagementSession, Int)] in
            let rows = try Row.fetchAll(db, sql: """
                SELECT session_id, payload_json, attempts FROM engagement_sessions
                WHERE lifecycle = 'finalized' AND (next_retry_at IS NULL OR next_retry_at <= ?)
                ORDER BY created_at ASC LIMIT 50
                """, arguments: [nowTs])
            return rows.compactMap { row in
                let id: String = row["session_id"]
                let text: String = row["payload_json"]
                let attempts: Int = row["attempts"]
                guard let data = text.data(using: .utf8),
                      let s = try? Self.decoder.decode(EngagementSession.self, from: data) else { return nil }
                return (id, s, attempts)
            }
        }) ?? []

        for (id, session, attempts) in ready {
            let outcome = await dispatch(session)
            switch outcome {
            case .completed:
                try? await db.write { db in try db.execute(sql: "DELETE FROM engagement_sessions WHERE session_id = ?", arguments: [id]) }
            case .failedPermanent:
                try? await db.write { db in try db.execute(sql: "DELETE FROM engagement_sessions WHERE session_id = ?", arguments: [id]) }
            case .failedTransient:
                let next = now().addingTimeInterval(Self.backoff(attempts: attempts + 1)).timeIntervalSince1970
                try? await db.write { db in
                    try db.execute(sql: "UPDATE engagement_sessions SET attempts = attempts + 1, next_retry_at = ? WHERE session_id = ?", arguments: [next, id])
                }
            }
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: same as Step 2. Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Store/EngagementOutbox.swift packages/MeeshySDK/Tests/MeeshySDKTests/Store/EngagementOutboxTests.swift
git commit -m "feat(sdk): EngagementOutbox actor SQLite (lifecycle open/finalized, boot sweep, purge)"
```

---

## Task 1.3 — PostService.recordEngagement

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// Ajouter dans PostServiceTests.swift
func test_recordEngagement_postsBatch_toEngagementEndpoint() async throws {
    let response = APIResponse(success: true, data: ["recorded": 1], error: nil)
    mock.stub("/posts/engagement/batch", result: response)

    let session = EngagementSession(
        sessionId: "s1", userId: "u1", postId: "p1", contentType: .reel, surface: .reels,
        startedAt: Date(timeIntervalSince1970: 1_700_000_000), dwellMs: 4000, watchMs: 3800,
        mediaDurationMs: 15000, completed: false, truncated: false, consent: "granted",
        actions: [], watchSamples: []
    )

    try await service.recordEngagement([session])

    XCTAssertEqual(mock.requestCount, 1)
    XCTAssertEqual(mock.lastRequest?.endpoint, "/posts/engagement/batch")
    XCTAssertEqual(mock.lastRequest?.method, "POST")
}

func test_recordEngagement_emptyArray_doesNotCallNetwork() async throws {
    try await service.recordEngagement([])
    XCTAssertEqual(mock.requestCount, 0)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/PostServiceTests/test_recordEngagement_postsBatch_toEngagementEndpoint 2>&1 | xcbeautify`
Expected: FAIL — "value of type 'PostService' has no member 'recordEngagement'".

- [ ] **Step 3: Write minimal implementation**

Add to the `PostServiceProviding` protocol (near the other declarations):
```swift
func recordEngagement(_ sessions: [EngagementSession]) async throws
```

Add to `PostService` (after `recordImpressions`, ~line 274):
```swift
public func recordEngagement(_ sessions: [EngagementSession]) async throws {
    guard !sessions.isEmpty else { return }
    struct BatchBody: Encodable { let sessions: [EngagementSession] }
    let _: APIResponse<[String: Int]> = try await api.post(
        endpoint: "/posts/engagement/batch",
        body: BatchBody(sessions: sessions)
    )
}
```

> Note: `api.post` uses `APIClient.jsonEncoder` with `.iso8601` dates (confirmed). No consent gating here — gating lives in the app-side `EngagementTracker.begin()` (SDK stays pure).

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/PostServiceTests 2>&1 | xcbeautify`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceTests.swift
git commit -m "feat(sdk): PostService.recordEngagement → POST /posts/engagement/batch"
```

---

# LOT 2 — App : player heartbeat + EngagementTracker + orchestration flush

## Task 2.1 — Seam heartbeat dans SharedAVPlayerManager (MeeshyUI)

Ajoute un publisher de `WatchSample` SANS toucher `reportWatchProgress` (qui reste sur `/attachments/:id/status` — plan séparé).

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Media/SharedAVPlayerWatchSampleTests.swift`

> ⚠️ MeeshyUI tests use the `MeeshySDK-Package` scheme too; the target is `MeeshyUITests`. MeeshyUI has `defaultIsolation(MainActor)` — the test class is `@MainActor`, members on pure helpers need explicit `nonisolated` (see [[feedback-meeshyui-default-isolation]]).

- [ ] **Step 1: Write the failing test**

```swift
// SharedAVPlayerWatchSampleTests.swift
import XCTest
import Combine
@testable import MeeshyUI

@MainActor
final class SharedAVPlayerWatchSampleTests: XCTestCase {
    func test_emitWatchSample_publishesPositionAndOffset() {
        let manager = SharedAVPlayerManager.shared
        var received: [WatchSample] = []
        let c = manager.watchSamples.sink { received.append($0) }
        defer { c.cancel() }

        manager.emitWatchSampleForTesting(positionMs: 2500, atMs: 2500)

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?.positionMs, 2500)
        XCTAssertEqual(received.first?.atMs, 2500)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -only-testing:MeeshyUITests/SharedAVPlayerWatchSampleTests 2>&1 | xcbeautify`
Expected: FAIL — "has no member 'watchSamples'".

- [ ] **Step 3: Write minimal implementation**

In `SharedAVPlayerManager`, add the publisher and the emit points. `WatchSample` is the SDK type (import MeeshySDK is already present).
```swift
// Property (near the other @Published, ~line 34)
public let watchSamples = PassthroughSubject<WatchSample, Never>()
private var watchClockStart: Date?

// Test seam
public func emitWatchSampleForTesting(positionMs: Int, atMs: Int) {
    watchSamples.send(WatchSample(positionMs: positionMs, atMs: atMs))
}

// Helper used at real emit points
private func emitWatchSample(complete: Bool = false) {
    guard let start = watchClockStart else { return }
    let atMs = Int(Date().timeIntervalSince(start) * 1000)
    let posMs = currentTime.isNaN ? 0 : Int(currentTime * 1000)
    watchSamples.send(WatchSample(positionMs: posMs, atMs: max(0, atMs)))
}
```

In `play()` (after `if watchStartTime == nil { watchStartTime = Date() }`):
```swift
    if watchClockStart == nil { watchClockStart = Date() }
    emitWatchSample()   // start sample (position ~0)
```

In `pause()` (before `player?.pause()`):
```swift
    emitWatchSample()
```

In the `addPeriodicTimeObserver` closure, throttle a ~10s heartbeat. Replace the existing observer body to also count ticks:
```swift
let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
var lastHeartbeat: Double = 0
timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
    Task { @MainActor [weak self] in
        guard let self else { return }
        self.currentTime = time.seconds.isNaN ? 0 : time.seconds
        if self.isPlaying, self.currentTime - lastHeartbeat >= 10 {
            lastHeartbeat = self.currentTime
            self.emitWatchSample()
        }
    }
}
```

In the `didPlayToEndTimeNotification` sink, after `self.reportWatchProgress(complete: true)`:
```swift
    self.emitWatchSample(complete: true)
    self.watchClockStart = self.shouldLoop ? Date() : nil
```

- [ ] **Step 4: Run test to verify it passes**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift packages/MeeshySDK/Tests/MeeshyUITests/Media/SharedAVPlayerWatchSampleTests.swift
git commit -m "feat(sdk-ui): seam watchSamples (heartbeat ~10s) sur SharedAVPlayerManager"
```

---

## Task 2.2 — EngagementTracker (@MainActor) : dwell + actions + gating + seuil

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/EngagementTracker.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/EngagementTrackerTests.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj` (entrée du nouveau fichier — voir Task 3.0)

> Design seams for testability: inject the outbox via a protocol, a monotonic clock, the userId, and the consent flag.

- [ ] **Step 1: Write the failing test**

```swift
// EngagementTrackerTests.swift
import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class EngagementTrackerTests: XCTestCase {
    private func makeSUT(consent: Bool = true) -> (EngagementTracker, MockEngagementSink, MutableClockMs) {
        let sink = MockEngagementSink()
        let clock = MutableClockMs()
        let tracker = EngagementTracker(
            sink: sink,
            nowMs: { clock.value },
            userIdProvider: { "u1" },
            consentProvider: { consent }
        )
        return (tracker, sink, clock)
    }

    func test_endSession_aboveThreshold_finalizesWithDwell() async {
        let (tracker, sink, clock) = makeSUT()
        tracker.begin(postId: "p1", contentType: .post, surface: .detail)
        clock.value += 4000
        await tracker.end(surface: .detail)

        XCTAssertEqual(sink.finalized.count, 1)
        XCTAssertEqual(sink.finalized.first?.postId, "p1")
        XCTAssertEqual(sink.finalized.first?.dwellMs, 4000)
        XCTAssertEqual(sink.finalized.first?.consent, "granted")
    }

    func test_endSession_belowThreshold_isDropped_notFinalized() async {
        let (tracker, sink, clock) = makeSUT()
        tracker.begin(postId: "p1", contentType: .reel, surface: .reels)
        clock.value += 400   // < 1000ms dwell and no watch
        await tracker.end(surface: .reels)

        XCTAssertEqual(sink.finalized.count, 0, "sub-threshold sessions are dropped client-side")
    }

    func test_begin_whenConsentDenied_recordsNothing() async {
        let (tracker, sink, clock) = makeSUT(consent: false)
        tracker.begin(postId: "p1", contentType: .post, surface: .detail)
        clock.value += 5000
        await tracker.end(surface: .detail)

        XCTAssertEqual(sink.opened.count, 0)
        XCTAssertEqual(sink.finalized.count, 0)
    }

    func test_recordAction_storesOffsetFromStart() async {
        let (tracker, sink, clock) = makeSUT()
        tracker.begin(postId: "p1", contentType: .post, surface: .detail)
        clock.value += 1200
        tracker.recordAction(.openedComments, surface: .detail)
        clock.value += 2000
        await tracker.end(surface: .detail)

        XCTAssertEqual(sink.finalized.first?.actions.first?.type, .openedComments)
        XCTAssertEqual(sink.finalized.first?.actions.first?.atMs, 1200)
    }

    func test_topmostSurface_pausesUnderlyingDwell() async {
        let (tracker, sink, clock) = makeSUT()
        tracker.begin(postId: "p1", contentType: .post, surface: .detail)
        clock.value += 1000
        tracker.begin(postId: "s1", contentType: .status, surface: .statusBubble)  // overlay on top
        clock.value += 3000                                                          // detail clock paused
        await tracker.end(surface: .statusBubble)
        await tracker.end(surface: .detail)

        let detail = sink.finalized.first { $0.surface == .detail }
        XCTAssertEqual(detail?.dwellMs, 1000, "underlying detail dwell is paused while overlay is active")
    }
}

// Test doubles
final class MockEngagementSink: EngagementSinking {
    var opened: [EngagementSession] = []
    var finalized: [EngagementSession] = []
    func beginSession(_ s: EngagementSession) async { opened.append(s) }
    func checkpoint(_ s: EngagementSession) async {}
    func finalizeSession(_ s: EngagementSession) async { finalized.append(s) }
    func requestFlush() async {}
}
final class MutableClockMs { var value: Int = 0 }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test 2>&1 | grep -A3 EngagementTrackerTests` (or build-for-testing)
Expected: FAIL — "cannot find 'EngagementTracker' / 'EngagementSinking'".

- [ ] **Step 3: Write minimal implementation**

```swift
// EngagementTracker.swift
import Foundation
import MeeshySDK
import os

nonisolated private let engagementLogger = Logger(subsystem: "me.meeshy.app", category: "engagement")

/// Sink the tracker pushes sessions into (durable outbox in production).
public protocol EngagementSinking: Sendable {
    func beginSession(_ s: EngagementSession) async
    func checkpoint(_ s: EngagementSession) async
    func finalizeSession(_ s: EngagementSession) async
    func requestFlush() async
}

@MainActor
final class EngagementTracker {
    static let shared = EngagementTracker()

    private struct ActiveSession {
        let sessionId: String
        let postId: String
        let contentType: EngagementSession.ContentType
        let surface: EngagementSurface
        let startedAtWall: Date
        let consent: String
        var accumulatedMs: Int          // dwell already counted (paused segments)
        var runningSinceMs: Int?        // monotonic ms when the clock (re)started; nil = paused
        var actions: [EngagementAction]
        var watchSamples: [WatchSample]
        var watchMs: Int?
        var mediaDurationMs: Int?
        var completed: Bool
    }

    // Qualified-session thresholds (spec D8).
    private static let minDwellMs = 1000
    private static let minWatchMs = 2000

    private let sink: EngagementSinking
    private let nowMs: () -> Int
    private let userIdProvider: () -> String?
    private let consentProvider: () -> Bool

    private var sessions: [EngagementSurface: ActiveSession] = [:]
    private var topStack: [EngagementSurface] = []

    init(sink: EngagementSinking = EngagementOutboxSink.shared,
         nowMs: @escaping () -> Int = { Int(ProcessInfo.processInfo.systemUptime * 1000) },
         userIdProvider: @escaping () -> String? = { AuthManager.shared.currentUser?.id },
         consentProvider: @escaping () -> Bool = { UserPreferencesManager.shared.privacy.allowAnalytics }) {
        self.sink = sink; self.nowMs = nowMs
        self.userIdProvider = userIdProvider; self.consentProvider = consentProvider
    }

    func begin(postId: String, contentType: EngagementSession.ContentType, surface: EngagementSurface) {
        guard consentProvider(), let userId = userIdProvider() else { return }
        pauseTop()   // topmost-owns-the-clock
        let s = ActiveSession(
            sessionId: UUID().uuidString, postId: postId, contentType: contentType, surface: surface,
            startedAtWall: Date(), consent: "granted", accumulatedMs: 0, runningSinceMs: nowMs(),
            actions: [], watchSamples: [], watchMs: nil, mediaDurationMs: nil, completed: false
        )
        sessions[surface] = s
        topStack.append(surface)
        let session = snapshot(s, userId: userId, truncated: false)
        Task { await sink.beginSession(session) }
    }

    func recordAction(_ type: EngagementAction.ActionType, surface: EngagementSurface) {
        guard var s = sessions[surface] else { return }
        let atMs = currentDwell(of: s)
        s.actions.append(EngagementAction(type: type, atMs: atMs))
        sessions[surface] = s
    }

    /// Push watch-time captured by the surface from the player at finalize (or sample).
    func attachWatch(surface: EngagementSurface, watchMs: Int?, mediaDurationMs: Int?, completed: Bool, samples: [WatchSample]) {
        guard var s = sessions[surface] else { return }
        s.watchMs = watchMs; s.mediaDurationMs = mediaDurationMs
        s.completed = completed; s.watchSamples = samples
        sessions[surface] = s
    }

    func checkpointAll() async {
        guard let userId = userIdProvider() else { return }
        for (_, s) in sessions {
            await sink.checkpoint(snapshot(s, userId: userId, truncated: false))
        }
    }

    func end(surface: EngagementSurface) async {
        guard let userId = userIdProvider(), var s = sessions[surface] else { return }
        s.accumulatedMs = currentDwell(of: s); s.runningSinceMs = nil
        sessions[surface] = nil
        topStack.removeAll { $0 == surface }
        resumeTop()

        let qualifies = s.accumulatedMs >= Self.minDwellMs
            || (s.watchMs ?? 0) >= Self.minWatchMs || s.completed
        guard qualifies else {
            await sink.checkpoint(snapshot(s, userId: userId, truncated: false)) // no-op for dropped; row stays .open → swept later if any
            return
        }
        await sink.finalizeSession(snapshot(s, userId: userId, truncated: false))
        await sink.requestFlush()
    }

    // MARK: - Clock helpers
    private func currentDwell(of s: ActiveSession) -> Int {
        guard let since = s.runningSinceMs else { return s.accumulatedMs }
        return s.accumulatedMs + max(0, nowMs() - since)
    }
    private func pauseTop() {
        guard let top = topStack.last, var s = sessions[top] else { return }
        s.accumulatedMs = currentDwell(of: s); s.runningSinceMs = nil; sessions[top] = s
    }
    private func resumeTop() {
        guard let top = topStack.last, var s = sessions[top], s.runningSinceMs == nil else { return }
        s.runningSinceMs = nowMs(); sessions[top] = s
    }
    private func snapshot(_ s: ActiveSession, userId: String, truncated: Bool) -> EngagementSession {
        EngagementSession(
            sessionId: s.sessionId, userId: userId, postId: s.postId,
            contentType: s.contentType, surface: s.surface, startedAt: s.startedAtWall,
            dwellMs: currentDwell(of: s), watchMs: s.watchMs, mediaDurationMs: s.mediaDurationMs,
            completed: s.completed, truncated: truncated, consent: s.consent,
            actions: s.actions, watchSamples: s.watchSamples
        )
    }
}
```

> `EngagementOutboxSink.shared` is created in Task 2.3. For this task's tests, the mock is injected.

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test 2>&1 | grep -A3 EngagementTrackerTests`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/EngagementTracker.swift apps/ios/MeeshyTests/Unit/Services/EngagementTrackerTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): EngagementTracker @MainActor (dwell monotone, actions, gating consent, seuil qualifié, topmost-clock)"
```

---

## Task 2.3 — Sink durable + dispatcher + orchestration flush

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/EngagementDispatcher.swift` (sink + dispatcher + retry scheduler)
- Modify: `apps/ios/Meeshy/MeeshyApp.swift` (boot sweep + flush + observe reconnect + checkpoint au background)
- Modify: `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift` (flush dans `resumeFromBackground()`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` (`reset()` purge engagement)
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj`
- Test: `apps/ios/MeeshyTests/Unit/Services/EngagementDispatcherTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// EngagementDispatcherTests.swift
import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class EngagementDispatcherTests: XCTestCase {
    private func makeSession(userId: String = "u1") -> EngagementSession {
        EngagementSession(
            sessionId: "s1", userId: userId, postId: "p1", contentType: .post, surface: .detail,
            startedAt: Date(timeIntervalSince1970: 1_700_000_000), dwellMs: 4000, watchMs: nil,
            mediaDurationMs: nil, completed: false, truncated: false, consent: "granted",
            actions: [], watchSamples: []
        )
    }

    func test_dispatch_callsRecord_withSession() async {
        let calls = LockBox<[[EngagementSession]]>([])
        let dispatcher = EngagementDispatcher(
            record: { sessions in calls.mutate { $0.append(sessions) } },
            currentUserId: { "u1" })
        let outcome = await dispatcher.dispatch(makeSession())
        XCTAssertEqual(outcome, .completed)
        XCTAssertEqual(calls.value.first?.first?.sessionId, "s1")
    }

    func test_dispatch_dropsSession_whenUserChanged() async {
        let calls = LockBox<Int>(0)
        let dispatcher = EngagementDispatcher(
            record: { _ in calls.mutate { $0 += 1 } },
            currentUserId: { "u2" })   // current user differs from session.userId == "u1"
        let outcome = await dispatcher.dispatch(makeSession())
        XCTAssertEqual(outcome, .failedPermanent, "session owned by another user must be dropped, not flushed")
        XCTAssertEqual(calls.value, 0)
    }

    func test_dispatch_transientFailure_onThrow() async {
        struct Boom: Error {}
        let dispatcher = EngagementDispatcher(record: { _ in throw Boom() }, currentUserId: { "u1" })
        let outcome = await dispatcher.dispatch(makeSession())
        XCTAssertEqual(outcome, .failedTransient)
    }
}

/// Thread-safe box for assertions across the @Sendable record closure.
final class LockBox<T>: @unchecked Sendable {
    private let lock = NSLock(); private var _value: T
    init(_ v: T) { _value = v }
    var value: T { lock.lock(); defer { lock.unlock() }; return _value }
    func mutate(_ f: (inout T) -> Void) { lock.lock(); f(&_value); lock.unlock() }
}
```

> Protocol conformance: Task 1.3 added `recordEngagement(_:)` to `PostServiceProviding`, so the app's `MockPostService` (apps/ios/MeeshyTests/Mocks/MockPostService.swift) MUST implement it to keep compiling — add `func recordEngagement(_ sessions: [EngagementSession]) async throws {}`. (These tests inject closures directly and don't use the mock.)

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test 2>&1 | grep -A3 EngagementDispatcherTests`
Expected: FAIL — "cannot find 'EngagementDispatcher'".

- [ ] **Step 3: Write minimal implementation**

```swift
// EngagementDispatcher.swift
import Foundation
import Combine
import MeeshySDK

/// Bridges the SDK outbox to the app-side EngagementTracker sink protocol.
public final class EngagementOutboxSink: EngagementSinking {
    public static let shared = EngagementOutboxSink()
    private let outbox: EngagementOutbox
    init(outbox: EngagementOutbox = .shared) { self.outbox = outbox }
    public func beginSession(_ s: EngagementSession) async { await outbox.beginSession(s) }
    public func checkpoint(_ s: EngagementSession) async { await outbox.checkpoint(s) }
    public func finalizeSession(_ s: EngagementSession) async { await outbox.finalizeSession(s) }
    public func requestFlush() async { await EngagementFlushTrigger.flushNow() }
}

/// Dispatches a finalized session to the network, dropping cross-user rows.
/// Closure-based (not protocol-based) so it stays `Sendable` under Swift 6 —
/// `PostServiceProviding` is not Sendable (app mock is a mutable class), so it
/// cannot be stored in a Sendable struct captured by the @Sendable flush closure.
public struct EngagementDispatcher: Sendable {
    private let record: @Sendable ([EngagementSession]) async throws -> Void
    private let currentUserId: @Sendable () -> String?
    public init(record: @escaping @Sendable ([EngagementSession]) async throws -> Void,
                currentUserId: @escaping @Sendable () -> String?) {
        self.record = record; self.currentUserId = currentUserId
    }
    public func dispatch(_ session: EngagementSession) async -> EngagementDispatchOutcome {
        if let uid = currentUserId(), uid != session.userId { return .failedPermanent } // anti cross-user
        do { try await record([session]); return .completed }
        catch { return .failedTransient }
    }
}

@MainActor
enum EngagementFlushTrigger {
    static func flushNow() async {
        let online = NetworkConditionMonitor.shared.isOnline
        guard online else { EngagementRetryScheduler.shared.scheduleSoon(); return }
        let uid = AuthManager.shared.currentUser?.id   // captured String? is Sendable
        let dispatcher = EngagementDispatcher(
            record: { sessions in try await PostService.shared.recordEngagement(sessions) },
            currentUserId: { uid })
        await EngagementOutbox.shared.flush { session in await dispatcher.dispatch(session) }
    }
}

@MainActor
final class EngagementRetryScheduler {
    static let shared = EngagementRetryScheduler()
    private var timer: Task<Void, Never>?
    private var networkCancellable: AnyCancellable?
    private init() {}

    func startObservingNetworkReconnect() {
        networkCancellable = NetworkConditionMonitor.shared.$condition
            .map { $0 != .offline }.removeDuplicates().dropFirst().filter { $0 }
            .sink { _ in Task { @MainActor in await EngagementFlushTrigger.flushNow() } }
    }
    func scheduleSoon() {
        timer?.cancel()
        timer = Task { try? await Task.sleep(nanoseconds: 30 * 1_000_000_000)
            guard !Task.isCancelled else { return }
            await EngagementFlushTrigger.flushNow() }
    }
}
```

> Note: `EngagementDispatcher.currentUserId` defaults to `nil` to stay `@Sendable`; the real userId is injected at the call-site in `EngagementFlushTrigger` (reads `AuthManager` on the main actor).

In `MeeshyApp.swift`, inside the existing boot `Task.detached` (~line 308) after the outbox boot block, add:
```swift
Task { @MainActor in
    await EngagementOutbox.shared.bootSweep()
    await EngagementOutbox.shared.purge(olderThan: Date().addingTimeInterval(-7 * 86400), maxRows: 5000)
    await EngagementFlushTrigger.flushNow()
    EngagementRetryScheduler.shared.startObservingNetworkReconnect()
}
```

In `MeeshyApp.swift`, in the `.background` case of `adaptiveOnChange(of: scenePhase)` (~line 437), add (no network flush at background — see spec §8):
```swift
        Task { await EngagementTracker.shared.checkpointAll() }
```

In `BackgroundTransitionCoordinator.resumeFromBackground()`, after the existing `withBudget("outbox.flush")` block (~line 159):
```swift
await withBudget("engagement.flush") {
    await EngagementFlushTrigger.flushNow()
}
```

In `CacheCoordinator.reset()` (~line 294), add:
```swift
await EngagementOutbox.shared.purgeAll()   // anti cross-user: drop pending engagement on logout
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test 2>&1 | grep -A3 EngagementDispatcherTests`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/EngagementDispatcher.swift apps/ios/Meeshy/MeeshyApp.swift apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift apps/ios/MeeshyTests/Unit/Services/EngagementDispatcherTests.swift apps/ios/MeeshyTests/Mocks/MockPostService.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): orchestration flush engagement (sink durable, dispatcher anti cross-user, boot sweep, checkpoint background, reconnect)"
```

---

# LOT 3 — Surfaces : modificateur + branchement

## Task 3.0 — pbxproj : enregistrer les 3 nouveaux fichiers app

> Classic xcodeproj objectVersion 63 — chaque nouveau `.swift` du target app a besoin de 4 entrées + 2 UUID (PBXBuildFile, PBXFileReference, PBXGroup children, PBXSourcesBuildPhase). Pattern observé : FileReference UUID se termine par `80`, BuildFile par `70` (dérivés). Voir [[feedback-ios-classic-pbxproj]].

Fichiers concernés (déjà créés aux Tasks 2.2/2.3/3.1) :
`EngagementTracker.swift`, `EngagementDispatcher.swift`, `TrackEngagementModifier.swift`.

- [ ] **Step 1: Add PBXFileReference + PBXBuildFile entries** for each file (2 UUIDs/file) in `apps/ios/Meeshy.xcodeproj/project.pbxproj`, e.g.:
```
ENG0000000000000000FREF /* EngagementTracker.swift */ = {isa = PBXFileReference; includeInIndex = 1; lastKnownFileType = sourcecode.swift; path = EngagementTracker.swift; sourceTree = "<group>"; };
ENG0000000000000000BLD /* EngagementTracker.swift in Sources */ = {isa = PBXBuildFile; fileRef = ENG0000000000000000FREF /* EngagementTracker.swift */; };
```
- [ ] **Step 2: Add to the `Services` PBXGroup children** (TrackEngagementModifier under a `Modifiers` group or the existing Views group).
- [ ] **Step 3: Add the BuildFile UUIDs to the app target `PBXSourcesBuildPhase` `files` array.**
- [ ] **Step 4: Verify the project parses**
Run: `xcodebuild -project apps/ios/Meeshy.xcodeproj -list 2>&1 | head` → no parse error.
- [ ] **Step 5: Commit** (folded into the task that creates each file — keep pbxproj changes with their file commits above; this task documents the exact entries).

---

## Task 3.1 — Modificateur `.trackEngagement`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Modifiers/TrackEngagementModifier.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/TrackEngagementModifierTests.swift`

- [ ] **Step 1: Write the failing test** (test the lifecycle mapping logic, not SwiftUI rendering)

```swift
// TrackEngagementModifierTests.swift
import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class TrackEngagementModifierTests: XCTestCase {
    func test_lifecycle_beginOnAppear_endOnDisappear() async {
        let tracker = EngagementTracker(sink: MockEngagementSink(), nowMs: { 0 },
                                        userIdProvider: { "u1" }, consentProvider: { true })
        let coordinator = TrackEngagementCoordinator(
            postId: "p1", contentType: .post, surface: .detail, tracker: tracker)
        coordinator.onAppear()
        await coordinator.onDisappear()
        // No crash + idempotent double-disappear
        await coordinator.onDisappear()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test 2>&1 | grep -A3 TrackEngagementModifierTests`
Expected: FAIL — "cannot find 'TrackEngagementCoordinator'".

- [ ] **Step 3: Write minimal implementation**

```swift
// TrackEngagementModifier.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

@MainActor
final class TrackEngagementCoordinator {
    private let postId: String
    private let contentType: EngagementSession.ContentType
    private let surface: EngagementSurface
    private let tracker: EngagementTracker
    private var active = false

    init(postId: String, contentType: EngagementSession.ContentType,
         surface: EngagementSurface, tracker: EngagementTracker = .shared) {
        self.postId = postId; self.contentType = contentType
        self.surface = surface; self.tracker = tracker
    }
    func onAppear() { guard !active else { return }; active = true
        tracker.begin(postId: postId, contentType: contentType, surface: surface) }
    func onDisappear() async { guard active else { return }; active = false
        await tracker.end(surface: surface) }
}

private struct TrackEngagementModifier: ViewModifier {
    let postId: String
    let contentType: EngagementSession.ContentType
    let surface: EngagementSurface
    @State private var coordinator: TrackEngagementCoordinator?

    func body(content: Content) -> some View {
        content
            .onAppear {
                let c = TrackEngagementCoordinator(postId: postId, contentType: contentType, surface: surface)
                coordinator = c; c.onAppear()
            }
            .onDisappear { let c = coordinator; Task { await c?.onDisappear() } }
    }
}

extension View {
    func trackEngagement(postId: String,
                         contentType: EngagementSession.ContentType,
                         surface: EngagementSurface) -> some View {
        modifier(TrackEngagementModifier(postId: postId, contentType: contentType, surface: surface))
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Modifiers/TrackEngagementModifier.swift apps/ios/MeeshyTests/Unit/Views/TrackEngagementModifierTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): modificateur .trackEngagement (begin onAppear / end onDisappear)"
```

---

## Task 3.2 — Brancher les 4 surfaces

> No new behavior tests here (SwiftUI wiring) — verified by build + the tracker/coordinator unit tests. Each step is a wiring edit; build after each.

- [ ] **Step 1: Post detail** — `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`, on the main `VStack` (~line 415):
```swift
.trackEngagement(postId: postId, contentType: .post, surface: .detail)
```
And replace the truncated-text expand call (~line 804) to also log the action:
```swift
if isTextExpanded {
    EngagementTracker.shared.recordAction(.expandedText, surface: .detail)
    Task { try? await PostService.shared.viewPost(postId: postId, duration: nil) }  // viewPost stays duration-less
}
```

- [ ] **Step 2: Reels** — `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift`, in `adaptiveOnChange(of: viewModel.currentId)` (~line 93), end the previous reel's session pushing watch-time from the player BEFORE the new one begins (use the `old` value):
```swift
.adaptiveOnChange(of: viewModel.currentId) { old, newId in
    let m = SharedAVPlayerManager.shared
    if let old {
        let watchMs = m.currentTime.isNaN ? 0 : Int(m.currentTime * 1000)
        let durMs = m.duration > 0 ? Int(m.duration * 1000) : nil
        EngagementTracker.shared.attachWatch(surface: .reels, watchMs: watchMs,
            mediaDurationMs: durMs, completed: false, samples: [])
        Task { await EngagementTracker.shared.end(surface: .reels) }
        _ = old
    }
    guard let newId else { return }
    HapticFeedback.light()
    EngagementTracker.shared.begin(postId: newId, contentType: .reel, surface: .reels)
    viewModel.recordView(newId)
}
```
And on the reels container `.onDisappear`, end the last open reel session:
```swift
.onDisappear { Task { await EngagementTracker.shared.end(surface: .reels) } }
```

- [ ] **Step 3: Story viewer** — `apps/ios/Meeshy/Features/.../StoryViewerView.swift`, in `viewerContent.onAppear` (~line 379) after `markCurrentViewed()`:
```swift
if let story = currentStory {
    EngagementTracker.shared.begin(postId: story.id, contentType: .story, surface: .storyViewer)
}
```
On `currentStoryIndex`/`currentGroupIndex` change (the existing `adaptiveOnChange` ~line 485), end+begin for the new story; and on the viewer `.onDisappear`, end the open story session. (Use the same `attachWatch` snapshot for video stories before `end`.)

- [ ] **Step 4: Status bubble** — `apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift`, in `show(...)` (~line 41) and the dismiss path:
```swift
// in show(...), after the viewPost Task:
EngagementTracker.shared.begin(postId: statusId, contentType: .status, surface: .statusBubble)
// in the controller's hide/dismiss method:
Task { await EngagementTracker.shared.end(surface: .statusBubble) }
```

- [ ] **Step 5: Build + commit**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.
```bash
git add apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift "apps/ios/Meeshy/Features/Story/"*StoryViewerView.swift apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift
git commit -m "feat(ios): branche .trackEngagement sur detail/reels/story/status (watch-time au switch reel)"
```

---

# LOT 4 — Backend : modèle + endpoint d'ingestion

## Task 4.1 — Modèle Prisma PostEngagement (append-only)

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`

- [ ] **Step 1: Add the model + relations** (style copié de `PostView`/`PostImpression`)

Add the model near `PostImpression`:
```prisma
/// Session d'engagement append-only (temps + actions). N'altère NI PostView NI viewCount.
model PostEngagement {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  sessionId       String   @unique
  postId          String   @db.ObjectId
  userId          String   @db.ObjectId
  contentType     String
  surface         String
  startedAt       DateTime
  dwellMs         Int
  watchMs         Int?
  mediaDurationMs Int?
  completed       Boolean  @default(false)
  truncated       Boolean  @default(false)
  consent         String?
  actions         Json     @default("[]")
  watchSamples    Json     @default("[]")
  createdAt       DateTime @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation("UserPostEngagements", fields: [userId], references: [id])

  @@index([postId])
  @@index([userId])
  @@index([postId, createdAt])
}
```
Add to `model Post` relations block (near `views PostView[]`):
```prisma
  engagements PostEngagement[]
```
Add to `model User` relations block (near `postViews PostView[] @relation("UserPostViews")`):
```prisma
  postEngagements PostEngagement[] @relation("UserPostEngagements")
```

- [ ] **Step 2: Regenerate Prisma client**

Run: `cd packages/shared && pnpm prisma generate`
Expected: "Generated Prisma Client" with no schema error.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(shared): modèle Prisma PostEngagement append-only (sessionId @unique)"
```

---

## Task 4.2 — Zod schema + rate-limit type

**Files:**
- Modify: `services/gateway/src/routes/posts/types.ts`
- Modify: `services/gateway/src/middleware/rate-limiter.ts`

- [ ] **Step 1: Add the Zod schema** (`types.ts`, near `RepostSchema`)
```typescript
export const EngagementActionSchema = z.object({
  type: z.string().max(40),
  atMs: z.number().int().min(0),
});
export const WatchSampleSchema = z.object({
  positionMs: z.number().int().min(0),
  atMs: z.number().int().min(0),
});
export const EngagementSessionSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string(),
  postId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  contentType: z.enum(['POST', 'REEL', 'STORY', 'STATUS']),
  surface: z.string().max(40),
  startedAt: z.string(),
  dwellMs: z.number().int().min(0),
  watchMs: z.number().int().min(0).optional(),
  mediaDurationMs: z.number().int().min(0).optional(),
  completed: z.boolean().default(false),
  truncated: z.boolean().default(false),
  consent: z.string().max(40).optional(),
  actions: z.array(EngagementActionSchema).max(200).default([]),
  watchSamples: z.array(WatchSampleSchema).max(500).default([]),
});
export const EngagementBatchSchema = z.object({
  sessions: z.array(EngagementSessionSchema).min(1).max(50),
});
export type EngagementBatch = z.infer<typeof EngagementBatchSchema>;
```

- [ ] **Step 2: Add `'engagement'` to the rate-limit type** (`rate-limiter.ts:153`)
```typescript
export function createPostRouteRateLimitConfig(
  type: 'create' | 'like' | 'view' | 'comment' | 'impression' | 'engagement'
): object {
  const configs = {
    create: { max: 10, label: 'create' },
    like: { max: 30, label: 'like' },
    view: { max: 60, label: 'view' },
    comment: { max: 20, label: 'comment' },
    impression: { max: 10, label: 'impression' },
    engagement: { max: 20, label: 'engagement' },
  };
  // ... unchanged
```

- [ ] **Step 3: Commit**

```bash
git add services/gateway/src/routes/posts/types.ts services/gateway/src/middleware/rate-limiter.ts
git commit -m "feat(gateway): schéma Zod EngagementBatch + rate-limit 'engagement'"
```

---

## Task 4.3 — PostService.recordEngagementBatch (upsert idempotent, skip-and-continue)

**Files:**
- Modify: `services/gateway/src/services/PostService.ts`
- Test: `services/gateway/src/__tests__/posts-engagement.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// posts-engagement.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../services/PostService';

const mkSession = (over: Partial<any> = {}) => ({
  sessionId: '11111111-1111-1111-1111-111111111111',
  userId: 'u1', postId: '507f1f77bcf86cd799439011', contentType: 'POST', surface: 'detail',
  startedAt: '2026-06-14T00:00:00.000Z', dwellMs: 4000, completed: false, truncated: false,
  actions: [], watchSamples: [], ...over,
});

describe('PostService.recordEngagementBatch', () => {
  let prisma: any;
  let service: PostService;
  beforeEach(() => {
    prisma = {
      post: { findFirst: jest.fn().mockResolvedValue({ id: '507f1f77bcf86cd799439011', authorId: 'author' }) },
      postEngagement: { upsert: jest.fn().mockResolvedValue({}) },
    };
    service = new PostService(prisma as any);
  });

  it('upserts each session by sessionId', async () => {
    const n = await service.recordEngagementBatch([mkSession()], 'u1');
    expect(n).toBe(1);
    expect(prisma.postEngagement.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.postEngagement.upsert.mock.calls[0][0].where).toEqual({ sessionId: '11111111-1111-1111-1111-111111111111' });
  });

  it('skips a session whose post no longer exists, continues the batch', async () => {
    prisma.post.findFirst
      .mockResolvedValueOnce(null) // first post deleted
      .mockResolvedValueOnce({ id: '507f1f77bcf86cd799439012', authorId: 'author' });
    const n = await service.recordEngagementBatch(
      [mkSession({ sessionId: 'a', postId: '507f1f77bcf86cd799439011' }),
       mkSession({ sessionId: 'b', postId: '507f1f77bcf86cd799439012' })], 'u1');
    expect(n).toBe(1);
    expect(prisma.postEngagement.upsert).toHaveBeenCalledTimes(1);
  });

  it('caps dwellMs at 300000 defensively', async () => {
    await service.recordEngagementBatch([mkSession({ dwellMs: 999999 })], 'u1');
    const arg = prisma.postEngagement.upsert.mock.calls[0][0];
    expect(arg.create.dwellMs).toBe(300000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/gateway && pnpm jest src/__tests__/posts-engagement.test.ts`
Expected: FAIL — "recordEngagementBatch is not a function".

- [ ] **Step 3: Write minimal implementation** (in `PostService.ts`, near `recordView`)

```typescript
async recordEngagementBatch(
  sessions: Array<{
    sessionId: string; postId: string; contentType: string; surface: string;
    startedAt: string; dwellMs: number; watchMs?: number; mediaDurationMs?: number;
    completed: boolean; truncated: boolean; consent?: string;
    actions: unknown[]; watchSamples: unknown[];
  }>,
  userId: string
): Promise<number> {
  let recorded = 0;
  for (const s of sessions) {
    try {
      const post = await this.prisma.post.findFirst({
        where: { id: s.postId, deletedAt: NOT_DELETED },
        select: { id: true, authorId: true },
      });
      if (!post) continue; // skip-and-continue: post deleted between begin and flush
      const dwellMs = Math.max(0, Math.min(300_000, Math.round(s.dwellMs)));
      const watchMs = s.watchMs !== undefined ? Math.max(0, Math.min(300_000, Math.round(s.watchMs))) : undefined;
      const data = {
        postId: s.postId, userId, contentType: s.contentType, surface: s.surface,
        startedAt: new Date(s.startedAt), dwellMs, watchMs,
        mediaDurationMs: s.mediaDurationMs, completed: s.completed, truncated: s.truncated,
        consent: s.consent, actions: s.actions as any, watchSamples: s.watchSamples as any,
      };
      await this.prisma.postEngagement.upsert({
        where: { sessionId: s.sessionId },   // idempotence: lost-ACK retry is a no-op
        update: data,
        create: { sessionId: s.sessionId, ...data },
      });
      recorded += 1;
    } catch {
      continue; // never fail the whole batch on one row
    }
  }
  return recorded;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/gateway && pnpm jest src/__tests__/posts-engagement.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/PostService.ts services/gateway/src/__tests__/posts-engagement.test.ts
git commit -m "feat(gateway): PostService.recordEngagementBatch (upsert sessionId, skip-and-continue, cap 300s)"
```

---

## Task 4.4 — Endpoint POST /posts/engagement/batch

**Files:**
- Modify: `services/gateway/src/routes/posts/interactions.ts`
- Test: `services/gateway/src/__tests__/posts-engagement.test.ts` (ajout route)

- [ ] **Step 1: Write the failing test** (route-level, `fastify.inject`)

```typescript
// add to posts-engagement.test.ts
import Fastify from 'fastify';
import { postInteractionRoutes } from '../routes/posts/interactions'; // adjust to real export name

describe('POST /posts/engagement/batch', () => {
  it('returns recorded count for a valid batch', async () => {
    const app = Fastify({ logger: false });
    // inject auth context + a postService stub via decorators matching the route's usage
    // (mirror the existing posts route tests' setup)
    // ...
    const res = await app.inject({
      method: 'POST', url: '/posts/engagement/batch',
      headers: { authorization: 'Bearer test' },
      payload: { sessions: [mkSession()] },   // mkSession() defined at top of this file
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(1);
    await app.close();
  });
});
```

> Mirror the auth/decorator setup used by the existing posts route tests in this folder (the explorer confirmed the pattern: `Fastify()`, `app.decorate('prisma', mockPrisma)`, register the route module, `app.inject`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/gateway && pnpm jest src/__tests__/posts-engagement.test.ts -t "engagement/batch"`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Write minimal implementation** (mirror `/posts/impressions/batch`)

```typescript
fastify.post('/posts/engagement/batch', {
  preValidation: [requiredAuth],
  config: { rateLimit: createPostRouteRateLimitConfig('engagement') },
}, async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!authContext?.registeredUser) {
      return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    }
    const parsed = EngagementBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, 'Invalid engagement batch', { code: 'VALIDATION_ERROR' });
    }
    const userId = authContext.registeredUser.id;
    const recorded = await postService.recordEngagementBatch(parsed.data.sessions, userId);
    return sendSuccess(reply, { recorded });
  } catch (error) {
    fastify.log.error(`[POST /posts/engagement/batch] Error: ${error}`);
    return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
  }
});
```
Import `EngagementBatchSchema` from `./types` and `sendError` from the response utils at the top of the file if not already imported.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/gateway && pnpm jest src/__tests__/posts-engagement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/posts/interactions.ts services/gateway/src/__tests__/posts-engagement.test.ts
git commit -m "feat(gateway): POST /posts/engagement/batch (auth, Zod, upsert idempotent)"
```

---

## Final verification (after all lots)

- [ ] SDK suite: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests -only-testing:MeeshyUITests 2>&1 | xcbeautify` → all green.
- [ ] App suite: `./apps/ios/meeshy.sh test` → green (re-run flaky timing tests once before flagging — see [[feedback-ios-test-suite-flaky]]).
- [ ] Gateway: `cd services/gateway && pnpm jest src/__tests__/posts-engagement.test.ts && pnpm tsc --noEmit` → green.
- [ ] Manual end-to-end (device/sim): open a post detail >1s → background → foreground → confirm one row hits `POST /posts/engagement/batch` (gateway log) and `PostEngagement` has a row; toggle `allowAnalytics` off → confirm no new rows.

---

## Notes / invariants à ne pas casser pendant l'implémentation

- **viewPost reste sans `duration`** (le dwell vit dans l'engagement). Ne pas commencer à remplir `viewPost(duration:)`.
- **`reportWatchProgress` → `/attachments/:id/status` reste inchangé** (plan séparé, scope attachment). `engagement.watchMs` ne doit jamais être sommé avec lui côté backend.
- **`viewCount`/`PostView` ne sont jamais touchés** par l'engagement.
- **Boot sweep ne touche que les lignes `.open`** (jamais `.finalized` → pas de double-finalize).
- **Gating consentement à `begin()`** (app), pas dans le SDK. SDK `recordEngagement` reste pur.
- **Durées en horloge monotone** (`ProcessInfo.systemUptime` / `DispatchTime`), wall-clock seulement pour `startedAt`.
- Swift 6 : structs `Sendable` ; pas de `deinit` isolé (finalisation explicite + boot sweep) ; `NetworkConditionMonitor.shared` lu sur `@MainActor` ; `adaptiveOnChange` (jamais `.onChange` brut) ; tests JSON `.sortedKeys`.
