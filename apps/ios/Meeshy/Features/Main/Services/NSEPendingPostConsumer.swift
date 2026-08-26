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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = NSEPendingPostConsumer()

    private nonisolated static let appGroupId = "group.me.meeshy.apps"
    private nonisolated static let pendingDirName = "nse_pending_posts"
    private let logger = Logger(subsystem: "me.meeshy.app", category: "nse-post-consumer")

    /// Dossier de staging App Group — exposé pour le wipe de logout
    /// (appgroup-01), miroir de `SharePendingSendConsumer.directoryURL()`.
    nonisolated static func directoryURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
            .appendingPathComponent(pendingDirName, isDirectory: true)
    }

    private init() {}

    func consumeAll() async {
        let pending = readPending()
        guard !pending.isEmpty else { return }

        logger.info("Consuming \(pending.count) NSE-prefetched posts")

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            // Modern Date.ISO8601FormatStyle supports fractional seconds and
            // is more efficient than legacy ISO8601DateFormatter.
            if let date = try? Date(dateStr, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) {
                return date
            }
            if let date = try? Date(dateStr, strategy: .iso8601) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }

        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []

        let fm = FileManager.default
        var merged = 0
        for item in pending {
            guard let apiPost = decoder.decodeOrLog(APIPost.self, from: item.data,
                                                    field: "NSE staged post",
                                                    logger: Logger.nsePosts) else {
                // Corrupt/undecodable payload — it will never decode, so drop it
                // instead of re-reading it every launch.
                fm.removeItemLogging(at: item.url, context: "undecodable staged post", logger: Logger.nsePosts)
                continue
            }
            let feedPost = apiPost.toFeedPost(preferredLanguages: langs)
            // PostDetailViewModel.loadPost keys the feed store by postId and reads
            // `.first`, so seed exactly that key. A `.fresh` hit then renders the
            // post from local data instead of a blank state on a cold-start tap.
            do {
                try await CacheCoordinator.shared.feed.save([feedPost], for: apiPost.id)
                // The post payload (`/posts/:id`) embeds its recent comments, which
                // INCLUDE the one that triggered a `post_comment` / `comment_reply`
                // notification. Without persisting them, tapping such a notification
                // opened the post but the triggering comment was missing until a
                // separate network fetch — the data was already downloaded yet
                // dropped. Seed both comment read paths so the comment is local.
                await seedInlineComments(apiPost: apiPost, feedPost: feedPost)
                // A story / status notification opens StoryNotificationTargetScreen,
                // whose ViewModel resolves the post from StoryService's in-memory
                // by-id tray (NOT the feed cache). Ephemeral posts carry `expiresAt`;
                // seed the tray so a cold-start story tap renders from the prefetched
                // post instead of waiting on the network.
                if apiPost.expiresAt != nil {
                    StoryService.shared.cache(post: apiPost)
                }
                // Only drop the prefetch file once the post is safely cached, so a
                // transient save failure leaves it on disk to retry next launch
                // instead of silently losing the post.
                fm.removeItemLogging(at: item.url, context: "merged staged post", logger: Logger.nsePosts)
                merged += 1
            } catch {
                logger.error("Failed to seed NSE post \(apiPost.id): \(error.localizedDescription)")
            }
        }

        if merged > 0 {
            logger.info("Merged \(merged) NSE posts into the feed cache")
        }
    }

    /// Persists the post's embedded comments so a tapped comment notification
    /// renders the triggering comment from local data on a cold start.
    ///
    /// - GRDB `feed_comments` (via the shared `FeedPersistenceActor`): an additive
    ///   upsert-by-id — never clobbers, and feeds both the `CommentStore` read path
    ///   and the per-comment reaction summary.
    /// - `CacheCoordinator.comments` (what `PostDetailViewModel.loadComments` reads
    ///   first): seeded ONLY when that key is currently empty, so a richer set the
    ///   user already paginated is never overwritten by this recent-comments subset.
    private func seedInlineComments(apiPost: APIPost, feedPost: FeedPost) async {
        let apiComments = apiPost.comments ?? []
        guard !apiComments.isEmpty else { return }

        await Self.persistComments(apiComments, postId: apiPost.id, to: DependencyContainer.shared.feedPersistence)

        let feedComments = feedPost.comments
        guard !feedComments.isEmpty else { return }
        let cacheKey = "post-\(apiPost.id)"
        if case .empty = await CacheCoordinator.shared.comments.load(for: cacheKey) {
            do {
                try await CacheCoordinator.shared.comments.save(feedComments, for: cacheKey)
            } catch {
                // Les commentaires seront rechargés depuis le réseau à l'ouverture.
                Logger.nsePosts.error("Prefetched comments not cached: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Upserts a post's embedded comments into GRDB `feed_comments` (additive,
    /// keyed by id). Injectable static seam so the persistence is unit-testable
    /// without the `DependencyContainer.shared` singleton.
    static func persistComments(
        _ apiComments: [APIPostComment],
        postId: String,
        to persistence: FeedPersistenceActor
    ) async {
        for comment in apiComments {
            if let record = CommentRecord(from: comment, postId: postId) {
                do {
                    try await persistence.insertComment(record)
                } catch {
                    Logger.nsePosts.error("Prefetched comment \(comment.id, privacy: .public) not persisted: \(error.localizedDescription, privacy: .public)")
                }
            }
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

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let nsePosts = Logger(subsystem: "me.meeshy.app", category: "nse-posts")
}
