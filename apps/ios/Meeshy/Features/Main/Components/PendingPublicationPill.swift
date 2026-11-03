import Foundation
import MeeshySDK

/// **Quelle entrée de la pastille est une publication qu'on peut encore
/// annuler** (#10331).
///
/// Une ligne `.createPost` vise sa carte optimiste, dont l'id est le cmid de la
/// ligne (`OutboxUIItem.mapCreatePost`) : tant qu'il n'a pas été remplacé par
/// l'id serveur, rien n'est publié — la même lecture que
/// `PendingPublicationMarker` sur la carte du fil. Un repost vise un post
/// SERVEUR : il n'a pas d'envoi de publication à annuler.
nonisolated enum PendingPublicationPill {
    static func cancellableId(for item: OutboxUIItem) -> String? {
        guard case .post(let id) = item.source, ClientMutationId.isValid(id) else { return nil }
        return id
    }
}
