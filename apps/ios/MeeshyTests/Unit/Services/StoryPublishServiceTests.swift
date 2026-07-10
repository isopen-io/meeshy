import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// Light integration coverage for the `StoryPublishService` bridge.
///
/// The service is a `@MainActor` singleton layered over the
/// `StoryPublishQueue.shared` actor, so each test resets the shared queue in
/// `setUp`. The queue's own enqueue/retry/persistence logic is covered by
/// `StoryPublishQueueTests` in the SDK — these tests only verify the bridge:
/// it delegates `pendingItems`, clears the queue, and refreshes its published
/// `pendingCount` on app foreground.
@MainActor
final class StoryPublishServiceTests: XCTestCase {

    private var service: StoryPublishService { StoryPublishService.shared }

    override func setUp() async throws {
        try await super.setUp()
        await StoryPublishQueue.shared.clearAll()
    }

    override func tearDown() async throws {
        await StoryPublishQueue.shared.clearAll()
        try await super.tearDown()
    }

    // MARK: - Helpers

    private func makeItem(visibility: String = "PUBLIC") -> StoryPublishQueueItem {
        StoryPublishQueueItem(visibility: visibility, slidesPayload: Data("[]".utf8))
    }

    // MARK: - pendingItems

    func test_pendingItems_reflectsQueuedItems() async {
        let first = makeItem()
        let second = makeItem()
        _ = await StoryPublishQueue.shared.enqueue(first)
        _ = await StoryPublishQueue.shared.enqueue(second)

        let pending = await service.pendingItems()

        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(Set(pending.map(\.id)), [first.id, second.id])
    }

    func test_pendingItems_emptyWhenQueueEmpty() async {
        let pending = await service.pendingItems()

        XCTAssertTrue(pending.isEmpty)
    }

    // MARK: - clearAll

    func test_clearAll_emptiesQueueAndZeroesPendingCount() async {
        _ = await StoryPublishQueue.shared.enqueue(makeItem())
        _ = await StoryPublishQueue.shared.enqueue(makeItem())

        await service.clearAll()

        let pending = await service.pendingItems()
        XCTAssertTrue(pending.isEmpty)
        XCTAssertEqual(service.pendingCount, 0)
    }

    // MARK: - foreground refresh

    func test_foregroundNotification_refreshesPendingCount() async {
        // configure() is idempotent; calling it ensures the
        // willEnterForeground subscription is installed.
        service.configure()
        _ = await StoryPublishQueue.shared.enqueue(makeItem())
        _ = await StoryPublishQueue.shared.enqueue(makeItem())

        NotificationCenter.default.post(
            name: UIApplication.willEnterForegroundNotification, object: nil
        )

        // The subscription refreshes pendingCount on a hopped Task — yield
        // until it reflects the two queued items.
        for _ in 0..<200 where service.pendingCount != 2 {
            await Task.yield()
        }
        XCTAssertEqual(service.pendingCount, 2)
    }
}
