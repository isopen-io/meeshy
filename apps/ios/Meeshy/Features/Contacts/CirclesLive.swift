import Foundation
import MeeshySDK

/// Le câblage de production de « Mes cercles » (#13938). Les ViewModels reçoivent leurs dépendances par `init` ; ce
/// fichier est le seul endroit qui nomme les singletons, pour que chaque dépendance reste remplaçable par un double.

/// Le store des liens, lu à la demande : `CacheCoordinator` est un acteur, on l'attend à chaque lecture.
nonisolated enum CirclesLinkStore {
    static let live: @Sendable () async -> GRDBCacheStore<String, RelationLink> = {
        await CacheCoordinator.shared.relationLinks
    }
}

extension CirclesViewModel {
    convenience init() {
        self.init(
            relations: RelationsService.shared,
            friendService: FriendService.shared,
            people: CirclePeopleDirectory.shared,
            offlineQueue: OfflineQueue.shared,
            networkMonitor: NetworkMonitor.shared
        )
    }
}

extension BloodRitualViewModel {
    convenience init(userId: String, displayName: String) {
        self.init(
            userId: userId,
            displayName: displayName,
            relations: RelationsService.shared,
            networkMonitor: NetworkMonitor.shared
        )
    }
}
