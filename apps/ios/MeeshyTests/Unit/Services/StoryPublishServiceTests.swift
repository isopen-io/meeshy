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

    // MARK: - failedItems / retry / discard

    /// Drives a real permanent failure through the public queue API (same
    /// pattern as `StoryPublishQueueTests` in the SDK) and waits for the
    /// service's `publishFailed` subscriber (hopped via `receive(on: .main)`)
    /// to reflect it in `failedItems`.
    private func enqueueAndFailPermanently() async -> StoryPublishQueueItem {
        service.configure()
        await StoryPublishQueue.shared.setPublishHandler { _ in
            throw StoryPublishUnrecoverableError("rejected")
        }
        let item = makeItem()
        _ = await StoryPublishQueue.shared.enqueue(item)
        await StoryPublishQueue.shared.processNext()
        for _ in 0..<200 where service.failedItems.isEmpty {
            await Task.yield()
        }
        return item
    }

    func test_failedItems_emptyWhenQueueEmpty() {
        XCTAssertTrue(service.failedItems.isEmpty)
    }

    func test_failedItems_populatesAfterPermanentFailure() async {
        let item = await enqueueAndFailPermanently()
        XCTAssertEqual(service.failedItems.map(\.id), [item.id])
    }

    func test_retry_republishesAndClearsFromFailedItems() async {
        let item = await enqueueAndFailPermanently()

        // Retry re-enqueues and auto-drains immediately (SDK's M5 pattern) —
        // let this attempt succeed so the outcome (fully drained) is
        // deterministic instead of racing a still-throwing handler.
        await StoryPublishQueue.shared.setPublishHandler { _ in "server-ok" }
        await service.retry(item)

        for _ in 0..<200 {
            let pending = await service.pendingItems()
            if !pending.contains(where: { $0.id == item.id }) { break }
            await Task.yield()
        }
        let pending = await service.pendingItems()
        XCTAssertFalse(pending.contains { $0.id == item.id },
                       "a successful retry republishes the item and drains it from the queue")
        XCTAssertTrue(service.failedItems.isEmpty)
    }

    func test_discard_removesItemFromFailedItemsAndQueue() async {
        let item = await enqueueAndFailPermanently()

        await service.discard(service.failedItems[0])

        XCTAssertTrue(service.failedItems.isEmpty)
        let stillInQueue = await StoryPublishQueue.shared.failedPendingItems
        XCTAssertFalse(stillInQueue.contains { $0.id == item.id })
    }

    // MARK: - E10 : sweep des dossiers médias orphelins

    func test_orphanedQueueDirectories_keepsLiveAndRecentDirs() {
        let live = URL(fileURLWithPath: "/q/pending_live")
        let oldOrphan = URL(fileURLWithPath: "/q/pending_dead")
        let freshOrphan = URL(fileURLWithPath: "/q/pending_fresh")
        let now = Date()
        let dates: [String: Date] = [
            "pending_live": now.addingTimeInterval(-7200),
            "pending_dead": now.addingTimeInterval(-7200),
            "pending_fresh": now.addingTimeInterval(-60),
        ]

        let orphans = StoryPublishService.orphanedQueueDirectories(
            children: [live, oldOrphan, freshOrphan],
            liveTempIds: ["pending_live"],
            cutoff: now.addingTimeInterval(-3600),
            modificationDate: { dates[$0.lastPathComponent] }
        )

        XCTAssertEqual(orphans, [oldOrphan],
                       "Only unclaimed directories older than the cutoff are swept — live items and freshly created dirs (enqueue race) survive")
    }

    func test_orphanedQueueDirectories_missingMtime_treatedAsOld() {
        let unknown = URL(fileURLWithPath: "/q/pending_unknown")
        let orphans = StoryPublishService.orphanedQueueDirectories(
            children: [unknown], liveTempIds: [],
            cutoff: Date().addingTimeInterval(-3600),
            modificationDate: { _ in nil }
        )
        XCTAssertEqual(orphans, [unknown])
    }
}
