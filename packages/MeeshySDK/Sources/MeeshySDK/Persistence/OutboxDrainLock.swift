import Foundation
import GRDB

/// #16659 — un seul envoi à la fois par VOIE d'une base, à l'échelle du
/// processus.
///
/// Chaque déclencheur (démarrage, retour au premier plan, `isConnected`,
/// `didReconnect`, mise en file) construit son propre `OutboxFlusher` sur le
/// même pool. L'isolation d'acteur sérialise les passes d'UNE instance, jamais
/// celles de deux instances : pendant que la passe A attendait le réseau sur la
/// ligne 1, la passe B lisait les lignes 2…n et les postait sur la connexion
/// déjà chaude. La passerelle horodatant à l'arrivée, l'arriéré écrit hors
/// ligne arrivait dans le désordre, puis l'écho réordonnait les bulles de
/// l'expéditeur. `claimPending` empêche le double envoi ; ce verrou garde
/// l'ORDRE : une ligne ne se réclame que voie tenue, et une passe qui arrive
/// pendant l'envoi d'une autre sur la même voie attend qu'il aboutisse.
///
/// La voie est la CONVERSATION, jamais la file entière : un post dont le
/// média se téléverse pendant des minutes (TUS, dans `dispatch`) ne retient ni
/// le message, ni la réaction, ni l'accusé qu'on envoie pendant ce temps. Une
/// ligne sans conversation (post, profil, demande d'ami) a la voie de son
/// genre : deux posts gardent leur ordre entre eux.
actor OutboxDrainLock {
    static let shared = OutboxDrainLock()

    struct Lane: Hashable {
        let base: ObjectIdentifier
        let name: String
    }

    private var waitersByLane: [Lane: [CheckedContinuation<Void, Never>]] = [:]

    func acquire(_ lane: Lane) async {
        guard waitersByLane[lane] != nil else {
            waitersByLane[lane] = []
            return
        }
        await withCheckedContinuation { waitersByLane[lane, default: []].append($0) }
    }

    func release(_ lane: Lane) {
        guard let waiters = waitersByLane[lane] else { return }
        guard let next = waiters.first else {
            waitersByLane[lane] = nil
            return
        }
        waitersByLane[lane] = Array(waiters.dropFirst())
        next.resume()
    }

    static func lane(of record: OutboxRecord, in pool: any DatabaseWriter) -> Lane {
        let conversation = record.conversationId
        let unanchored = conversation.isEmpty || conversation == OfflineQueue.globalConversationSentinel
        return Lane(
            base: ObjectIdentifier(pool as AnyObject),
            name: unanchored ? "kind:\(record.kind.rawValue)" : "conversation:\(conversation)"
        )
    }
}
