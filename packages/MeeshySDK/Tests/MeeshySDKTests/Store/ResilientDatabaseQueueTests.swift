import XCTest
import GRDB
@testable import MeeshySDK

final class ResilientDatabaseQueueTests: XCTestCase {

    private struct OpenFailure: Error {}

    private func persistentPath() -> String {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("resilient-\(UUID().uuidString).db").path
    }

    func test_open_whenDiskSucceeds_isPersistent() {
        let opened = ResilientDatabaseQueue.open(path: persistentPath())
        guard case .persistent = opened else { return XCTFail("expected .persistent, got \(opened)") }
    }

    func test_open_withoutPath_isPersistentInMemoryQueue() {
        let opened = ResilientDatabaseQueue.open(path: nil)
        XCTAssertNotNil(opened.queue)
    }

    func test_open_whenDiskFails_fallsBackToMemory_andCarriesTheDiskError() {
        let opened = ResilientDatabaseQueue.open(
            path: "/unused",
            openDisk: { _ in throw OpenFailure() },
            openMemory: { try DatabaseQueue() }
        )
        guard case .memoryFallback(_, let diskError) = opened else { return XCTFail("expected .memoryFallback") }
        XCTAssertFalse(diskError.isEmpty)
        XCTAssertNotNil(opened.queue)
    }

    func test_open_whenDiskAndMemoryFail_isUnavailable_withoutTrapping() {
        let opened = ResilientDatabaseQueue.open(
            path: "/unused",
            openDisk: { _ in throw OpenFailure() },
            openMemory: { throw OpenFailure() }
        )
        guard case .unavailable(let diskError, let memoryError) = opened else { return XCTFail("expected .unavailable") }
        XCTAssertFalse(diskError.isEmpty)
        XCTAssertFalse(memoryError.isEmpty)
        XCTAssertNil(opened.queue)
    }

    func test_open_withoutPath_andMemoryFailure_isUnavailable() {
        let opened = ResilientDatabaseQueue.open(
            path: nil,
            openDisk: { _ in throw OpenFailure() },
            openMemory: { throw OpenFailure() }
        )
        XCTAssertNil(opened.queue)
    }

    private static let unavailable = OpenedDatabaseQueue.unavailable(diskError: "disk", memoryError: "memory")

    func test_engagementOutbox_onUnavailableStorage_beginSessionAndFlushAreNoOps() async {
        let outbox = EngagementOutbox(storage: Self.unavailable)
        let session = EngagementSession(
            sessionId: "s1", userId: "u1", postId: "p1", contentType: .post, surface: .detail,
            startedAt: Date(timeIntervalSince1970: 1_700_000_000), dwellMs: 4000,
            watchMs: nil, mediaDurationMs: nil, completed: false, truncated: false,
            consent: "granted", actions: [], watchSamples: []
        )
        await outbox.beginSession(session)
        await outbox.finalizeSession(session)
        let dispatched = DispatchCounter()
        await outbox.flush { _ in
            dispatched.increment()
            return .completed
        }
        XCTAssertEqual(dispatched.count, 0)
    }

    func test_socialEventsOutbox_onUnavailableStorage_enqueueReturnsZero_andPendingCountIsZero() async {
        let outbox = SocialEventsV2Outbox(storage: Self.unavailable)
        let event = SocialEventV2(
            eventId: "e1", occurredAt: Date(timeIntervalSince1970: 1_760_000_000),
            target: SocialTarget(kind: .post, id: "p"),
            payload: .interaction(SocialInteraction(action: .save))
        )
        let inserted = await outbox.enqueue([event], owner: "u1")
        let pending = await outbox.pendingCount(owner: "u1")
        XCTAssertEqual(inserted, 0)
        XCTAssertEqual(pending, 0)
    }

    func test_conversationStateOutbox_onUnavailableStorage_enqueueKeepsInMemoryState_withoutTrapping() async {
        let outbox = ConversationStateOutbox(storage: Self.unavailable)
        let task = await outbox.enqueue(.setPinned(true), for: "conv-1")
        let pending = await outbox.allPending()
        XCTAssertNotNil(task)
        XCTAssertEqual(pending.count, 1)
    }

    func test_storyDraftStore_onUnavailableStorage_recordsOpenDatabaseFailure_andSaveReportsFailure() {
        let mediaDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("draft-media-\(UUID().uuidString)")
        let store = StoryDraftStore(storage: Self.unavailable, mediaDirectory: mediaDirectory)
        XCTAssertEqual(store.lastPersistFailure?.operation, "open-database")
        let saved = store.save(draftId: "A", slides: [], visibility: "PUBLIC")
        XCTAssertFalse(saved)
    }

    func test_storeSources_containNoFatalError() throws {
        let storeDirectory = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Store")
        let names = ["ConversationStateOutbox", "EngagementOutbox", "SocialEventsV2Outbox", "StoryDraftStore"]
        for name in names {
            let source = try String(contentsOf: storeDirectory.appendingPathComponent("\(name).swift"), encoding: .utf8)
            XCTAssertFalse(source.contains("fatalError("), "\(name).swift must not trap")
        }
    }
}

private final class DispatchCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0
    var count: Int { lock.lock(); defer { lock.unlock() }; return value }
    func increment() { lock.lock(); value += 1; lock.unlock() }
}
