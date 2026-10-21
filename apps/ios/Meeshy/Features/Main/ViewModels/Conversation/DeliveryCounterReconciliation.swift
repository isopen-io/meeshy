import Foundation
import MeeshySDK

/// Les compteurs de livraison à relever sur les messages de l'utilisateur :
/// ceux dont la version fraîche du cache a un statut STRICTEMENT meilleur.
/// Le dernier doublon de la fraîche l'emporte.
enum DeliveryCounterReconciliation {

    static func updates(own: [Message], fresh: [Message]) -> [MessagePersistenceActor.DeliveryCounterUpdate] {
        let freshById = Dictionary(fresh.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
        return own
            .filter(\.isMe)
            .compactMap { existing in
                guard let fresh = freshById[existing.id],
                      fresh.deliveryStatus.isBetterThan(existing.deliveryStatus)
                else { return nil }
                return MessagePersistenceActor.DeliveryCounterUpdate(
                    localId: existing.id,
                    deliveredCount: fresh.deliveredCount,
                    readCount: fresh.readCount,
                    deliveredToAllAt: fresh.deliveredToAllAt,
                    readByAllAt: fresh.readByAllAt
                )
            }
    }
}
