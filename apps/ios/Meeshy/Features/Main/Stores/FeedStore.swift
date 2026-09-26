// apps/ios/Meeshy/Features/Main/Stores/FeedStore.swift

import Foundation
// `@preconcurrency` relaxes Swift 6 strict concurrency interop checks for the
// GRDB module. Without it, the runtime injects `_swift_task_checkIsolatedSwift`
// at the invocation of @Sendable closures we pass to GRDB, which then aborts because GRDB calls the closure from its own reader/writer
// dispatch queue (not from any actor's executor).
@preconcurrency import GRDB
import MeeshySDK

/// Fetches the feed page. Declared at file scope AND `nonisolated` so the
/// closure passed to `reader.read` inherits no actor isolation — under the
/// app's default MainActor isolation a plain file-scope function is still
/// MainActor, which both pinned the read to the main thread and is what
/// tripped the Swift 6 runtime isolation check GRDB invocations used to hit.
/// Same shape as `MessageStore`'s `fetchMessageWindow`, read detached.
private nonisolated func fetchFeedPosts(reader: any DatabaseWriter, limit: Int) throws -> [PostRecord] {
    try reader.read { db in
        try PostRecord.order(Column("createdAt").desc).limit(limit).fetchAll(db)
    }
}

/// Offline reader of `feed_posts`: `FeedViewModel.loadMoreIfNeeded` reads the
/// next window from here when the network fails. It reads ON DEMAND only —
/// re-reading the window after every feed commit (likes, comments,
/// translations) fed no subscriber once the GRDB-driven list was gone (#7945).
@MainActor
public final class FeedStore {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private(set) var posts: [PostRecord] = []
    private let persistence: FeedPersistenceActor

    init(persistence: FeedPersistenceActor) {
        self.persistence = persistence
    }

    private var loadedCount = 50
    private var refreshGeneration = 0

    // MARK: - Off-main DB read

    /// Re-reads and decodes the whole loaded window off the main thread.
    /// Generation guard: two pagination steps can interleave across the
    /// await, and only the most recent request may publish.
    private func refreshFromDB() async {
        let reader = persistence.reader
        let limit = loadedCount
        refreshGeneration &+= 1
        let generation = refreshGeneration
        let fetched: Result<[PostRecord], any Error> = await Task.detached(priority: .userInitiated) {
            Result { try fetchFeedPosts(reader: reader, limit: limit) }
        }.value
        guard generation == refreshGeneration, case .success(let newPosts) = fetched else { return }
        posts = newPosts
    }

    // MARK: - Load Initial

    func loadInitial() async {
        await refreshFromDB()
    }

    // MARK: - Pagination

    func loadOlder() async -> Bool {
        guard posts.last != nil else { return false }
        let previousCount = loadedCount
        loadedCount += 20
        await refreshFromDB()
        return posts.count > previousCount
    }
}
