import Foundation
import Combine
import os
import MeeshySDK

/// Bridge between `StoryPublishQueue` (SDK actor, no UIKit awareness) and the
/// app's StoryViewModel (which owns the actual TUS upload pipeline + the
/// in-memory media). Implementers reconstruct an upload from a queue item
/// and run it to completion.
///
/// The protocol stays in the app target because it references types the SDK
/// can't see (UIImage, the concrete TUS uploader chain). The queue handler
/// in `StoryPublishService` calls through to whatever object set itself as
/// the executor — typically the `StoryViewModel` mounted in `RootView`.
@MainActor
protocol StoryPublishExecutor: AnyObject, Sendable {
    /// Runs the upload encoded in the queue item to completion. Must throw
    /// on retryable failure (network, 5xx) so the queue keeps the item, or
    /// throw `StoryPublishUnrecoverableError` for permanent failures (4xx,
    /// missing media, etc.). Returns the server-assigned post id of the
    /// published story (last slide's id for multi-slide stories).
    func executeQueuedPublish(item: StoryPublishQueueItem) async throws -> String
}

/// App-side orchestrator for `StoryPublishQueue`. Owns three responsibilities :
///
///   1. Registers the publish handler at app startup so the queue can drive
///      retry attempts. The handler delegates each queued item to the
///      app-side `StoryPublishExecutor` (mounted by RootView via
///      `setExecutor`), which reconstructs a headless `StoryUploadState`
///      from the serialized payload and runs the full TUS upload pipeline.
///      When no executor is mounted yet (boot race, post-logout window
///      before RootView mounts), the handler throws a retryable
///      `StoryPublishExecutorMissingError` so the queue preserves the item
///      until the next attempt.
///
///   2. Subscribes to the queue's success / failure publishers and surfaces
///      user-facing toasts. Centralizing this here means every queue
///      consumer (StoryViewModel, FeedViewModel, future schedulers) gets
///      consistent messaging for free.
///
///   3. Exposes a `pendingCount: Int` `@Published` so views (StoryTrayView,
///      StatusBubble) can render a "N en attente" indicator without
///      having to subscribe to the queue actor directly.
///
/// Reference: SOTA audit Pilier 22, V3 (offline-first publish).
@MainActor
final class StoryPublishService: ObservableObject {
    static let shared = StoryPublishService()

    /// Number of items currently in the queue (refreshed on every queue
    /// event + on app foreground). Surface this in the UI for "N en attente"
    /// badges — pattern used by WhatsApp, Telegram for offline messaging.
    @Published private(set) var pendingCount: Int = 0

    /// Executor that actually runs queued uploads. Set by the view that owns
    /// the StoryViewModel (typically RootView via .onAppear). Held weakly so
    /// a logout / view-rebuild does not trap stale references.
    weak var executor: StoryPublishExecutor?

    private let logger = Logger(subsystem: "me.meeshy.app", category: "story-publish-service")
    private var cancellables = Set<AnyCancellable>()
    private var configured = false

    private init() {}

    /// Sets up listeners and pendingCount refresh. Idempotent. Safe to
    /// call early in app bootstrap (before any executor is mounted) — the
    /// publish handler is NOT registered here. `setExecutor` is the single
    /// entry point that registers the handler so the queue never invokes
    /// it without an executor backing the call.
    ///
    /// This separation closes the race that existed when configure() was
    /// called before the StoryViewModel mounted : the M5 auto-drain on
    /// setPublishHandler would fire with a nil executor and burn retry
    /// budget on a guaranteed-to-fail handler.
    func configure() {
        guard !configured else { return }
        configured = true

        // Subscribe to the success / failure streams. The publishers are
        // exposed as nonisolated SendablePassthrough so we can subscribe
        // without entering the actor — the receive(on:) hop puts the toast
        // calls on the main thread where FeedbackToastManager expects them.
        StoryPublishQueue.shared.publishSucceeded.publisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.handleSuccess(payload)
            }
            .store(in: &cancellables)

