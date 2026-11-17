import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Le magasin de cache du fil, réduit aux quatre opérations que le ViewModel
/// lui demande. Couture d'injection (règle iOS : toute dépendance entre par
/// l'init, `.shared` par défaut) — elle permet à un test de RETENIR une
/// sauvegarde et de prouver que `loadFeed` l'attend, ce qu'aucun test contre
/// `CacheCoordinator.shared` ne pouvait faire de façon déterministe.
protocol FeedCacheStoring: Sendable {
    func load(for key: String) async -> CacheResult<[FeedPost]>
    func save(_ items: [FeedPost], for key: String) async throws
    func savePreservingFreshness(_ items: [FeedPost], for key: String) async throws
    func patchEverywhere(itemId: String, mutate: @Sendable (inout FeedPost) -> Void) async
    func removeEverywhere(itemId: String) async
}

extension GRDBCacheStore: FeedCacheStoring where Key == String, Value == FeedPost {}

/// Le magasin partagé, atteint par saut d'acteur à chaque appel : la valeur
/// par défaut d'un init `@MainActor` ne peut pas lire
/// `CacheCoordinator.shared.feed` (propriété d'un acteur d'un autre module)
/// sans `await`. Ce relais le fait au moment de chaque opération.
struct SharedFeedCache: FeedCacheStoring {
    func load(for key: String) async -> CacheResult<[FeedPost]> {
        await CacheCoordinator.shared.feed.load(for: key)
    }

    func save(_ items: [FeedPost], for key: String) async throws {
        try await CacheCoordinator.shared.feed.save(items, for: key)
    }

    func savePreservingFreshness(_ items: [FeedPost], for key: String) async throws {
        try await CacheCoordinator.shared.feed.savePreservingFreshness(items, for: key)
    }

    func patchEverywhere(itemId: String, mutate: @Sendable (inout FeedPost) -> Void) async {
        await CacheCoordinator.shared.feed.patchEverywhere(itemId: itemId, mutate: mutate)
    }

    func removeEverywhere(itemId: String) async {
        await CacheCoordinator.shared.feed.removeEverywhere(itemId: itemId)
    }
}

/// L'engagement d'un post (like posé ou retiré) écrit dans TOUTES ses copies — chaque clé du cache du
/// fil (`patchEverywhere` : fil, détail, favoris, réels) et sa ligne GRDB —, sur UNE file, dans l'ordre
/// des gestes (#18939). Deux `Task.detached` n'étaient pas ordonnés : un like suivi d'un retrait rapide
/// pouvait laisser ces copies « aimé » jusqu'à l'écho du socket, et jusqu'à la reconnexion hors ligne.
@MainActor
final class FeedEngagementWrites {
    nonisolated deinit {}

    private let feedCache: any FeedCacheStoring
    private var tail: Task<Void, Never>?

    init(feedCache: any FeedCacheStoring) {
        self.feedCache = feedCache
    }

    /// Prend son rang dès l'appel, avant toute attente de l'appelant : l'ordre des écritures est celui
    /// des appels.
    func like(postId: String, isLiked: Bool, likes: Int, persistence: FeedPersistenceActor?) {
        let previous = tail
        let feedCache = feedCache
        tail = Task {
            await previous?.value
            await feedCache.patchEverywhere(itemId: postId) {
                $0.isLiked = isLiked
                $0.likes = likes
            }
            guard let persistence else { return }
            await bestEffort("feedEngagementWrites.updateLikeCount", category: .grdb) {
                try await persistence.updateLikeCount(postId: postId, count: likes, isLikedByMe: isLiked)
            }
        }
    }

    /// Rend la main quand toutes les écritures déjà demandées sont faites.
    func settled() async {
        await tail?.value
    }
}
