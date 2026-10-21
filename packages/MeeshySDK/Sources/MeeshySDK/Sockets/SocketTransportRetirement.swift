import Foundation
import SocketIO

/// Les transports démontés, gardés vivants le temps que leurs accusés en attente tombent.
///
/// Socket.IO arme l'expiration d'un `emitWithAck` avec une référence FAIBLE au client : libéré au démontage
/// (arrière-plan, rotation du jeton, reconnexion forcée), il n'appelait ni la réponse ni l'expiration, et la
/// tâche qui attendait — un envoi rejoué, un `call:end` — restait suspendue pour toujours.
final class SocketTransportRetirement: @unchecked Sendable {
    private var retired: [SocketManager] = []
    private static let ackRetirementGrace: TimeInterval = 12

    func retire(_ transport: SocketManager?) {
        guard let retiring = transport else { return }
        // Le transport retiré garde ses accusés en vol, jamais sa boucle de
        // reconnexion : déjà lancée (coupure réseau), elle se tenait elle-même
        // en vie (`asyncAfter` de Socket.IO) et réessayait sans fin — un
        // transport fantôme de plus à chaque `forceReconnect` hors ligne, puis
        // N connexions ouvertes d'un coup au retour du serveur.
        retiring.reconnects = false
        retired.append(retiring)
        let id = ObjectIdentifier(retiring)
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.ackRetirementGrace) { [weak self] in
            guard let self else { return }
            self.retired.filter { ObjectIdentifier($0) == id }.forEach { $0.disconnect() }
            self.retired.removeAll { ObjectIdentifier($0) == id }
        }
    }
}
