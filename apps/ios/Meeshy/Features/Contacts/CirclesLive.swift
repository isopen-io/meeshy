import Combine
import Foundation
import MeeshySDK

/// Le câblage de production de « Mes cercles » (#13938). Les ViewModels reçoivent leurs dépendances par `init` ; ce
/// fichier est le seul endroit qui nomme les singletons, pour que chaque dépendance reste remplaçable par un double.

/// Le store des liens, lu à la demande : `CacheCoordinator` est un acteur, on l'attend à chaque lecture.
nonisolated enum CirclesLinkStore {
    static let live: @concurrent @Sendable () async -> GRDBCacheStore<String, RelationLink> = {
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

extension ProfileCircleViewModel {
    convenience init(userId: String) {
        self.init(
            userId: userId,
            relations: RelationsService.shared,
            friendService: FriendService.shared,
            offlineQueue: OfflineQueue.shared,
            networkMonitor: NetworkMonitor.shared,
            forgetFriendship: { userId in
                FriendshipCache.shared.didRemoveFriend(userId)
                await FriendshipCache.shared.invalidatePersistedFriendCaches()
            }
        )
    }
}

/// Le magasin des positions qu'on me partage, UN par compte connecté : un autre compte sur le même appareil repart d'un
/// magasin vide, jamais de celui du précédent (une position servie à A ne s'affiche jamais chez B).
enum SharedLocationsLiveHolder {
    private static var current: (userId: String, live: SharedLocationsLive)?

    static func live() -> SharedLocationsLive {
        let userId = AuthManager.shared.currentUser?.id ?? ""
        if let current, current.userId == userId { return current.live }
        let live = SharedLocationsLive(
            viewerId: { userId },
            snapshot: { bounds in try await RelationsService.shared.sharedLocations(within: bounds) },
            connected: MessageSocketManager.shared.$connectionState
                .map { $0 == .connected }
                .eraseToAnyPublisher()
        )
        current = (userId, live)
        return live
    }
}

extension SharedLocationsMapViewModel {
    convenience init() {
        self.init(
            live: SharedLocationsLiveHolder.live(),
            people: CirclePeopleDirectory.shared,
            presence: { PresenceManager.shared.knownPresenceState(for: $0) },
            presenceRefresh: PresenceManager.shared.refreshSignal.$presenceVersion
                .map { _ in () }
                .eraseToAnyPublisher()
        )
    }
}
