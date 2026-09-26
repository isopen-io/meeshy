import Foundation

// MARK: - L'index d'une conversation, genre par genre (#8095, #8103)
//
// `conversationMedia` tient un index PAR GENRE (`ConversationMediaKind.indexKey`).
// Ce qui retire un message ou une conversation de la vue doit le retirer de
// TOUS les genres : un document supprimé qui survivrait dans l'onglet Documents
// serait un contenu fantôme — et une invalidation qui ne viserait que la clé
// nue de #8100 laisserait les six autres genres intacts.

extension CacheCoordinator {

    /// Purge tous les genres de l'index d'une conversation (sortie de la liste,
    /// historique effacé, suppression de la conversation).
    public func invalidateConversationMedia(conversationId: String) async {
        for key in ConversationMediaKind.allIndexKeys(conversationId: conversationId) {
            await conversationMedia.invalidate(for: key)
        }
    }

    /// Retire un message de tous les genres de l'index (suppression, expiration).
    public func dropFromConversationMedia(conversationId: String, messageId: String) async {
        for key in ConversationMediaKind.allIndexKeys(conversationId: conversationId) {
            await conversationMedia.update(for: key) { carriers in
                carriers.filter { $0.id != messageId }
            }
        }
    }
}
