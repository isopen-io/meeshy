import Foundation
import Combine

/// Déclencheurs de drainage de l'outbox : retour du socket et retour du réseau.
/// Possède les abonnements Combine (annulés avec lui) ; ne sait rien de la file,
/// il appelle seulement le `drain` qu'on lui remet.
final class OutboxDrainTriggers {
    private var cancellables = Set<AnyCancellable>()

    func start(drain: @escaping @Sendable () async -> Void) {
        observeConnection(drain: drain)
        observeNetwork(drain: drain)
    }

    private func observeConnection(drain: @escaping @Sendable () async -> Void) {
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .dropFirst()
            .filter { $0 }
            .receive(on: DispatchQueue.global(qos: .utility))
            .sink { _ in
                Task {
                    // Brief delay to let the socket handshake complete before
                    // draining the outbox — avoids sending on an unhealthy pipe
                    // while keeping the UX snappy (was 2 000 ms, now 200 ms).
                    guard await cancellableSleep(for: QueueTiming.drainSettle) else { return }
                    await drain()
                }
            }
            .store(in: &cancellables)
    }

    /// Symétrique de `observeConnection`, mais piloté par la connectivité
    /// réseau et non par le socket. Au front montant (`isOffline` repasse à
    /// `false` — le réseau est revenu), on draine l'outbox. C'est un filet de
    /// sécurité indépendant du socket : si la reconnexion Socket.IO tarde ou
    /// n'a pas lieu, le simple retour du réseau suffit à repartir, `retryAll`
    /// envoyant en REST.
    private func observeNetwork(drain: @escaping @Sendable () async -> Void) {
        NetworkMonitor.shared.$isOffline
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.global(qos: .utility))
            .sink { _ in
                Task {
                    // Même délai que la voie socket : laisser la pile réseau
                    // se stabiliser avant de réémettre.
                    guard await cancellableSleep(for: QueueTiming.drainSettle) else { return }
                    await drain()
                }
            }
            .store(in: &cancellables)
    }
}
