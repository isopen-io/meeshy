import Foundation
import SocketIO

protocol RetirableTransport: AnyObject {
    var reconnects: Bool { get set }
    func disconnect()
}

extension SocketManager: RetirableTransport {}

/// Les transports démontés, gardés vivants le temps que leurs accusés en attente tombent.
///
/// Socket.IO arme l'expiration d'un `emitWithAck` avec une référence FAIBLE au client : libéré au démontage
/// (arrière-plan, rotation du jeton, reconnexion forcée), il n'appelait ni la réponse ni l'expiration, et la
/// tâche qui attendait — un envoi rejoué, un `call:end` — restait suspendue pour toujours.
final class SocketTransportRetirement: Sendable {
    private let retired = Locked<[any RetirableTransport]>(uncheckedState: [])
    private let grace: Duration
    private let sleep: @Sendable @concurrent (Duration) async -> Bool

    init(
        grace: Duration = .seconds(12),
        sleep: @escaping @Sendable @concurrent (Duration) async -> Bool = { await cancellableSleep(for: $0) }
    ) {
        self.grace = grace
        self.sleep = sleep
    }

    var retiredCount: Int {
        retired.mutateUnchecked { (list: inout [any RetirableTransport]) -> Int in list.count }
    }

    func retire(_ transport: (any RetirableTransport)?) {
        guard let retiring = transport else { return }
        // Le transport retiré garde ses accusés en vol, jamais sa boucle de
        // reconnexion : déjà lancée (coupure réseau), elle se tenait elle-même
        // en vie (`asyncAfter` de Socket.IO) et réessayait sans fin — un
        // transport fantôme de plus à chaque `forceReconnect` hors ligne, puis
        // N connexions ouvertes d'un coup au retour du serveur.
        retiring.reconnects = false
        retired.mutateUnchecked { (list: inout [any RetirableTransport]) -> Void in list.append(retiring) }
        let id = ObjectIdentifier(retiring)
        Task { @MainActor [weak self, grace = self.grace, sleep = self.sleep] in
            guard await sleep(grace), let self else { return }
            self.close(transportWithId: id)
        }
    }

    @MainActor
    private func close(transportWithId id: ObjectIdentifier) {
        let closing = retired.mutateUnchecked { (list: inout [any RetirableTransport]) -> [any RetirableTransport] in
            let matching = list.filter { ObjectIdentifier($0) == id }
            list.removeAll { ObjectIdentifier($0) == id }
            return matching
        }
        closing.forEach { $0.disconnect() }
    }
}
