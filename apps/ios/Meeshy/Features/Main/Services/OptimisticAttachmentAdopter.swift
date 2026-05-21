import Foundation
import MeeshySDK
import os

/// At server ACK time, when an optimistic attachment's `fileUrl` flips from
/// `file://` (local sandbox path used during optimistic send) to `https://`
/// (canonical server URL), move the local data into the typed media cache
/// under the canonical key. The next read of the canonical URL is then an
/// instant disk hit — no re-download of media we already have on device.
///
/// No-op for the following transitions:
/// - `previousFileUrl == nil` — first insert of a received (not sent) message.
/// - `previousFileUrl` already `https://` — REST refresh, no optimistic state.
/// - `new.fileUrl` not `http(s)` — upload failed, still optimistic.
/// - Local source file missing — already cleaned up by another flow.
/// - `.file` / `.location` attachments — no typed cache to seed.
///
/// Spec note §14.3: if the message is deleted before adoption completes the
/// file may still be adopted and then evicted normally by the LRU. Accepted.
///
/// ## ⚠️ Deprecated — kept for tests only
///
/// Since commit `b8222212`, the production adoption path runs at the
/// **SDK** layer via `MessagePersistenceActor.adoptSDKLevel` (called from
/// `updateServerAckedFields` BEFORE the row UPDATE so the canonical https
/// cache key is hot the moment the UI re-renders). This app-level helper
/// has no remaining live call site — it's referenced only by
/// `OptimisticAttachmentAdopterTests.swift`.
///
/// The helper is intentionally NOT removed yet: the iOS classic xcodeproj
/// (objectVersion 63, no synchronized groups — see project memory
/// `ios-classic-pbxproj`) requires manual pbxproj surgery to drop a `.swift`
/// file, which is risky to bundle in a refactor PR. Plan: migrate the 7
/// branch-coverage tests to target `MessagePersistenceActor.updateServerAcked
/// Fields` end-to-end, then delete this file + its tests + pbxproj entries
/// in a dedicated cleanup session.
@available(*, deprecated, message: "Production path uses MessagePersistenceActor.adoptSDKLevel. Kept for branch-coverage tests; do not call from new code.")
enum OptimisticAttachmentAdopter {

    static func adoptIfNeeded(
        new: MeeshyMessageAttachment,
        previousFileUrl: String?
    ) async {
        guard let previous = previousFileUrl,
              previous.hasPrefix("file://"),
              new.fileUrl.hasPrefix("http") else { return }

        guard let localURL = URL(string: previous),
              FileManager.default.fileExists(atPath: localURL.path) else { return }

        let canonicalKey = MeeshyConfig.resolveMediaURL(new.fileUrl)?.absoluteString ?? new.fileUrl

        switch new.type {
        case .audio:
            await CacheCoordinator.shared.audio.adopt(localFile: localURL, for: canonicalKey)
        case .image:
            await CacheCoordinator.shared.images.adoptImage(localFile: localURL, for: canonicalKey)
        case .video:
            await CacheCoordinator.shared.video.adopt(localFile: localURL, for: canonicalKey)
        case .file, .location:
            return
        }
        Logger.cache.info("Adopted local attachment \(previous, privacy: .public) -> cache key \(canonicalKey, privacy: .public)")
    }
}
