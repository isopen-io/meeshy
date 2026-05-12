import XCTest
@testable import MeeshySDK

/// Tests covering the 2026-05-12 unification of `StoryOfflineQueue` and
/// `StoryPublishQueue`. After the rewire :
///   - every `StoryOfflineQueue.enqueue` forwards to `StoryPublishQueue` via
///     the typed `PublishQueueForwarding` seam (no parallel JSON file),
///   - `StoryQueueMigrator.migrateLegacyOfflineQueue()` drains the legacy
///     `applicationSupportDirectory/StoryOfflineQueue/story_offline_queue.json`
///     file on cold start and is idempotent on subsequent boots.
final class StoryQueueUnificationTests: XCTestCase {

    // MARK: - Fake PublishQueueForwarding

    /// Captures every `enqueue` call so tests can assert ordering, count,
    /// and payload mapping without touching the real `StoryPublishQueue`.
    private actor FakePublishQueue: PublishQueueForwarding {
        private(set) var enqueued: [StoryPublishQueueItem] = []
        private(set) var dequeueCalls: [String] = []
        private(set) var clearAllCallCount = 0
        private(set) var processNextCallCount = 0
        private(set) var setPublishHandlerCallCount = 0

        @discardableResult
        func enqueue(_ item: StoryPublishQueueItem) async -> String {
            enqueued.append(item)
            return item.tempStoryId
        }

        func dequeueByTempStoryId(_ tempStoryId: String) async {
            dequeueCalls.append(tempStoryId)
            enqueued.removeAll { $0.tempStoryId == tempStoryId }
        }

        var pendingItems: [StoryPublishQueueItem] {
            get async { enqueued }
        }

        func clearAll() async {
            clearAllCallCount += 1
            enqueued.removeAll()
        }

        func processNext() async {
            processNextCallCount += 1
        }

        func setPublishHandler(
            _ handler: @escaping @Sendable (StoryPublishQueueItem) async throws -> String
        ) async {
            setPublishHandlerCallCount += 1
        }
    }

    // MARK: - Helpers

    private func makeLegacyItem(
        id: String = UUID().uuidString,
        slideId: String = "slide-A",
        visibility: String = "PUBLIC"
    ) -> StoryOfflineQueueItem {
        StoryOfflineQueueItem(
            id: id,
            slideIds: [slideId],
            slidePayloadJSON: #"{"slides":[{"id":"\#(slideId)","duration":5}]}"#,
            mediaURLPaths: ["media-1": "/tmp/media-1.jpg"],
            audioURLPaths: ["audio-1": "/tmp/audio-1.m4a"],
            originalLanguage: "fr",
            visibility: visibility
        )
    }

    /// Resolves the URL the migrator inspects so the test can stage a fixture
    /// at the exact location production reads from.
    private func legacyQueueFileURL() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let dir = base.appendingPathComponent("StoryOfflineQueue", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("story_offline_queue.json")
    }

    private func removeLegacyFile() {
        guard let url = StoryQueueMigrator.legacyQueueFileURL() else { return }
        try? FileManager.default.removeItem(at: url)
    }

    override func setUp() async throws {
        try await super.setUp()
        removeLegacyFile()
    }

    override func tearDown() async throws {
        removeLegacyFile()
        try await super.tearDown()
    }

    // MARK: - Adapter forwarding

    func test_offlineQueue_enqueue_forwardsToPublishQueue() async {
        let fake = FakePublishQueue()
        let adapter = StoryOfflineQueue(forwardingTo: fake)
        let item = makeLegacyItem(id: "offline-42", slideId: "slide-XYZ", visibility: "FRIENDS")

        await adapter.enqueue(item)

        let received = await fake.enqueued
        XCTAssertEqual(received.count, 1, "Adapter must forward exactly one item to the publish queue")
        XCTAssertEqual(received.first?.visibility, "FRIENDS",
                       "Forwarded item must preserve visibility")
        XCTAssertEqual(received.first?.tempStoryId, "offline-42",
                       "Legacy id must round-trip via tempStoryId so dequeue stays addressable")
        XCTAssertEqual(received.first?.mediaReferences.count, 2,
                       "Both media and audio references must be flattened into the unified item")
        XCTAssertEqual(String(data: received.first!.slidesPayload, encoding: .utf8),
                       #"{"slides":[{"id":"slide-XYZ","duration":5}]}"#,
                       "slidePayloadJSON must be round-tripped byte-equivalent into slidesPayload")
    }

