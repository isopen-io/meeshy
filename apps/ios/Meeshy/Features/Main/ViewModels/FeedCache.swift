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
}
