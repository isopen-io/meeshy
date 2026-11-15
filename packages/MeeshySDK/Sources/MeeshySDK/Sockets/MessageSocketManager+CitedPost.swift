import Combine
import Foundation

// Extrait de `MessageSocketManager.swift`, hors budget de taille : le lot #7969
// ajoute `message:cited-post-withdrawn`. Responsabilité tenue ici : le retrait
// d'un post que des messages de la conversation CITENT.

/// `message:cited-post-withdrawn` (#7969) — le post cité par des messages de
/// `conversationId` a été retiré par son auteur (ou la modération). La charge
/// ne porte que l'identifiant du post (`storyReplyToId` des réponses) et
/// l'instant du retrait : rien du contenu retiré ne voyage. Chaque citation de
/// ce post devient « Story indisponible », comme la lecture REST la sert déjà
/// (`postReplyTo.deletedAt`, #7950).
public struct MessageCitedPostWithdrawnEvent: Decodable, Sendable, Equatable {
    public let conversationId: String
    public let postId: String
    public let deletedAt: Date

    public init(conversationId: String, postId: String, deletedAt: Date) {
        self.conversationId = conversationId
        self.postId = postId
        self.deletedAt = deletedAt
    }
}

extension MessageSocketManager {

    var citedPostRoutes: [SocketInboundRoute] {
        [
            route(.messageCitedPostWithdrawn, MessageCitedPostWithdrawnEvent.self) { $0.messageCitedPostWithdrawn.send($1) },
        ]
    }
}
