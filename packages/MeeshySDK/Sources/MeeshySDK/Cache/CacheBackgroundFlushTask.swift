import Foundation
#if canImport(BackgroundTasks)
@preconcurrency import BackgroundTasks
#endif
import os

/// `BGProcessingTask` entry point that drains the `CacheCoordinator`
/// dirty set after the app is suspended or terminated. Task 1.3 of the
/// iOS Local-First Wave 1 plan introduced this surface so the previous
/// `DispatchSemaphore.wait(timeout: 4)` on `willTerminate` no longer
/// races the OS killing the process — if the foreground flush doesn't
/// finish in time the OS reschedules the task and lets us complete the
/// work in the background, where the budget is measured in tens of
/// seconds rather than four.
///
/// The task is registered once at app launch via
/// `CacheBackgroundFlushTask().register()` and submitted on the
/// `willTerminate` notification by the coordinator. The identifier
/// `me.meeshy.cache.background-flush` MUST be declared in `Info.plist`
/// under `BGTaskSchedulerPermittedIdentifiers` or `BGTaskScheduler.submit`
/// throws at runtime.
public final class CacheBackgroundFlushTask: Sendable {
    /// Stable identifier shared with `Info.plist`. Changing it requires
    /// a coordinated plist update; the test
    /// `test_taskIdentifier_matchesInfoPlistConvention` keeps the two in
    /// sync.
    public static let identifier: String = "me.meeshy.cache.background-flush"

    /// 25-second budget. iOS gives `BGProcessingTask` up to a few minutes
    /// but the OS can call our `expirationHandler` at any moment past
    /// 30s — staying under 30 leaves room for the SQLite checkpoint
    /// flush at the end without risking a forced cancel mid-write.
    private static let budget: TimeInterval = 25

    private let coordinator: CacheCoordinator
    private let logger = Logger(subsystem: "me.meeshy.app", category: "cache-bg-flush")

    public init(coordinator: CacheCoordinator = .shared) {
        self.coordinator = coordinator
    }

    /// Registers the task identifier with `BGTaskScheduler`. Idempotent —
    /// `BGTaskScheduler.register` returns `false` if the identifier was
    /// already registered, which we treat as a no-op so it's safe to
    /// call on every cold start.
    public func register() {
        #if canImport(BackgroundTasks)
        let coordinator = self.coordinator
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.identifier,
            using: nil
        ) { task in
            // BGTaskScheduler always hands us a `BGProcessingTask` here
            // because we submit `BGProcessingTaskRequest` from the
            // coordinator. The cast is checked rather than forced so a
            // future scheduling-mode change can't crash the process.
            guard let processingTask = task as? BGProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }
            CacheBackgroundFlushTask.handle(task: processingTask, coordinator: coordinator)
        }
        #endif
    }

    #if canImport(BackgroundTasks)
    /// Nonisolated entry point that owns the post-dispatch wiring: setting
    /// the expiration handler, launching the flush, and signalling
    /// completion. Splitting this out of `register()` lets us mark the
    /// `processingTask` parameter `sending` so the closure capture in the
    /// inner `Task` doesn't trip Swift 6 strict concurrency checks.
    nonisolated private static func handle(
        task processingTask: sending BGProcessingTask,
        coordinator: CacheCoordinator
    ) {
        let deadline = Date().addingTimeInterval(Self.budget)
        let logger = Logger(subsystem: "me.meeshy.app", category: "cache-bg-flush")
        processingTask.expirationHandler = {
            logger.warning("Background flush task expired before completion")
        }
        Task {
            await coordinator.flushAll(deadline: deadline)
            processingTask.setTaskCompleted(success: true)
        }
    }
    #endif

    /// Core entry point exercised by both the BGProcessingTask path and
    /// the test harness. Drives the coordinator's deadline-aware flush
    /// across every GRDB-backed store.
    public func run(deadline: Date) async {
        await coordinator.flushAll(deadline: deadline)
    }
}
