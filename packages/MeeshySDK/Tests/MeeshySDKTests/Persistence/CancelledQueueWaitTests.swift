import XCTest
import GRDB
@testable import MeeshySDK

final class CancelledQueueWaitTests: XCTestCase {

    private actor PublishCounter {
        private(set) var count = 0
        func increment() { count += 1 }
    }

    private var pool: DatabaseQueue!

    override func setUp() async throws {
        try await super.setUp()
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await OfflineQueue.shared.clearAll()
        await StoryPublishQueue.shared._testResetPublishHandler()
        await StoryPublishQueue.shared.clearAll()
    }

    override func tearDown() async throws {
        await StoryPublishQueue.shared._testResetPublishHandler()
        await StoryPublishQueue.shared.clearAll()
        await OfflineQueue.shared.clearAll()
        pool = nil
        try await super.tearDown()
    }

    func test_writableCommentContext_cancelledWait_returnsNilWithoutSpinningToDeadline() async {
        let started = ContinuousClock.now
        let task = Task { await OfflineQueue.shared.writableCommentContext(ownerId: "owner-s4", grace: 3) }
        task.cancel()
        let context = await task.value
        let elapsed = ContinuousClock.now - started

        XCTAssertNil(context)
        XCTAssertLessThan(elapsed, .seconds(1))
    }

    func test_processNext_cancelledDuringJitter_publishesNoFurtherItem() async {
        let counter = PublishCounter()
        let queue = StoryPublishQueue.shared
        await queue.setPublishHandler { _ in
            await counter.increment()
            withUnsafeCurrentTask { $0?.cancel() }
            return "server-ok"
        }
        await queue.enqueue(StoryPublishQueueItem(visibility: "PUBLIC", slidesPayload: Data("[]".utf8)))
        await queue.enqueue(StoryPublishQueueItem(visibility: "PUBLIC", slidesPayload: Data("[]".utf8)))

        await Task { await queue.processNext() }.value

        let publications = await counter.count
        XCTAssertEqual(publications, 1)
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 1)
    }

    func test_queueTiming_keepsHistoricalDelays() {
        XCTAssertEqual(QueueTiming.reconnectSettle, .seconds(2))
        XCTAssertEqual(QueueTiming.drainSettle, .milliseconds(200))
        XCTAssertEqual(QueueTiming.rebindPoll, .milliseconds(50))
    }
}
