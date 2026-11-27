import Foundation
import GRDB

/// #16659 — une seule passe de vidage par base, à l'échelle du processus.
///
/// Chaque déclencheur (démarrage, retour au premier plan, `isConnected`,
/// `didReconnect`, mise en file) construit son propre `OutboxFlusher` sur le
/// même pool. L'isolation d'acteur sérialise les passes d'UNE instance, jamais
/// celles de deux instances : pendant que la passe A attend le réseau sur la
/// ligne 1, la passe B lisait les lignes 2…n et les postait sur la connexion
/// déjà chaude. La passerelle horodatant à l'arrivée, l'arriéré écrit hors
/// ligne arrivait dans le désordre, puis l'écho réordonnait les bulles de
/// l'expéditeur. `claimPending` empêche le double envoi ; ce verrou garde
/// l'ORDRE : une passe qui arrive pendant une autre attend qu'elle finisse,
/// puis relit la file.
actor OutboxDrainLock {
    static let shared = OutboxDrainLock()

    private var waitersByBase: [ObjectIdentifier: [CheckedContinuation<Void, Never>]] = [:]

    func acquire(_ base: ObjectIdentifier) async {
        guard waitersByBase[base] != nil else {
            waitersByBase[base] = []
            return
        }
        await withCheckedContinuation { waitersByBase[base, default: []].append($0) }
    }

    func release(_ base: ObjectIdentifier) {
        guard let waiters = waitersByBase[base] else { return }
        guard let next = waiters.first else {
            waitersByBase[base] = nil
            return
        }
        waitersByBase[base] = Array(waiters.dropFirst())
        next.resume()
    }

    static func key(for pool: any DatabaseWriter) -> ObjectIdentifier {
        ObjectIdentifier(pool as AnyObject)
    }
}
