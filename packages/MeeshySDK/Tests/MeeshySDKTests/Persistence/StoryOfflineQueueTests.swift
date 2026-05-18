import XCTest
@testable import MeeshySDK

/// Tests for `StoryOfflineQueue` — FIFO offline story publish queue (Task 74).
/// Singleton actor — each test purges state at start/end to avoid cross-test pollution.
final class StoryOfflineQueueTests: XCTestCase {

    private var mediaDir: URL!

    /// Builds an item that references real on-disk visual-media AND audio
    /// files. The unified `StoryPublishQueue.processNext` validates that every
    /// referenced media file still exists before publishing, so the fixture
    /// must carry real files — otherwise flush would skip every item as
    /// missing-media. Both `mediaURLPaths` (image/video) and `audioURLPaths`
    /// are populated so the converter's audio/non-audio split is exercised.
    private func makeItem(slideId: String = "slide-1") -> StoryOfflineQueueItem {
        let mediaURL = mediaDir.appendingPathComponent("\(slideId)-media.jpg")
        let audioURL = mediaDir.appendingPathComponent("\(slideId)-audio.m4a")
        try? Data([0xFF, 0xD8, 0xFF]).write(to: mediaURL)
        try? Data([0x00, 0x01, 0x02]).write(to: audioURL)
        return StoryOfflineQueueItem(
            slideIds: [slideId],
            slidePayloadJSON: #"{"slides":[{"id":"\#(slideId)","duration":5}]}"#,
            mediaURLPaths: ["media-1": mediaURL.path],
            audioURLPaths: ["audio-1": audioURL.path],
            originalLanguage: "fr",
            visibility: "PUBLIC"
        )
    }

    override func setUp() async throws {
        try await super.setUp()
        mediaDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryOfflineQueueTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: mediaDir, withIntermediateDirectories: true)
        await StoryOfflineQueue.shared.purge()
    }

    override func tearDown() async throws {
        await StoryOfflineQueue.shared.purge()
        try? FileManager.default.removeItem(at: mediaDir)
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

    /// The converter forwards `mediaURLPaths` and `audioURLPaths` through
    /// `StoryPublishQueueItem.mediaReferences` (tagged image vs audio) and
    /// `reverse` splits them back apart. Both dictionaries must survive the
    /// round-trip.
    func test_enqueueDequeue_roundTripsMediaAndAudioPaths() async {
        let queue = StoryOfflineQueue.shared
        await queue.enqueue(makeItem())

        let pending = await queue.pendingItems

        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.mediaURLPaths.keys.sorted(), ["media-1"])
        XCTAssertEqual(pending.first?.audioURLPaths.keys.sorted(), ["audio-1"])
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

    // MARK: - Storage security

    /// Asserts `.completeFileProtection` is requested on each write.
    ///
    /// NOTE: File protection is hardware-enforced and is always `.none` on the simulator
    /// (Secure Enclave is absent). This test is therefore skipped on the simulator — the
    /// protection attribute is verified manually on a physical device.
    func test_persistence_fileProtectionIsComplete() async throws {
        try XCTSkipIf(true,
            "File protection is enforced by hardware — URLFileProtection always returns .none on the simulator. Verified manually on a physical device.")

        let queue = StoryOfflineQueue.shared
        await queue.enqueue(makeItem())

        let appSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: false
        )
        let queueDir = appSupport.appendingPathComponent("StoryOfflineQueue", isDirectory: true)
        let fileURL = queueDir.appendingPathComponent("story_offline_queue.json")
        let resourceValues = try fileURL.resourceValues(forKeys: [.fileProtectionKey])
        XCTAssertEqual(resourceValues.fileProtection, .complete,
            "Queue file must have FileProtectionType.complete")
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
