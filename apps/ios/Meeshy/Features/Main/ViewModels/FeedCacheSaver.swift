import Foundation
import MeeshySDK

/// Sauvegarde débouncée de la liste du fil dans le cache : possède la tâche
/// d'écriture en attente (un nouvel appel annule la précédente).
final class FeedCacheSaver {
    nonisolated deinit {}

    private let feedCache: any FeedCacheStoring
    private var cacheSaveTask: Task<Void, Never>?

    init(feedCache: any FeedCacheStoring) {
        self.feedCache = feedCache
    }

    func save(_ posts: [FeedPost]) {
        cacheSaveTask?.cancel()
        let snapshot = posts
        cacheSaveTask = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            // cache-03 étape A — GRDBCacheStore.save() trimme par suffix(max)
            // (garde les items les PLUS ANCIENS) alors que `posts` est
            // newest-first : sans ce prefix(100), au-delà de 100 posts
            // accumulés le cold start sert la tranche la plus vieille en
            // .fresh. Miroir de ProfileUserPostsList.
            await bestEffort("feedCacheSaver.feedCache.savePreservingFreshness", category: .cache) { try await feedCache.savePreservingFreshness(Array(snapshot.prefix(100)), for: "main-feed") }
        }
    }
}
