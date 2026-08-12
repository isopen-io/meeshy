import Foundation
import os
import MeeshySDK

// MARK: - Offline-publish payload builder (Task 72)
//
// `handlePublishTap` (the online/offline orchestration entry point),
// `TimelineOnlinePublishing` and `StubOnlinePublisher` were removed S6 (dead
// code cleanup — confirmed zero call sites outside their own 3 test files,
// across all of `apps/ios` and `packages/MeeshySDK/Sources`). What survives
// below is `buildOfflineQueueItem` (+ its `audioClipIds` helper and the
// `StoryVisibility` enum it takes as a parameter): it is NOT dead — it is
// exercised directly by `TimelineOfflinePayloadSchemaTests`, which pins a
// real production bug (WS5.2 — the composed story was permanently dropped on
// offline flush before this payload shape existed). Removing it alongside
// `handlePublishTap` would have deleted live regression coverage for a bug
// that actually shipped.

/// Adds the offline-queue payload builder to `TimelineViewModel`.
extension TimelineViewModel {

    // MARK: - Logger

    internal var offlinePublishLogger: Logger {
        Logger(subsystem: "me.meeshy.app", category: "media")
    }

    /// Resets the snackbar confirmation flag after the view has shown it.
    /// Still called in production by `TimelineBanner.swift` even though the
    /// only writer of `showOfflineQueuedConfirmation` (`handlePublishTap`)
    /// was removed S6 — the flag can no longer flip `true` in practice, but
    /// the reset stays a live compile-time surface `TimelineBanner` depends on.
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
    /// language up-front (défaut : `StoryComposerViewModel.defaultSourceLanguage`)
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

        // Serialize the project as a single-element `[StorySlide]` so the queue
        // can replay it through the ONE executor (`StoryViewModel
        // .executeQueuedPublish`), which decodes `[StorySlide].self`. Encoding a
        // bare `TimelineProject` here would fail that decode → the composed story
        // is dropped as unrecoverable. `TimelineProject.apply` carries the
        // mediaObjects / audioPlayerObjects / textObjects / clipTransitions onto
        // the slide so no timeline content is lost on reconnect.
        //
        // SCOPE LIMITATION (F5): the slide is seeded FRESH (`StorySlide(id:)`),
        // not from the originally-edited `StorySlide`, because `TimelineViewModel`
        // only retains the derived `TimelineProject` — the source slide is not
        // reachable at this call site. `TimelineProject` models ONLY the timeline
        // fields (mediaObjects / audio / text / clipTransitions / duration), so a
        // timeline slide carrying non-timeline effects (`effects.background`,
        // `filter`, `drawingStrokes`, `stickers`, slide `content`) loses them on
        // offline flush. This is NO WORSE than pre-WS5.2 (which THREW and dropped
        // the whole story); the proper fix threads the source slide into the
        // composer→timeline boot so it can be seeded here. The encode/decode of
        // the timeline fields themselves (mediaObjects / audio / text /
        // clipTransitions) is round-trip-pinned by
        // `TimelineOfflinePayloadSchemaTests`.
        let payloadJSON: String = {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            var slide = StorySlide(id: project.slideId)
            project.apply(to: &slide)
            guard let data = try? encoder.encode([slide]),
                  let json = String(data: data, encoding: .utf8) else {
                offlinePublishLogger.error(
                    "Failed to serialise timeline slide for offline queue — falling back to empty payload"
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
