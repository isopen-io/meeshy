import Foundation
import os
import MeeshySDK

// MARK: - TimelineOnlinePublishing protocol

/// Thin protocol that decouples the online publish path from `StoryPublishQueue`'s
/// concrete API surface. A real conformer will bridge `StoryOfflineQueueItem` to
/// the `StoryPublishQueue.onPublish` handler; the default `StubOnlinePublisher`
/// always throws so the offline-queue fallback path runs until that wiring lands.
public protocol TimelineOnlinePublishing: Sendable {
    func publishTimelineItem(_ item: StoryOfflineQueueItem) async throws
}

// MARK: - StubOnlinePublisher

/// Default placeholder that makes the online-publish contract EXPLICIT instead of
/// a silent no-op. It throws immediately so the caller's catch path enqueues the
/// item in the offline queue — ensuring the user's work is never silently discarded.
///
/// Replace this default with a real `StoryPublishQueue`-backed adapter once the
/// API upload pipeline is wired (follow-up task).
public struct StubOnlinePublisher: TimelineOnlinePublishing {
    public init() {}

    public func publishTimelineItem(_ item: StoryOfflineQueueItem) async throws {
        throw NSError(
            domain: "TimelineOnlinePublishing",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey:
                "Online publish pipeline not yet wired — falling back to offline queue"]
        )
    }
}

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
///   - `onlinePublisher: TimelineOnlinePublishing = StubOnlinePublisher()`
extension TimelineViewModel {

    // MARK: - Logger

    internal var offlinePublishLogger: Logger {
        Logger(subsystem: "me.meeshy.app", category: "media")
    }

    // MARK: - Offline publish action

    /// Handles the user tapping "Publish" in the composer.
    ///
    /// - If online: attempts `onlinePublisher.publishTimelineItem(_:)`. On failure
    ///   (including the default stub), falls back to enqueuing in `offlineQueue`
    ///   so the user's work is never silently lost.
    /// - If offline: enqueues a `StoryOfflineQueueItem` into the provided
    ///   `offlineQueue` and sets `showOfflineQueuedConfirmation = true`.
    ///
    /// In either case, `errorMessage` is NOT set — this is the OFFLINE-FIRST
    /// contract: the user sees confirmation, not failure.
    public func handlePublishTap(
        visibility: StoryVisibility,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared,
        offlineQueue: OfflineQueueProviding = StoryOfflineQueue.shared,
        onlinePublisher: TimelineOnlinePublishing = StubOnlinePublisher()
    ) async {
        if networkMonitor.isOnline {
            // Online path: hand off to the injected online publisher with the
            // serialised project payload. Fall back to offline queue if the
            // attempt fails so the user's work is never silently discarded.
            let item = buildOfflineQueueItem(visibility: visibility)
            do {
                try await onlinePublisher.publishTimelineItem(item)
                errorMessage = nil
            } catch {
                await offlineQueue.enqueue(item)
                showOfflineQueuedConfirmation = true
                offlinePublishLogger.error(
                    "Online publish failed, queued for retry: \(error.localizedDescription)"
                )
            }
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

        // Serialize the full TimelineProject as JSON so the queue can replay it
        // with the same media + transitions + keyframes + text on reconnect.
        let payloadJSON: String = {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            guard let data = try? encoder.encode(project),
                  let json = String(data: data, encoding: .utf8) else {
                offlinePublishLogger.error(
                    "Failed to serialise TimelineProject for offline queue — falling back to empty payload"
                )
                return "{}"
            }
            return json
        }()

        return StoryOfflineQueueItem(
            slideIds: slideIds,
            slidePayloadJSON: payloadJSON,
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