    func test_offlineQueue_pendingItems_readsFromPublishQueue() async {
        let fake = FakePublishQueue()
        let adapter = StoryOfflineQueue(forwardingTo: fake)
        await adapter.enqueue(makeLegacyItem(id: "first"))
        await adapter.enqueue(makeLegacyItem(id: "second"))

        let pending = await adapter.pendingItems
        XCTAssertEqual(pending.map(\.id), ["first", "second"],
                       "pendingItems must surface the legacy ids carried via tempStoryId")
    }

    func test_offlineQueue_dequeue_forwardsByTempStoryId() async {
        let fake = FakePublishQueue()
        let adapter = StoryOfflineQueue(forwardingTo: fake)
        await adapter.enqueue(makeLegacyItem(id: "to-remove"))

        await adapter.dequeue("to-remove")

        let calls = await fake.dequeueCalls
        XCTAssertEqual(calls, ["to-remove"])
        let pending = await adapter.pendingItems
        XCTAssertTrue(pending.isEmpty)
    }

    // MARK: - Migration

    func test_migration_drainsLegacyApplicationSupportFiles() async throws {
        let url = try legacyQueueFileURL()
        let items = [
            makeLegacyItem(id: "legacy-1", slideId: "slide-one"),
            makeLegacyItem(id: "legacy-2", slideId: "slide-two")
        ]
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(items)
        try data.write(to: url, options: [.atomic])

        let fake = FakePublishQueue()
        let migrated = await StoryQueueMigrator.migrateLegacyOfflineQueue(publishQueue: fake)

        XCTAssertEqual(migrated, 2, "Migrator must report the number of drained items")
        let received = await fake.enqueued
        XCTAssertEqual(received.map(\.tempStoryId), ["legacy-1", "legacy-2"],
                       "Both legacy items must be enqueued in their original order")
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path),
                       "Source file must be deleted after a successful migration")
    }

    func test_migration_idempotent_secondRunIsNoop() async throws {
        let url = try legacyQueueFileURL()
        let items = [makeLegacyItem(id: "only-once")]
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(items).write(to: url, options: [.atomic])

        let fake = FakePublishQueue()
        let firstRun = await StoryQueueMigrator.migrateLegacyOfflineQueue(publishQueue: fake)
        let secondRun = await StoryQueueMigrator.migrateLegacyOfflineQueue(publishQueue: fake)

        XCTAssertEqual(firstRun, 1, "First run must drain the single staged item")
        XCTAssertEqual(secondRun, 0,
                       "Second run is a no-op once the source file has been removed")
        let received = await fake.enqueued
        XCTAssertEqual(received.count, 1,
                       "Idempotent migration must not duplicate items on retry")
    }

    func test_migration_corruptedFileIsQuarantined() async throws {
        let url = try legacyQueueFileURL()
        try Data("{not valid json".utf8).write(to: url, options: [.atomic])

        let fake = FakePublishQueue()
        let migrated = await StoryQueueMigrator.migrateLegacyOfflineQueue(publishQueue: fake)

        XCTAssertEqual(migrated, 0, "Corrupted file must yield zero migrated items")
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path),
                       "Corrupted file must be renamed so subsequent boots are no-ops")
        let received = await fake.enqueued
        XCTAssertTrue(received.isEmpty,
                      "No items must be enqueued when the source payload cannot be decoded")
    }
}
