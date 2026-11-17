import Combine

/// Les faits d'EFFECTIF qui rendent fausse la liste des membres en cache (#18916) :
/// une adhésion, un départ, un bannissement, sa levée — `conversation:participant-*`.
///
/// Jamais `conversation:joined` / `conversation:left` : ce sont AUSSI les accusés
/// que la passerelle rend à la seule socket à chaque ouverture et fermeture de fil,
/// et à chaque salle rejointe à la reconnexion. Les écouter vidait le cache des
/// membres à chaque ouverture : la feuille repartait du réseau, sous un squelette.
enum ParticipantRosterInvalidation {
    static func relays(
        from socket: any MessageSocketProviding,
        into cache: CacheCoordinator,
        on lane: OrderedEventLane
    ) -> [AnyCancellable] {
        let rosterChanges: [AnyPublisher<String, Never>] = [
            socket.participantJoined.map(\.conversationId).eraseToAnyPublisher(),
            socket.participantSelfLeft.map(\.conversationId).eraseToAnyPublisher(),
            socket.participantBanned.map(\.conversationId).eraseToAnyPublisher(),
            socket.participantUnbanned.map(\.conversationId).eraseToAnyPublisher()
        ]
        return rosterChanges.map { changes in
            changes.relay(through: lane) { conversationId in
                await cache.participants.invalidate(for: conversationId)
            }
        }
    }
}
