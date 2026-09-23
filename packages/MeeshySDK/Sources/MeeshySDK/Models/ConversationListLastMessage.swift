import Foundation

/// Les règles de la liste de conversations sur son groupe « dernier message »
/// (#7548) — pures, pour que le moteur de synchro, le ViewModel et leurs
/// témoins appliquent LA MÊME décision au lieu d'en réécrire une chacun.
public enum ConversationListLastMessage {

    /// Applique `facet` à la ligne `conversationId`, sous la garde d'ordre
    /// (`MeeshyConversation.admitsLastMessage`). Rend `nil` quand la ligne est
    /// absente ou que l'événement est plus ancien que l'aperçu en place.
    ///
    /// Un message NOUVEAU remonte la ligne en tête : il est, par la garde, le
    /// plus récent. Le MÊME message la laisse où elle est — il ne fait que
    /// compléter le groupe, et remonter une ligne sans nouveau message la
    /// placerait au-dessus de lignes plus récentes qu'elle.
    public static func applying(
        _ facet: LastMessageFacet,
        conversationId: String,
        aliases: [String] = [],
        to conversations: [MeeshyConversation]
    ) -> [MeeshyConversation]? {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }),
              conversations[index].admitsLastMessage(id: facet.id, at: facet.at, aliases: aliases)
        else { return nil }
        let isSameMessage = facet.id != nil && facet.id == conversations[index].lastMessageId
        var updated = conversations
        updated[index].applyLastMessage(facet)
        guard !isSameMessage else { return updated }
        let row = updated.remove(at: index)
        updated.insert(row, at: 0)
        return updated
    }

    /// Le dernier message de la ligne vient d'être supprimé : la ligne revient
    /// au message PRÉCÉDENT (décision porteur, #7548) — celui que le serveur
    /// sert désormais, lui qui filtre `deletedAt: null`.
    ///
    /// - Parameter server: la ligne relue au serveur, `nil` si la lecture a
    ///   échoué. Seul ce cas-là vide encore la ligne : sans remplaçant connu,
    ///   un aperçu vide vaut mieux que le texte d'un message supprimé.
    ///
    /// Rend `nil` quand la ligne ne décrit plus le message supprimé — un
    /// `conversation:updated` recalculé, ou un message plus récent, est passé
    /// entre-temps et fait autorité.
    public static func revertingDeletion(
        of deletedMessageId: String,
        conversationId: String,
        server: MeeshyConversation?,
        in conversations: [MeeshyConversation]
    ) -> [MeeshyConversation]? {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }),
              conversations[index].lastMessageId == deletedMessageId
        else { return nil }
        var updated = conversations
        guard let server, server.lastMessageId != deletedMessageId else {
            updated[index].clearLastMessage()
            return updated
        }
        updated[index].applyLastMessage(LastMessageFacet(conversation: server))
        return sortedNewestFirst(updated)
    }

    /// **Un seul écrivain du groupe « dernier message »** : le moteur de synchro.
    ///
    /// Le ViewModel de liste persiste SON instantané (épinglage, sourdine,
    /// lignes ajoutées ou retirées), mais cet instantané porte des groupes
    /// DÉPOUILLÉS — `LastMessageFacet.bumped`, fusions locales de
    /// `conversation:updated` sans pièces jointes. Les graver par-dessus
    /// l'état complet que le moteur venait d'écrire effaçait l'icône et les
    /// effets de la ligne, durablement puisque le cache survit au redémarrage.
    ///
    /// Chaque ligne déjà connue du cache garde donc le groupe que le cache
    /// porte ; une ligne que le cache ne connaît pas encore garde le sien.
    /// L'ordre reste celui du cache : `lastMessageAt` décroissant.
    public static func persisting(
        _ viewState: [MeeshyConversation],
        over persisted: [MeeshyConversation]
    ) -> [MeeshyConversation] {
        let owned = Dictionary(persisted.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let merged = viewState.map { row -> MeeshyConversation in
            guard let engineRow = owned[row.id] else { return row }
            var copy = row
            copy.applyLastMessage(LastMessageFacet(conversation: engineRow))
            return copy
        }
        return sortedNewestFirst(merged)
    }

    /// Tri STABLE par `lastMessageAt` décroissant : `sorted(by:)` ne l'est pas,
    /// et brasserait des lignes qui partagent un horodatage.
    static func sortedNewestFirst(_ conversations: [MeeshyConversation]) -> [MeeshyConversation] {
        conversations.enumerated()
            .sorted { lhs, rhs in
                lhs.element.lastMessageAt != rhs.element.lastMessageAt
                    ? lhs.element.lastMessageAt > rhs.element.lastMessageAt
                    : lhs.offset < rhs.offset
            }
            .map(\.element)
    }
}
