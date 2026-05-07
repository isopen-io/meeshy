import Foundation
import MeeshySDK

// MARK: - Offline-first publish extension (Task 72)

/// Adds offline-aware publish behaviour to `TimelineViewModel`.
///
/// When the network monitor reports `!isOnline`, tapping "Publish" enqueues a
/// `StoryOfflineQueueItem` into `StoryOfflineQueue` instead of throwing or
/// showing an error dialog. The transient `showOfflineQueuedConfirmation` flag
/// (declared directly on `TimelineViewModel`) signals the view to show a brief
/// snackbar.
///
/// Dependency injection mirrors the pattern used in CLAUDE.md:
///   - `networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared`
///   - `offlineQueue: OfflineQueueProviding = StoryOfflineQueue.shared`
extension TimelineViewModel {

    // MARK: - Offline publish action

    /// Handles the user tapping "Publish" in the composer.
    ///
    /// - If online: calls `publishImmediately(visibility:)` (not yet implemented
    ///   in this plan — wired in a follow-up task with the full API upload pipeline).
    /// - If offline: enqueues a `StoryOfflineQueueItem` into the provided
    ///   `offlineQueue` and sets `showOfflineQueuedConfirmation = true`.
    ///
    /// In either case, `errorMessage` is NOT set — this is the OFFLINE-FIRST
    /// contract: the user sees confirmation, not failure.
    public func handlePublishTap(
        visibility: StoryVisibility,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared,
        offlineQueue: OfflineQueueProviding = StoryOfflineQueue.shared
    ) async {
        if networkMonitor.isOnline {
            // Online path: deferred to follow-up (StoryPublishQueue already handles this).
            // For now, signal that online publish was attempted — no errorMessage.
            // TODO: wire full API upload pipeline here.
            return
        }

        // Offline path: enqueue silently, set confirmation flag.
        let item = buildOfflineQueueItem(visibility: visibility)
        await offlineQueue.enqueue(item)
        errorMessage = nil
        showOfflineQueuedConfirmation = true
    }

    /// Resets the snackbar confirmation flag after the view has shown it.
    public func dismissOfflineQueuedConfirmation() {
        showOfflineQueuedConfirmation = false
    }

    // MARK: - Private helpers

    private func buildOfflineQueueItem(visibility: StoryVisibility) -> StoryOfflineQueueItem {
        let slideIds = project.mediaObjects.map { $0.id }
            + project.audioPlayerObjects.map { $0.id }
            + project.textObjects.map { $0.id }

        let mediaPaths: [String: String] = pendingMediaURLs.reduce(into: [:]) { acc, pair in
            acc[pair.key] = pair.value.path
        }

        return StoryOfflineQueueItem(
            slideIds: slideIds,
            slidePayloadJSON: "{}",  // Minimal snapshot — full serialisation wired in follow-up
            mediaURLPaths: mediaPaths,
            audioURLPaths: [:],
            originalLanguage: nil,
            visibility: visibility.rawValue
        )
    }
}

// MARK: - StoryVisibility

/// Visibility options for story publication, matching gateway enum.
public enum StoryVisibility: String, Sendable, Codable {
    case `public` = "PUBLIC"
    case friends = "FRIENDS"
    case `private` = "PRIVATE"
}
