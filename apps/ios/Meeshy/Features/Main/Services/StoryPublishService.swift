import Foundation
import Combine
import os
import MeeshySDK

/// App-side orchestrator for `StoryPublishQueue`. Owns three responsibilities :
///
///   1. Registers the publish handler at app startup so the queue can drive
///      retry attempts. The handler is currently a STUB that always throws
///      a retryable error — this is intentional : the actual upload flow
///      lives in `StoryViewModel.launchUploadTask` and re-routing it through
///      the queue requires reconstructing `StoryUploadState` from the
///      serialized payload, which is a sprint-level refactor (Pilier 22 V3).
///      Until that lands, the queue persists items across restarts and
///      surfaces them via `pendingItemsPublisher`, but actual publication
///      still happens through the existing direct path.
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
/// Reference: SOTA audit Pilier 22, V2 scope.
@MainActor
final class StoryPublishService: ObservableObject {
    static let shared = StoryPublishService()

    /// Number of items currently in the queue (refreshed on every queue
    /// event + on app foreground). Surface this in the UI for "N en attente"
    /// badges — pattern used by WhatsApp, Telegram for offline messaging.
    @Published private(set) var pendingCount: Int = 0

    private let logger = Logger(subsystem: "me.meeshy.app", category: "story-publish-service")
    private var cancellables = Set<AnyCancellable>()
    private var configured = false

    private init() {}

    /// Idempotent. Call once during app bootstrap (RootView.task or
    /// MeeshyApp.onAppear) to register the publish handler and start
    /// listening to the queue's events.
    func configure() {
        guard !configured else { return }
        configured = true

        Task { [weak self] in
            await self?.registerPublishHandler()
        }

        // Subscribe to the success / failure streams. The publishers are
        // exposed as nonisolated SendablePassthrough so we can subscribe
        // without entering the actor — the receive(on:) hop puts the toast
        // calls on the main thread where ToastManager expects them.
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

        logger.info("StoryPublishService configured")
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

    // MARK: - Handler registration (stub until V3)

    private func registerPublishHandler() async {
        await StoryPublishQueue.shared.setPublishHandler { [weak self] _ in
            // V2 stub : the real upload flow lives in StoryViewModel and
            // requires non-trivial state reconstruction (UIImage in-memory
            // caches, TUS resume offsets, foreground PostMedia ids …).
            // Throwing a non-Unrecoverable error keeps the item in the
            // queue with retryCount bumped — the next reconnect or app
            // foreground will trigger another attempt. When V3 lands,
            // replace this body with the actual upload logic.
            self?.logger.warning("StoryPublishQueue handler is in V2 stub mode — item kept for V3")
            throw StoryPublishV2StubError()
        }
    }

    // MARK: - Toast handlers

    private func handleSuccess(_ payload: StoryPublishSuccess) {
        logger.info("Story \(payload.tempStoryId, privacy: .public) published as \(payload.publishedStoryId, privacy: .public)")
        ToastManager.shared.showSuccess(
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
        ToastManager.shared.showError(message)
        Task { await refreshPendingCount() }
    }

    // MARK: - Pending count cache

    private func refreshPendingCount() async {
        let count = await StoryPublishQueue.shared.count
        pendingCount = count
    }
}

// MARK: - Stub error

/// Marker error thrown by the V2 publish handler stub. The queue treats it
/// as a generic retryable failure (NOT StoryPublishUnrecoverableError) so
/// the item is preserved and the retry budget is consumed normally.
private struct StoryPublishV2StubError: Error {}

// MARK: - UIKit import for foreground notification

#if canImport(UIKit)
import UIKit
#endif
