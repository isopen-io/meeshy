import Foundation
import MeeshySDK

/// Le câblage de production de la rangée « Mes cercles » de ma fiche (#18590) : le seul endroit qui nomme ses
/// singletons, sur le modèle de `CirclesLive.swift`.
extension ProfileCirclesViewModel {
    convenience init() {
        self.init(
            relations: RelationsService.shared,
            pendingRequests: FriendshipCache.shared,
            networkMonitor: NetworkMonitor.shared
        )
    }
}
