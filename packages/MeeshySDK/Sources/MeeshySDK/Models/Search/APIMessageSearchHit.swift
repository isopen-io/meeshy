import Foundation

/// Un message trouvé par `GET /api/v1/messages/search` (#14619).
///
/// `content` est DÉJÀ le texte servi par le Prisme du lecteur (la passerelle a
/// élu la traduction) ; `originalContent` garde l'original. Le serveur ne rend
/// jamais un message d'une conversation chiffrée de bout en bout, à vue unique
/// ou éphémère — la recherche chiffrée reste locale à l'appareil.
public struct APIMessageSearchHit: Decodable, Identifiable, Sendable, Equatable {
    public struct Sender: Decodable, Sendable, Equatable {
        public let id: String
        public let userId: String?
        public let displayName: String
        public let username: String?
        public let avatar: String?
    }

    public struct Conversation: Decodable, Sendable, Equatable {
        public let id: String
        public let identifier: String?
        public let type: String
        public let title: String
        public let avatar: String?
    }

    public let id: String
    public let conversationId: String
    public let createdAt: Date
    public let messageType: String
    public let content: String
    public let servedLanguage: String?
    public let originalContent: String
    public let originalLanguage: String?
    public let sender: Sender?
    public let conversation: Conversation

    enum CodingKeys: String, CodingKey {
        case id, conversationId, createdAt, messageType, content, servedLanguage
        case originalContent, originalLanguage, sender, conversation
    }

    /// Le nom à afficher pour l'auteur : son nom affiché, sinon son pseudo.
    public var senderLabel: String {
        guard let sender else { return "?" }
        return sender.displayName.isEmpty ? (sender.username ?? "?") : sender.displayName
    }
}
