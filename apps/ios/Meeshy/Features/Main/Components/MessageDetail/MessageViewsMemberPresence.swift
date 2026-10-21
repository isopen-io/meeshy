import MeeshySDK

/// La présence servie d'un membre listé, par son COMPTE ; aucune pour un membre
/// inconnu. Partagée par les rangées de la fiche « Qui a vu » et par les cartes
/// de consommation : une seule lecture de `PresenceManager.resolvedState`.
enum MessageViewsMemberPresence {
    static func state(of participantId: String, in members: [String: PaginatedParticipant]) -> PresenceState? {
        members[participantId].map {
            PresenceManager.shared.resolvedState(userId: $0.userId, isOnline: $0.isOnline, lastActiveAt: $0.lastActiveAt)
        }
    }
}
