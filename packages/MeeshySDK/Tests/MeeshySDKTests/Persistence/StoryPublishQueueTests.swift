import XCTest
import Combine
@testable import MeeshySDK

/// Tests for `StoryPublishQueue` (SOTA audit Pilier 22). The queue is a
/// singleton actor, so tests share state — each test starts with `clearAll()`
/// and avoids relying on disk state by overriding the publish handler.
final class StoryPublishQueueTests: XCTestCase {

    private var queue: StoryPublishQueue!
    private var tempDir: URL!

    override func setUp() async throws {
        try await super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryPublishQueueTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        queue = StoryPublishQueue.shared
        await queue.clearAll()
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: tempDir)
        await queue.clearAll()
        try await super.tearDown()
    }

    // MARK: - E10 : cleanup des copies média aux dispositions terminales

    func test_processNext_success_removesLocalMediaAndEmptyParentDir() async throws {
        let published = PublishedIds()
        await queue.setPublishHandler { item in
            await published.append(item.id)
            return "server-ok"
        }

        let mediaDir = tempDir.appendingPathComponent("pending_e10", isDirectory: true)
        try FileManager.default.createDirectory(at: mediaDir, withIntermediateDirectories: true)
        let mediaFile = mediaDir.appendingPathComponent("clip.mp4")
        try Data([0x01]).write(to: mediaFile)

        let item = makeItem(visibility: "PUBLIC", mediaReferences: [
            StoryMediaReference(elementId: "e1", mediaType: "video", localFilePath: mediaFile.path),
        ])
        await queue.enqueue(item)
        await queue.processNext()

        XCTAssertFalse(FileManager.default.fileExists(atPath: mediaFile.path),
                       "A successfully drained item must remove its local media copies")
        XCTAssertFalse(FileManager.default.fileExists(atPath: mediaDir.path),
                       "The per-story directory is removed once empty")
    }

    func test_processNext_retryableFailure_keepsLocalMedia() async throws {
        await queue.setPublishHandler { _ in
            throw URLError(.notConnectedToInternet)
        }

        let mediaDir = tempDir.appendingPathComponent("pending_retry", isDirectory: true)
        try FileManager.default.createDirectory(at: mediaDir, withIntermediateDirectories: true)
        let mediaFile = mediaDir.appendingPathComponent("clip.mp4")
        try Data([0x01]).write(to: mediaFile)

        let item = makeItem(visibility: "PUBLIC", mediaReferences: [
            StoryMediaReference(elementId: "e1", mediaType: "video", localFilePath: mediaFile.path),
        ])
        await queue.enqueue(item)
        await queue.processNext()

        XCTAssertTrue(FileManager.default.fileExists(atPath: mediaFile.path),
                      "A retryable failure keeps the media — the next drain still needs it")
    }

    func test_clearAll_removesLocalMediaCopies() async throws {
        let mediaDir = tempDir.appendingPathComponent("pending_clearall", isDirectory: true)
        try FileManager.default.createDirectory(at: mediaDir, withIntermediateDirectories: true)
        let mediaFile = mediaDir.appendingPathComponent("clip.mp4")
        try Data([0x01]).write(to: mediaFile)

        let item = makeItem(visibility: "PUBLIC", mediaReferences: [
            StoryMediaReference(elementId: "e1", mediaType: "video", localFilePath: mediaFile.path),
        ])
        await queue.enqueue(item)
        await queue.clearAll()

        XCTAssertFalse(FileManager.default.fileExists(atPath: mediaFile.path),
                       "Logout clearAll must not leave the previous account's media on disk")
        let count = await queue.count
        XCTAssertEqual(count, 0)
    }

    // MARK: - E5 write-ahead : in-flight marking

    func test_processNext_skipsInFlightItems() async {
        // Handler AVANT l'enqueue : setPublishHandler auto-draine (M5) une
        // queue non vide, ce qui courserait le processNext explicite du test.
        let published = PublishedIds()
        await queue.setPublishHandler { item in
            await published.append(item.id)
            return "server-\(item.id)"
        }

        let uiDriven = makeItem(visibility: "PUBLIC")
        let queued = makeItem(visibility: "FRIENDS")
        await queue.enqueue(uiDriven)
        await queue.enqueue(queued)
        await queue.markInFlight(uiDriven.id)
        await queue.processNext()

        let ids = await published.values
        XCTAssertEqual(ids, [queued.id],
                       "The drain must skip the item whose upload is UI-driven right now")
        let stillQueued = await queue.pendingItems.map(\.id)
        XCTAssertTrue(stillQueued.contains(uiDriven.id),
                      "The in-flight item stays persisted (killed process = boot replays it)")
    }

    func test_dequeue_clearsInFlightMarker() async {
        let item = makeItem(visibility: "PUBLIC")
        await queue.enqueue(item)
        await queue.markInFlight(item.id)
        await queue.dequeue(item.id)
        let inFlight = await queue.isInFlight(item.id)
        XCTAssertFalse(inFlight)
    }

    func test_clearInFlight_makesItemEligibleForDrainAgain() async {
        let published = PublishedIds()
        await queue.setPublishHandler { item in
            await published.append(item.id)
            return "server-\(item.id)"
        }

        let item = makeItem(visibility: "PUBLIC")
        await queue.enqueue(item)
        await queue.markInFlight(item.id)
        await queue.clearInFlight(item.id)
        await queue.processNext()

        let ids = await published.values
        XCTAssertEqual(ids, [item.id])
    }

    /// Collecteur Sendable pour les handlers @Sendable de la queue.
    private actor PublishedIds {
        private(set) var values: [String] = []
        func append(_ id: String) { values.append(id) }
    }

    // MARK: - enqueue / dequeue

    func test_enqueue_addsItemToQueue() async {
        let item = makeItem(visibility: "PUBLIC")
        await queue.enqueue(item)
        let count = await queue.count
        XCTAssertEqual(count, 1)
    }

    func test_enqueue_returnsTempStoryId() async {
        let item = makeItem(visibility: "PUBLIC")
        let tempId = await queue.enqueue(item)
        XCTAssertEqual(tempId, item.tempStoryId)
        XCTAssertTrue(tempId.hasPrefix("pending_"))
    }

    func test_dequeue_removesItem() async {
        let item = makeItem(visibility: "PUBLIC")
        await queue.enqueue(item)
        await queue.dequeue(item.id)
        let count = await queue.count
        XCTAssertEqual(count, 0)
    }

    // MARK: - recoverLastStuckItem (offline draft recovery)

    func test_recoverLastStuckItem_returnsMostRecentStuckItem() async {
        let older = makeItem(visibility: "PUBLIC")
        let newer = makeItem(visibility: "FRIENDS")
        await queue.enqueue(older)
        await queue.enqueue(newer)

        // olderThan: 0 → both qualify; the most recent (append-ordered last) wins.
        let recovered = await queue.recoverLastStuckItem(olderThan: 0)
        XCTAssertEqual(recovered?.id, newer.id)
        XCTAssertEqual(recovered?.visibility, "FRIENDS")
    }

    func test_recoverLastStuckItem_skipsItemsYoungerThanThreshold() async {
        await queue.enqueue(makeItem(visibility: "PUBLIC"))
        // Just-enqueued items are still actively publishing, not yet stuck: a 1h
        // threshold must recover nothing.
        let recovered = await queue.recoverLastStuckItem(olderThan: 3600)
        XCTAssertNil(recovered)
    }

    // MARK: - processNext — success path

    func test_processNext_success_emitsPublishSucceeded() async {
        let item = makeItem(visibility: "PUBLIC")
        await queue.enqueue(item)

        let receivedExpectation = expectation(description: "publishSucceeded fires")
        var cancellables = Set<AnyCancellable>()
        var received: StoryPublishSuccess?
        queue.publishSucceeded.publisher
            .sink { payload in
                received = payload
                receivedExpectation.fulfill()
            }
            .store(in: &cancellables)

        await queue.setPublishHandler { _ in "server-story-42" }
        await queue.processNext()

        await fulfillment(of: [receivedExpectation], timeout: 2.0)
        XCTAssertEqual(received?.publishedStoryId, "server-story-42")
        XCTAssertEqual(received?.tempStoryId, item.tempStoryId)
        let remaining = await queue.count
        XCTAssertEqual(remaining, 0, "successfully published item is removed from the queue")
    }

    // MARK: - processNext — retryable failure

    func test_processNext_retryableFailure_bumpsRetryCount() async {
        // Set the handler BEFORE enqueuing so the M5 auto-drain trigger in
        // setPublishHandler does not fire (it only triggers when items is
        // non-empty at registration time). Without this ordering, the
        // auto-drain race-conditions with the explicit processNext() and
        // makes the asserted retryCount non-deterministic across runs.
        struct TransientError: Error {}
        await queue.setPublishHandler { _ in throw TransientError() }

        let item = makeItem(visibility: "PUBLIC")
        await queue.enqueue(item)
        await queue.processNext()

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 1, "retryable failures keep the item in queue")
        XCTAssertEqual(pending.first?.retryCount, 1)
        XCTAssertNotNil(pending.first?.lastError)
    }

    // MARK: - processNext — unrecoverable failure

    func test_processNext_unrecoverableError_movesToPermanentFailure() async {
        let item = makeItem(visibility: "PUBLIC")
        await queue.enqueue(item)

        let failedExpectation = expectation(description: "publishFailed fires")
        var cancellables = Set<AnyCancellable>()
        var received: StoryPublishFailure?
        queue.publishFailed.publisher
            .sink { payload in
                received = payload
                failedExpectation.fulfill()
            }
            .store(in: &cancellables)

        await queue.setPublishHandler { _ in
            throw StoryPublishUnrecoverableError("validation rejected")
        }
        await queue.processNext()

        await fulfillment(of: [failedExpectation], timeout: 2.0)
        if case .unrecoverable = received?.reason {
            // expected
        } else {
            XCTFail("expected .unrecoverable, got \(String(describing: received?.reason))")
        }
        let remaining = await queue.count
        XCTAssertEqual(remaining, 0, "unrecoverable failure removes item from queue")
    }

    // MARK: - Hash-check missing media

    func test_processNext_missingLocalMedia_movesToPermanentFailure() async {
        let bogusPath = tempDir.appendingPathComponent("does-not-exist.mp4").path
        let ref = StoryMediaReference(
            elementId: "media-1",
            mediaType: "video",
            localFilePath: bogusPath
        )
        let item = makeItem(visibility: "PUBLIC", mediaReferences: [ref])
        await queue.enqueue(item)

        let failedExpectation = expectation(description: "publishFailed fires for missing media")
        var cancellables = Set<AnyCancellable>()
        var received: StoryPublishFailure?
        queue.publishFailed.publisher
            .sink { payload in
                received = payload
                failedExpectation.fulfill()
            }
            .store(in: &cancellables)

        // Handler MUST NOT be called when media is missing.
        await queue.setPublishHandler { _ in
            XCTFail("publish handler should not be invoked when media is missing")
            return ""
        }
        await queue.processNext()

        await fulfillment(of: [failedExpectation], timeout: 2.0)
        if case .missingLocalMedia(let elementIds) = received?.reason {
            XCTAssertEqual(elementIds, ["media-1"])
        } else {
            XCTFail("expected .missingLocalMedia, got \(String(describing: received?.reason))")
        }
        let remaining = await queue.count
        XCTAssertEqual(remaining, 0)
    }

    // MARK: - Max retries reached

    func test_processNext_maxRetriesReached_movesToPermanentFailure() async {
        // Pre-seed an item with retryCount = 4 (one retry away from the cap).
        var item = makeItem(visibility: "PUBLIC")
        item.retryCount = 4
        await queue._testSetItems([item])

        let failedExpectation = expectation(description: "publishFailed fires for max retries")
        var cancellables = Set<AnyCancellable>()
        var received: StoryPublishFailure?
        queue.publishFailed.publisher
            .sink { payload in
                received = payload
                failedExpectation.fulfill()
            }
            .store(in: &cancellables)

        struct TransientError: Error {}
        await queue.setPublishHandler { _ in throw TransientError() }
        await queue.processNext()

        await fulfillment(of: [failedExpectation], timeout: 2.0)
        XCTAssertEqual(received?.reason, .maxRetriesReached)
        let remaining = await queue.count
        XCTAssertEqual(remaining, 0)
    }

    // MARK: - Helpers

    private func makeItem(visibility: String, mediaReferences: [StoryMediaReference] = []) -> StoryPublishQueueItem {
        StoryPublishQueueItem(
            visibility: visibility,
            slidesPayload: Data("[]".utf8),
            mediaReferences: mediaReferences
        )
    }
}
