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

    // MARK: - cache-01 — flushAll/evict/dirtyCount couvrent TOUS les stores

    private func makeNotification(id: String) -> APINotification {
        APINotification(
            id: id,
            userId: "u1",
            type: "new_message",
            priority: nil,
            title: "Titre",
            subtitle: "Sous-titre",
            content: "Contenu",
            actor: nil,
            context: NotificationContext(conversationId: nil, postId: nil),
            metadata: nil,
            state: NotificationState(
                isRead: false,
                readAt: nil,
                createdAt: "2026-07-31T09:00:00.000Z",
                expiresAt: nil
            ),
            delivery: nil
        )
    }

    func test_flushAll_notificationsStoreDirty_drainsDirtySetToZero() async throws {
        let db = try makeDB()
        let coordinator = CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
        await coordinator.notifications.seedDirtyForTest(items: [("n1", [makeNotification(id: "n1")])])
        let seeded = await coordinator.notifications.dirtyKeyCount()
        XCTAssertEqual(seeded, 1, "precondition: notifications dirty")

        await coordinator.flushAll(deadline: nil)

        let remaining = await coordinator.notifications.dirtyKeyCount()
        XCTAssertEqual(remaining, 0,
                       "l'état lu des notifications (dirty-débounce 2s) doit être drainé par le flush lifecycle — sinon il se perd au kill")
    }

    func test_dirtyCountForTest_notificationsStoreDirty_countsIt() async throws {
        let db = try makeDB()
        let coordinator = CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
        await coordinator.notifications.seedDirtyForTest(items: [("n1", [makeNotification(id: "n1")])])

        let total = await coordinator.dirtyCountForTest()

        XCTAssertEqual(total, 1, "le compteur de test doit couvrir les mêmes stores que le flush")
    }

    func test_evictUnderMemoryPressure_notificationsDirty_flushesBeforeEvicting() async throws {
        let db = try makeDB()
        let coordinator = CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
        await coordinator.notifications.seedDirtyForTest(items: [("n1", [makeNotification(id: "n1")])])

        await coordinator.evictUnderMemoryPressure()

        let remaining = await coordinator.notifications.dirtyKeyCount()
        XCTAssertEqual(remaining, 0, "l'éviction sous pression doit flusher la victime dirty avant de la jeter")
    }

}
