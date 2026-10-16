import Foundation
import MeeshySDK

/// La conversation DIRECTE avec un utilisateur : la dernière qui existe, sinon
/// une neuve. Site UNIQUE, partagé par la réponse AMORCÉE (une story ou une
/// humeur ouvre la DM, composer prêt — `Router.navigateToStoryReply`) et la
/// réponse ENVOYÉE depuis la page plein écran d'une humeur (#10814). Deux
/// copies de cette cascade auraient pu choisir deux conversations différentes
/// pour le même auteur.
enum DirectConversationResolver {
    static func resolve(
        with userId: String,
        conversations: ConversationServiceProviding = ConversationService.shared
    ) async throws -> APIConversation {
        if let existing = try await conversations.findDirectWith(userId: userId) {
            return existing
        }
        let created = try await conversations.create(type: "direct", title: nil, participantIds: [userId])
        return try await conversations.getById(created.id)
    }
}
