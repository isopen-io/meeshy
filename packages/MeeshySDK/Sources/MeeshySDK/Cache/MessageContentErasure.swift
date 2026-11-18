import Foundation

/// **Un message dont le contenu vient de partir de la base** (#19305) : l'hôte purge ce qui le doublait ailleurs —
/// le cache de fil (`cache.messages`, L2 sur disque) et le cache des traductions (`translation_cache`, 24 h).
public struct MessageContentErasure: Sendable, Equatable {
    /// L'identifiant sous lequel les caches connaissent le message (serveur, sinon local).
    public let messageId: String
    public let conversationId: String
    /// Vue unique ouverte par ce lecteur : l'instant gravé.
    public let viewOnceOpenedAt: Date?
    /// Supprimé ou échu : l'instant de la mort.
    public let deletedAt: Date?

    public init(messageId: String, conversationId: String, viewOnceOpenedAt: Date? = nil, deletedAt: Date? = nil) {
        self.messageId = messageId
        self.conversationId = conversationId
        self.viewOnceOpenedAt = viewOnceOpenedAt
        self.deletedAt = deletedAt
    }
}

extension Notification.Name {
    /// La base vient d'effacer le contenu d'un ou plusieurs messages ; `userInfo["erasures"]` porte `[MessageContentErasure]`.
    static let messageContentErased = Notification.Name("me.meeshy.messageContentErased")
}

extension MessageContentErasure {

    /// Annonce l'effacement : le cache de fil et le cache des traductions s'alignent (`CacheCoordinator`). Une
    /// annonce n'attend personne — la base est déjà à jour, et les caches ne gardent que ce qu'elle a condamné.
    static func announce(_ erasures: [MessageContentErasure]) {
        guard !erasures.isEmpty else { return }
        NotificationCenter.default.post(name: .messageContentErased, object: nil, userInfo: ["erasures": erasures])
    }
}

extension CacheCoordinator {

    /// Le cache de fil ne garde du message que son enveloppe (`MeeshyMessage.eraseContent`), scellée « déjà ouverte »
    /// ou « supprimée » selon la transition, et ses traductions quittent mémoire et disque.
    public func applyErasure(_ erasure: MessageContentErasure) async {
        await messages.upsertPatch(for: erasure.conversationId, itemId: erasure.messageId) { msg in
            if let opened = erasure.viewOnceOpenedAt { msg.sealAsOpenedViewOnce(at: opened) }
            if let deleted = erasure.deletedAt {
                msg.deletedAt = deleted
                msg.eraseContent()
            }
        }
        invalidateTranslations(for: erasure.messageId)
    }
}
