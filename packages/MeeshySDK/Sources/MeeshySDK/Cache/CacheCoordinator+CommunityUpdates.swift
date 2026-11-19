import Foundation
import Combine

// MARK: - L'identité d'une communauté, à jour dans le cache persisté (#18439)

extension CacheCoordinator {

    /// `community:updated` : renommage, avatar, bannière, description ou
    /// confidentialité écrits par un administrateur. La ligne est réécrite sous
    /// TOUTES les clés qui la tiennent, mémoire comme base, sans relance
    /// réseau — le prochain démarrage à froid ne ressert pas l'ancien nom.
    /// La fraîcheur est préservée : elle appartient au chargement.
    func subscribeToCommunityUpdates() {
        let lane = OrderedEventLane()
        lane.store(in: &cancellables)
        messageSocket.communityUpdated
            .relay(through: lane) { [weak self] in await self?.applyCommunityUpdate($0) }
            .store(in: &cancellables)
    }

    func applyCommunityUpdate(_ event: CommunityUpdatedEvent) async {
        await communities.repaintEverywhere { $0.applying(event) }
    }
}

// MARK: - L'effectif d'une communauté, à jour dans le cache persisté (#18767)

extension CacheCoordinator {

    /// `community:member-*` : `memberCount` se recopie sous TOUTES les clés qui
    /// tiennent la ligne, et le rôle du lecteur suit un geste qui le concerne
    /// (sorti ⇒ plus de rôle). Aucune relance réseau ; la fraîcheur appartient
    /// au chargement.
    func subscribeToCommunityMemberChanges() {
        let lane = OrderedEventLane()
        lane.store(in: &cancellables)
        messageSocket.communityMemberChanged
            .relay(through: lane) { [weak self] in await self?.applyCommunityMemberChange($0) }
            .store(in: &cancellables)
    }

    func applyCommunityMemberChange(_ change: CommunityMemberChange) async {
        let readerId = currentUserId
        await communities.repaintEverywhere { $0.applying(change, readerId: readerId) }
    }
}

// MARK: - La disparition d'une communauté, hors du cache persisté (#19591)

extension CacheCoordinator {

    /// `community:deleted` : la communauté sort de TOUTES les clés qui la
    /// tiennent, mémoire comme base — le prochain démarrage à froid ne la
    /// ressert pas, et le partage ne la propose plus. Aucune relance réseau.
    func subscribeToCommunityDeletions() {
        let lane = OrderedEventLane()
        lane.store(in: &cancellables)
        messageSocket.communityDeleted
            .relay(through: lane) { [weak self] in await self?.applyCommunityDeletion($0) }
            .store(in: &cancellables)
    }

    func applyCommunityDeletion(_ communityId: String) async {
        await communities.removeEverywhere(itemId: communityId)
    }
}
