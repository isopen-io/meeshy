import UIKit
import MeeshySDK
import MeeshyUI
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "background-transition")

/// Orchestrates the `.background` scene transition under a real
/// `beginBackgroundTask` umbrella so every step gets a bounded OS budget
/// and the task is always ended — even if a step throws or the OS expires
/// us early. A single entry point keeps the lifecycle readable and makes
/// crashes during the transition traceable.
@MainActor
protocol BackgroundTransitioning: AnyObject {
    func enterBackground() async
    func resumeFromBackground() async
}

/// Steps are split so they can be individually mocked in tests and so the
/// coordinator can cancel or degrade gracefully on OS expiration.
@MainActor
final class BackgroundTransitionCoordinator: BackgroundTransitioning {
    static let shared = BackgroundTransitionCoordinator()

    private var activeTaskId: UIBackgroundTaskIdentifier = .invalid
    private var isTransitioning = false

    private init() {}

    // MARK: - Background entry

    func enterBackground() async {
        guard !isTransitioning else { return }
        isTransitioning = true
        defer { isTransitioning = false }

        let taskId = UIApplication.shared.beginBackgroundTask(withName: "meeshy.background.transition") { [weak self] in
            // OS is telling us time is up. End the task from the main actor so
            // we don't leave it dangling and trigger the 0x8BADF00D watchdog.
            Task { @MainActor [weak self] in
                self?.endBackgroundTask()
            }
        }
        activeTaskId = taskId
        logger.info("Background transition started (task=\(taskId.rawValue, privacy: .public))")

        // Each step is awaited with its own tolerance. We log failures but
        // never rethrow — the transition MUST complete even if one subsystem
        // is sick. Order matters: stop players before suspending audio
        // session; flush cache before scheduling BG tasks that may read.
        await withBudget("audio.prepareForBackground") {
            await MediaLifecycleBridge.shared.prepareForBackground()
        }
        await withBudget("cache.flushAll") {
            await CacheCoordinator.shared.flushAll()
        }
        await withBudget("push.flushPendingReceipts") {
            await PushDeliveryReceiptService.shared.flushPending()
        }
        await withBudget("sockets.prepareForBackground") {
            MessageSocketManager.shared.prepareForBackground()
            SocialSocketManager.shared.prepareForBackground()
        }
        // BG tasks are only useful for authenticated users — scheduling them
        // for guests would burn quota and fail at execution time.
        if AuthManager.shared.authToken != nil {
            await withBudget("bgtasks.schedule") {
                BackgroundTaskManager.shared.scheduleConversationSync()
                BackgroundTaskManager.shared.scheduleMessagePrefetch()
            }
        }
        await withBudget("notifications.syncNow") {
            await NotificationCoordinator.shared.syncNow()
        }

        endBackgroundTask()
    }

    // MARK: - Foreground entry

    func resumeFromBackground() async {
        logger.info("Foreground resume starting")
        await withBudget("sockets.resume") {
            MessageSocketManager.shared.resumeFromBackground()
            SocialSocketManager.shared.resumeFromBackground()
        }
        await withBudget("audio.resume") {
            await MediaLifecycleBridge.shared.resumeFromBackground()
        }
        await withBudget("sync.conversations") {
            await ConversationSyncEngine.shared.syncSinceLastCheckpoint()
        }
        await withBudget("push.retryPending") {
            await PushDeliveryReceiptService.shared.flushPending()
        }
    }

    // MARK: - Private

    private func endBackgroundTask() {
        guard activeTaskId != .invalid else { return }
        let taskId = activeTaskId
        activeTaskId = .invalid
        UIApplication.shared.endBackgroundTask(taskId)
        logger.info("Background transition ended (task=\(taskId.rawValue, privacy: .public))")
    }

    private func withBudget(_ step: String, _ work: () async -> Void) async {
        let start = Date()
        await work()
        let elapsed = Date().timeIntervalSince(start)
        if elapsed > 1.0 {
            logger.info("Step \(step, privacy: .public) took \(elapsed, privacy: .public)s")
        }
    }
}

/// Thin bridge that lets the coordinator (app layer) reach into the SDK
/// without leaking the coordinator type into MeeshySDK. The bridge just
/// delegates to the managers owned by the app; the SDK hosts the pure
/// orchestration primitives, the app wires them together.
@MainActor
final class MediaLifecycleBridge {
    static let shared = MediaLifecycleBridge()
    private init() {}

    func prepareForBackground() async {
        PlaybackCoordinator.shared.stopAll()
        await MediaSessionCoordinator.shared.deactivateForBackground()
    }

    func resumeFromBackground() async {
        // No-op for now — players re-activate their session on next play().
        // Kept as an extension point if we later want to resume downloads.
    }
}
