import Foundation

/// Métadonnées hors-page d'une réponse paginée.
///
/// `data` ne peut dire que ce qui EXISTE ; certaines informations portent sur
/// ce qui a disparu, et n'ont donc nulle part où tenir dans la page elle-même.
public struct APIResponseMeta: Decodable, Sendable {
    /// Tombstones du delta-sync des stories (`GET /posts/feed/stories?updatedSince`) :
    /// ids des stories disparues depuis le curseur — supprimées par leur auteur,
    /// ou périmées puis balayées côté serveur.
    ///
    /// Le merge delta client étant purement additif, c'est le SEUL canal par
    /// lequel un client ayant manqué l'event socket `story:deleted` (app fermée
    /// ou hors-ligne, aucun replay) apprend qu'il doit purger son cache.
    public let deletedStoryIds: [String]?

    /// `deletedStoryIds` a débordé son plafond serveur : des disparitions plus
    /// anciennes n'ont PAS été rendues.
    ///
    /// Les tombstones n'ont aucun curseur de reprise — il n'y a donc pas de
    /// « page suivante » de disparitions à demander. Le seul recours est un
    /// fetch complet, dont le remplacement du tray purge les fantômes.
    ///
    /// Absent (`nil`) sur un gateway antérieur à ce champ : traité comme « pas
    /// de troncature », c'est-à-dire exactement le comportement d'avant.
    public let deletedStoryIdsTruncated: Bool?

    /// Tombstones du delta-sync des conversations
    /// (`GET /conversations?updatedSince=`) : ids des conversations qui ont
    /// QUITTÉ la vue de l'utilisateur depuis le curseur — fermées, quittées,
    /// bannies, ou supprimées-pour-moi depuis un AUTRE appareil.
    ///
    /// `data` d'une page delta ne porte que des lignes SERVIES, et la clause
    /// serveur (conversation active, participant actif sans `deletedForMe`)
    /// exclut précisément celles qui viennent de sortir : une disparition n'a
    /// aucune place dans la page, pas même sous la forme d'un `isActive: false`.
    /// Un leave ou un ban n'écrit d'ailleurs QUE la ligne `Participant` —
    /// `Conversation.updatedAt` ne bouge pas, donc même une clause plus large ne
    /// les verrait jamais.
    ///
    /// Jumeau web : `meta.deletedConversationIds`, lu par
    /// `apps/web/hooks/queries/use-conversations-delta-sync.ts`.
    public let deletedConversationIds: [String]?

    /// `deletedConversationIds` a débordé son plafond serveur
    /// (`CONVERSATION_TOMBSTONE_LIMIT`, 500 par stream) : des disparitions plus
    /// anciennes n'ont PAS été rendues.
    ///
    /// Comme pour les stories, ces tombstones n'ont AUCUN curseur de reprise —
    /// il n'existe pas de « page suivante » de disparitions à demander. Le seul
    /// recours est la réconciliation complète, dont le remplacement de la liste
    /// purge les fantômes.
    ///
    /// Absent (`nil`) sur un gateway antérieur à ce champ : traité comme « pas
    /// de troncature », c'est-à-dire exactement le comportement d'avant.
    public let deletedConversationIdsTruncated: Bool?

    /// L'identifiant OPAQUE de la page de listing servie (#10501), que
    /// l'impression recopie dans `listing.feedRequestId`. Absent sur une
    /// route ou un serveur qui ne le sert pas : l'impression part sans lui.
    public let feedRequestId: String?

    /// L'identifiant OPAQUE et scellé d'une recherche servie (#10505), que les
    /// événements `discovery` recopient tel quel : la passerelle n'ouvre que
    /// le sien. Absent sur une route ou un serveur qui ne le sert pas :
    /// l'événement part sans lui, le client n'en fabrique jamais.
    public let searchId: String?

    public init(
        deletedStoryIds: [String]? = nil,
        deletedStoryIdsTruncated: Bool? = nil,
        deletedConversationIds: [String]? = nil,
        deletedConversationIdsTruncated: Bool? = nil,
        feedRequestId: String? = nil,
        searchId: String? = nil
    ) {
        self.deletedStoryIds = deletedStoryIds
        self.deletedStoryIdsTruncated = deletedStoryIdsTruncated
        self.deletedConversationIds = deletedConversationIds
        self.deletedConversationIdsTruncated = deletedConversationIdsTruncated
        self.feedRequestId = feedRequestId
        self.searchId = searchId
    }
}
