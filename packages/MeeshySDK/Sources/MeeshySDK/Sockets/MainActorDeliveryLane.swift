import Foundation

/// La livraison ordonnée des événements de socket au fil principal.
///
/// Une `Task { @MainActor in … }` par événement n'a pas d'ordre garanti : deux tâches non structurées vers le
/// MainActor s'exécutent selon leur priorité, que chacune hérite du fil qui l'a créée. Or les événements d'une
/// conversation s'appliquent dans l'ordre d'arrivée (LOT-01, même exigence qu'`OrderedEventLane`). Ici, UNE seule
/// tâche, isolée au MainActor, consomme un flux tamponné sans borne : chaque livraison s'exécute en entier, dans
/// l'ordre où `deliver` l'a reçue, avant la suivante.
final class MainActorDeliveryLane: Sendable {
    typealias Delivery = @MainActor @Sendable () -> Void

    private let deliveries: AsyncStream<Delivery>.Continuation

    init() {
        let (stream, continuation) = AsyncStream<Delivery>.makeStream(bufferingPolicy: .unbounded)
        deliveries = continuation
        Task { @MainActor in
            for await delivery in stream {
                delivery()
            }
        }
    }

    deinit {
        deliveries.finish()
    }

    func deliver(_ delivery: @escaping Delivery) {
        deliveries.yield(delivery)
    }
}
