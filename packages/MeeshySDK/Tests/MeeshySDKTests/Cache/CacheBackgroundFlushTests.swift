import XCTest
import GRDB
@testable import MeeshySDK

/// Tests for Task 1.3 of the iOS Local-First Wave 1 plan. The previous
/// `willTerminate` flow used a `DispatchSemaphore.wait(timeout: 4s)` to
/// block until `flushAll()` returned — which could expire mid-write and
/// drop dirty entries. The new contract:
///
/// 1. `CacheCoordinator.flushAll(deadline:)` batches dirty keys across all
///    stores in a single GRDB transaction, abandoning cleanly past the
///    deadline so partial progress is still persisted.
/// 2. `CacheBackgroundFlushTask.run(deadline:)` is the surface a
///    `BGProcessingTask` calls to complete the flush in background if the
///    app is suspended before the foreground flush wins the race.
final class CacheBackgroundFlushTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    /// Drives the deadline-aware flush directly (mock-driven, no
    /// `BGTaskScheduler` round trip — the simulator can't dispatch
    /// `BGProcessingTask` normally). The coordinator instance is bound
    /// to the task via dependency injection so we don't depend on the
    /// global `.shared` singleton.
    func test_flushAll_completesWithin30SecondsBudget() async throws {
        let db = try makeDB()
        let coordinator = CacheCoordinator(
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            db: db
        )

        try await coordinator.markDirtyForTest(count: 100)
        let initialDirty = await coordinator.dirtyCountForTest()
        XCTAssertEqual(initialDirty, 100)

        let task = CacheBackgroundFlushTask(coordinator: coordinator)
        let start = Date()

        await task.run(deadline: start.addingTimeInterval(30))

        let remainingDirty = await coordinator.dirtyCountForTest()
        XCTAssertEqual(remainingDirty, 0)
        XCTAssertLessThan(Date().timeIntervalSince(start), 30)
    }

    /// Sanity: `flushAll(deadline:)` with a deadline already in the past
    /// returns immediately without touching the dirty set — the partial
    /// progress contract (whatever was flushed before the deadline stays
    /// flushed) is preserved by `flushKeyToL2` already returning a bool.
    func test_flushAll_pastDeadline_returnsWithoutFlushing() async throws {
        let db = try makeDB()
        let coordinator = CacheCoordinator(
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            db: db
        )

        try await coordinator.markDirtyForTest(count: 10)
        let beforeCount = await coordinator.dirtyCountForTest()
        XCTAssertEqual(beforeCount, 10)

        // Deadline 1 second in the past — flush must abandon immediately.
        await coordinator.flushAll(deadline: Date().addingTimeInterval(-1))

        // The dirty set should be untouched.
        let afterCount = await coordinator.dirtyCountForTest()
        XCTAssertEqual(afterCount, 10)
    }

    /// Confirm the static task identifier matches the value declared in
    /// `Info.plist` under `BGTaskSchedulerPermittedIdentifiers`. If this
    /// drifts, `BGTaskScheduler.shared.submit(_:)` throws at runtime.
    func test_taskIdentifier_matchesInfoPlistConvention() {
        XCTAssertEqual(CacheBackgroundFlushTask.identifier, "me.meeshy.cache.background-flush")
    }
}
