import Foundation

// Écrit À LA MAIN (#8099) : les deux routes de la carte de conversation.
//
// Le catalogue généré (`LinksEndpoint`, `ConversationsEndpoint`) suit le
// manifeste de la passerelle ; tant qu'il ne porte pas ces routes, les écrire
// dans un fichier généré ferait rougir le cliquet de régénération. Ce fichier
// ne porte pas la marque du générateur, donc aucune régénération ne l'emporte.
// Quand les cas générés arrivent, cet enum se retire au profit de ceux-là.

public enum ConversationCardEndpoint: MeeshyEndpoint, Sendable {
    /// `GET /links/:identifier/card` — lien de partage ou d'invitation.
    case shareLink(identifier: String)
    /// `GET /conversations/:id/card` — lien direct, membre seul.
    case direct(conversationId: String)

    public var path: String {
        switch self {
        case .shareLink(let identifier): return "/api/v1/links/\(identifier)/card"
        case .direct(let conversationId): return "/api/v1/conversations/\(conversationId)/card"
        }
    }

    /// Une carte manquante se replie sur l'aperçu générique : l'attendre
    /// derrière des réessais ne ferait que retarder ce repli.
    public var retryPolicy: MeeshyEndpointRetryPolicy { .never }

    public init(target: ConversationCardTarget) {
        switch target {
        case .shareLink(let identifier): self = .shareLink(identifier: identifier)
        case .direct(let conversationId): self = .direct(conversationId: conversationId)
        }
    }
}
