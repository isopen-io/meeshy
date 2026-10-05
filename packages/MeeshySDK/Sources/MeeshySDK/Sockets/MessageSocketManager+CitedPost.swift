import Combine
import Foundation
import SocketIO

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

    func registerCitedPostHandlers(on socket: SocketIOClient) {
        socket.on("message:cited-post-withdrawn") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageCitedPostWithdrawnEvent.self, from: data) { [weak self] event in
                self?.messageCitedPostWithdrawn.send(event)
            }
        }
    }
}
