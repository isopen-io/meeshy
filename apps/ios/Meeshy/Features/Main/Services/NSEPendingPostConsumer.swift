import Foundation
import MeeshySDK
import os

/// Drains posts that the Notification Service Extension prefetched into the App
/// Group (one `APIPost` JSON blob per `nse_pending_posts/{postId}.json`) and
/// seeds them into the feed cache that `PostDetailViewModel.loadPost` reads.
///
/// Without this, tapping a SOCIAL notification (post_comment, comment_reply,
/// story_new_comment, …) on cold start opened the post detail on an empty state
/// while the post fetch was in flight — "on ne tombe sur aucune donnée".
///
/// Mirrors `NSEPendingMessageConsumer`: own directory read (no cross-target
/// dependency on the NSE's `NSEDataSync`), same ISO8601 date decoding.
@MainActor
final class NSEPendingPostConsumer {
    static let shared = NSEPendingPostConsumer()

    private static let appGroupId = "group.me.meeshy.apps"
    private static let pendingDirName = "nse_pending_posts"
    private let logger = Logger(subsystem: "me.meeshy.app", category: "nse-post-consumer")

    private init() {}

    func consumeAll() async {
        let pending = readPending()
        guard !pending.isEmpty else { return }

        logger.info("Consuming \(pending.count) NSE-prefetched posts")

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            let fmtFrac = ISO8601DateFormatter()
            fmtFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fmtFrac.date(from: dateStr) { return date }
            let fmtBasic = ISO8601DateFormatter()
            fmtBasic.formatOptions = [.withInternetDateTime]
            if let date = fmtBasic.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }

        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []

        let fm = FileManager.default
        var merged = 0
        for item in pending {
            guard let apiPost = try? decoder.decode(APIPost.self, from: item.data) else {
                // Corrupt/undecodable payload — it will never decode, so drop it
                // instead of re-reading it every launch.
                try? fm.removeItem(at: item.url)
                continue
            }
            let feedPost = apiPost.toFeedPost(preferredLanguages: langs)
            // PostDetailViewModel.loadPost keys the feed store by postId and reads
            // `.first`, so seed exactly that key. A `.fresh` hit then renders the
            // post from local data instead of a blank state on a cold-start tap.
            do {
                try await CacheCoordinator.shared.feed.save([feedPost], for: apiPost.id)
                // Only drop the prefetch file once the post is safely cached, so a
                // transient save failure leaves it on disk to retry next launch
                // instead of silently losing the post.
                try? fm.removeItem(at: item.url)
                merged += 1
            } catch {
                logger.error("Failed to seed NSE post \(apiPost.id): \(error.localizedDescription)")
            }
        }

        if merged > 0 {
            logger.info("Merged \(merged) NSE posts into the feed cache")
        }
    }

    /// Reads (without deleting) every prefetched post blob. Deletion is deferred
    /// to ``consumeAll`` and happens only after a successful decode + cache save,
    /// so a transient failure never drops a prefetched post off disk.
    private func readPending() -> [(url: URL, data: Data)] {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.appGroupId
        ) else { return [] }

        let dir = container.appendingPathComponent(Self.pendingDirName, isDirectory: true)
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return []
        }

        var results: [(url: URL, data: Data)] = []
        for file in files where file.pathExtension == "json" {
            guard let data = try? Data(contentsOf: file) else { continue }
            results.append((url: file, data: data))
        }
        return results
    }
}
