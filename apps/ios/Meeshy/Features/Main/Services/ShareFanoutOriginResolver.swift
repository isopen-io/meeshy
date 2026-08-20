import Foundation

/// Décide si une ligne d'outbox de fan-out de partage peut partir.
///
/// Le consommateur de partage enfile les cibles 2..N avec le
/// `clientMessageId` LOCAL de la cible d'origine — au moment de l'enfilage,
/// l'origine n'a pas encore été envoyée, son identifiant serveur n'existe pas.
/// Le dispatcher le résout au moment de partir (`PendingIdRecord`, écrit par
/// `reconcileSuccessfulMessageSend`).
///
/// Fonction PURE : la lecture GRDB reste chez l'appelant, la décision est ici
/// et se teste sans base.
nonisolated enum ShareFanoutOriginResolver {

    enum Resolution: Equatable {
        /// Envoi ordinaire — la ligne ne participe à aucun fan-out.
        case notAFanout
        /// L'origine est acquittée : le message peut réclamer la copie de ses
        /// pièces jointes.
        case ready(serverMessageId: String)
        /// L'origine n'est pas encore acquittée. Partir maintenant livrerait un
        /// message VIDE de pièces jointes — l'appelant lève, l'outbox réessaie.
        case waitingForOrigin(clientMessageId: String)
    }

    static func resolve(
        copyAttachmentsFromClientMessageId: String?,
        resolvedServerId: String?
    ) -> Resolution {
        guard let origin = copyAttachmentsFromClientMessageId, !origin.isEmpty else {
            return .notAFanout
        }
        guard let serverId = resolvedServerId, !serverId.isEmpty else {
            return .waitingForOrigin(clientMessageId: origin)
        }
        return .ready(serverMessageId: serverId)
    }
}
