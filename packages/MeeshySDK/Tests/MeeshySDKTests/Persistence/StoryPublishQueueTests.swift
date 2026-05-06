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
        let item = makeItem(visibility: "PUBLIC")
        await queue.enqueue(item)

        struct TransientError: Error {}
        await queue.setPublishHandler { _ in throw TransientError() }
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
