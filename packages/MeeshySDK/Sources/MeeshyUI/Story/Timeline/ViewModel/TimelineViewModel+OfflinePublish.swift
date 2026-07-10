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
    ///
    /// - Parameter originalLanguage: BCP-47 source language tag stamped onto
    ///   the queued item. Required by the Prisme Linguistique pipeline so the
    ///   gateway can route NLLB-200 translations correctly when the item
    ///   flushes after reconnect. Defaults to `StoryComposerViewModel
    ///   .resolveComposerSourceLanguage(user: AuthManager.shared.currentUser)`
    ///   which honours the user's in-app `systemLanguage` / `regionalLanguage`
    ///   preference (NEVER the device locale). Callers should pass an explicit
    ///   value when the composer's source language is already known.
    public func handlePublishTap(
        visibility: StoryVisibility,
        originalLanguage: String = StoryComposerViewModel
            .resolveComposerSourceLanguage(user: AuthManager.shared.currentUser),
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared,
        offlineQueue: OfflineQueueProviding = StoryOfflineQueue.shared,
        onlinePublisher: TimelineOnlinePublishing = StubOnlinePublisher()
    ) async {
        if networkMonitor.isOnline {
            // Online path: hand off to the injected online publisher with the
            // serialised project payload. Fall back to offline queue if the
            // attempt fails so the user's work is never silently discarded.
            let item = buildOfflineQueueItem(visibility: visibility,
                                             originalLanguage: originalLanguage)
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
        let item = buildOfflineQueueItem(visibility: visibility,
                                         originalLanguage: originalLanguage)
        await offlineQueue.enqueue(item)
        errorMessage = nil
        showOfflineQueuedConfirmation = true
    }

    /// Resets the snackbar confirmation flag after the view has shown it.
    public func dismissOfflineQueuedConfirmation() {
        showOfflineQueuedConfirmation = false
    }

    // MARK: - Private helpers

    /// Returns the set of clip ids that belong to `project.audioPlayerObjects`.
    /// Used to route entries from `pendingMediaURLs` into the correct map
    /// (`audioURLPaths` vs `mediaURLPaths`) on the offline queue item.
    ///
    /// Single source of truth = the project's own structure. Extension-based
    /// detection (`.m4a`/`.mp3`/…) would be fragile for generated TTS variants
    /// or test fixtures with synthetic URLs; the project model already knows
    /// which clips are audio.
    private func audioClipIds() -> Set<String> {
        Set(project.audioPlayerObjects.map(\.id))
    }

    /// Builds the offline queue snapshot. `originalLanguage` is stamped onto
    /// the persisted item so the gateway can route NLLB-200 translations on
    /// flush — passing `nil` would break the Prisme Linguistique pipeline
    /// (P0 data-integrity regression). The caller is expected to resolve the
    /// language up-front via `StoryComposerViewModel.resolveComposerSourceLanguage`
    /// so that this helper stays a pure transformer of `project` + inputs.
    internal func buildOfflineQueueItem(
        visibility: StoryVisibility,
        originalLanguage: String
    ) -> StoryOfflineQueueItem {
        let slideIds = project.mediaObjects.map { $0.id }
            + project.audioPlayerObjects.map { $0.id }
            + project.textObjects.map { $0.id }

        // Split `pendingMediaURLs` into video/image (`mediaURLPaths`) vs
        // audio (`audioURLPaths`) so the queue flush can route uploads to the
        // correct asset endpoints on reconnect. Without this split, audio URLs
        // were silently dropped — guaranteed data loss on crash recovery.
        let audioIds = audioClipIds()
        var mediaPaths: [String: String] = [:]
        var audioPaths: [String: String] = [:]
        for (clipId, url) in pendingMediaURLs {
            if audioIds.contains(clipId) {
                audioPaths[clipId] = url.path
            } else {
                mediaPaths[clipId] = url.path
            }
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

        // Defensive invariant: an empty / whitespace-only language tag would
        // break the gateway's NLLB-200 routing exactly the same way `nil` does.
        // Fall back to the Prisme Linguistique default (`"fr"`) so an upstream
        // bug never leaks into the persisted item.
        let resolvedLanguage = originalLanguage
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let safeLanguage = resolvedLanguage.isEmpty ? "fr" : resolvedLanguage

        return StoryOfflineQueueItem(
            slideIds: slideIds,
            slidePayloadJSON: payloadJSON,
            mediaURLPaths: mediaPaths,
            audioURLPaths: audioPaths,
            originalLanguage: safeLanguage,
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
