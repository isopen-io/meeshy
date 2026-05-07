import XCTest
@testable import MeeshySDK

/// Tests for `StoryOfflineQueue` — FIFO offline story publish queue (Task 74).
/// Singleton actor — each test purges state at start/end to avoid cross-test pollution.
final class StoryOfflineQueueTests: XCTestCase {

    private func makeItem(slideId: String = "slide-1") -> StoryOfflineQueueItem {
        StoryOfflineQueueItem(
            slideIds: [slideId],
            slidePayloadJSON: #"{"slides":[{"id":"\#(slideId)","duration":5}]}"#,
            mediaURLPaths: ["media-1": "/tmp/media-1.jpg"],
            audioURLPaths: [:],
            originalLanguage: "fr",
            visibility: "PUBLIC"
        )
    }

    override func setUp() async throws {
        try await super.setUp()
        await StoryOfflineQueue.shared.purge()
    }

    override func tearDown() async throws {
        await StoryOfflineQueue.shared.purge()
        try await super.tearDown()
    }

    // MARK: - Enqueue / dequeue

    func test_enqueue_dequeue_roundTrip() async {
        let queue = StoryOfflineQueue.shared
        let item = makeItem()
        await queue.enqueue(item)
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.slideIds, ["slide-1"])
        await queue.dequeue(item.id)
        let pendingAfter = await queue.pendingItems
        XCTAssertEqual(pendingAfter.count, 0)
    }

    func test_multipleEnqueue_maintainsFIFOOrder() async {
        let queue = StoryOfflineQueue.shared
        let first = makeItem(slideId: "first")
        let second = makeItem(slideId: "second")
        let third = makeItem(slideId: "third")
        await queue.enqueue(first)
        await queue.enqueue(second)
        await queue.enqueue(third)
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.map { $0.slideIds.first }, ["first", "second", "third"],
                       "Items must be in FIFO order")
    }

    // MARK: - Persistence

    func test_persistence_survivesReload() async {
        let queue = StoryOfflineQueue.shared
        let item = makeItem()
        await queue.enqueue(item)
        // Force reload from disk
        await queue.reloadFromDisk()
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 1, "Item must survive disk reload (persisted)")
    }

    // MARK: - Flush

    func test_flush_callsHandler_andRemovesOnSuccess() async {
        let queue = StoryOfflineQueue.shared
        // Use a Sendable counter to avoid captured-var mutation concurrency error.
        actor PublishTracker {
            var ids: [String] = []
            func record(_ id: String) { ids.append(id) }
        }
        let tracker = PublishTracker()
        await queue.setOnPublish { item in
            await tracker.record(item.id)
            return true
        }
        let item = makeItem()
        await queue.enqueue(item)
        await queue.flush()
        let ids = await tracker.ids
        XCTAssertEqual(ids.count, 1)
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 0, "Flushed item must be removed from queue")
    }

    func test_flush_stopsOnFirstFailure() async {
        let queue = StoryOfflineQueue.shared
        actor PublishTracker {
            var ids: [String] = []
            func record(_ id: String) { ids.append(id) }
        }
        let tracker = PublishTracker()
        await queue.setOnPublish { item in
            await tracker.record(item.id)
            return false  // always fail
        }
        await queue.enqueue(makeItem(slideId: "a"))
        await queue.enqueue(makeItem(slideId: "b"))
        await queue.flush()
        let ids = await tracker.ids
        XCTAssertEqual(ids.count, 1, "Flush must stop after first failure")
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 2, "Both items remain after flush failure")
    }

    // MARK: - OfflineQueueProviding conformance

    func test_conformsToOfflineQueueProviding() async {
        let providing: any OfflineQueueProviding = StoryOfflineQueue.shared
        let item = makeItem()
        await providing.enqueue(item)
        let count = await providing.pendingItems.count
        XCTAssertEqual(count, 1)
    }
}