        StoryPublishQueue.shared.publishFailed.publisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.handleFailure(payload)
            }
            .store(in: &cancellables)

        // Refresh the pending count on app lifecycle events so the badge
        // is accurate whether the user just unlocked the device or relaunched
        // the app.
        Task { [weak self] in
            await self?.refreshPendingCount()
        }
        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                Task { await self?.refreshPendingCount() }
            }
            .store(in: &cancellables)

        logger.info("StoryPublishService configured (listeners only — executor pending)")
    }

    /// Registers the upload executor AND the queue's publish handler. Call
    /// this AFTER the executor object is fully initialized — typically
    /// from RootView.task once the ViewModel exists. Calling it triggers
    /// the M5 auto-drain on the queue, which now has a real executor to
    /// delegate to.
    func setExecutor(_ executor: StoryPublishExecutor) {
        self.executor = executor
        Task { [weak self] in
            await self?.registerPublishHandler()
        }
    }

    // MARK: - Public surface

    /// Snapshot of the items currently in the queue. Use cases : a "Queued
    /// stories" debug screen, surfacing item-level details in a banner, etc.
    /// For just rendering a count, prefer the `@Published pendingCount`.
    func pendingItems() async -> [StoryPublishQueueItem] {
        await StoryPublishQueue.shared.pendingItems
    }

    /// Drops every queued item. Used by the "Settings → Storage → Clear
    /// pending publications" debug action. NOT exposed in production UI
    /// today since users have no way to recover lost drafts after this.
    func clearAll() async {
        await StoryPublishQueue.shared.clearAll()
        await refreshPendingCount()
    }

    // MARK: - Handler registration

    private func registerPublishHandler() async {
        await StoryPublishQueue.shared.setPublishHandler { [weak self] item in
            guard let self else { throw StoryPublishExecutorMissingError() }
            // The handler runs off the actor — hop to the main actor to
            // dereference the executor (which is @MainActor-isolated). If
            // no executor is registered (app boot race, post-logout window
            // before RootView mounts), throw a retryable error so the
            // queue preserves the item until the next attempt.
            let executor: StoryPublishExecutor? = await MainActor.run {
                self.executor
            }
            guard let executor else {
                self.logger.warning("StoryPublishQueue handler invoked with no executor — keeping item for next attempt")
                throw StoryPublishExecutorMissingError()
            }
            return try await executor.executeQueuedPublish(item: item)
        }
    }

    // MARK: - Toast handlers

    private func handleSuccess(_ payload: StoryPublishSuccess) {
        logger.info("Story \(payload.tempStoryId, privacy: .public) published as \(payload.publishedStoryId, privacy: .public)")
        FeedbackToastManager.shared.showSuccess(
            String(localized: "story.publish.queue.published",
                   defaultValue: "Story enfin publiée",
                   bundle: .main)
        )
        Task { await refreshPendingCount() }
    }

    private func handleFailure(_ payload: StoryPublishFailure) {
        let message: String
        switch payload.reason {
        case .maxRetriesReached:
            message = String(localized: "story.publish.queue.maxRetries",
                             defaultValue: "Impossible de publier la story après plusieurs tentatives. Réessaie depuis le brouillon.",
                             bundle: .main)
        case .missingLocalMedia:
            message = String(localized: "story.publish.queue.missingMedia",
                             defaultValue: "Un média n'est plus disponible. Recompose la story et publie à nouveau.",
                             bundle: .main)
        case .unrecoverable(let reason):
            message = String(
                localized: "story.publish.queue.unrecoverable",
                defaultValue: "La publication a été rejetée par le serveur : \(reason)",
                bundle: .main
            )
        }
        logger.error("Story \(payload.tempStoryId, privacy: .public) publish failed : \(message, privacy: .public)")
        FeedbackToastManager.shared.showError(message)
        Task { await refreshPendingCount() }
    }

    // MARK: - Pending count cache

    private func refreshPendingCount() async {
        let count = await StoryPublishQueue.shared.count
        pendingCount = count
    }
}

// MARK: - Sentinel errors

/// Marker error thrown when no executor has been registered yet. Kept
/// retryable (NOT StoryPublishUnrecoverableError) so the queue preserves
/// the item until the executor mounts.
private struct StoryPublishExecutorMissingError: Error {}

// MARK: - UIKit import for foreground notification

#if canImport(UIKit)
import UIKit
#endif
