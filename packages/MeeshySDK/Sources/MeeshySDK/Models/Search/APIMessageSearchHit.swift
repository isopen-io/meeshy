import Foundation

/// Un message trouvé par `GET /api/v1/messages/search` (#14619).
///
/// `content` est DÉJÀ le texte servi par le Prisme du lecteur (la passerelle a
/// élu la traduction) ; `originalContent` garde l'original. Le serveur ne rend
/// jamais un message d'une conversation chiffrée de bout en bout, à vue unique
/// ou éphémère — la recherche chiffrée reste locale à l'appareil.
///
/// `isBlurred` dit que l'extrait se VOILE (#16957) ; `transcript` porte la
/// transcription d'un média quand c'est elle qui a répondu (#16958). Les trois
/// champs sont additifs : absents, ils valent « net, trouvé par le texte ».
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

    /// Ce qui a répondu à la requête. Une valeur inconnue vaut `content`.
    public enum Match: String, Sendable, Equatable {
        case content
        case transcript
    }

    /// La famille du média transcrit. Une valeur inconnue vaut `document`.
    public enum MediaKind: String, Sendable, Equatable, CaseIterable {
        case audio
        case video
        case image
        case document
    }

    /// La transcription qui a répondu, servie par le Prisme du lecteur
    /// (`servedLanguage` nul ⇒ l'original). Elle se peint, elle ne se joue pas.
    public struct Transcript: Decodable, Sendable, Equatable {
        public let attachmentId: String
        public let mediaKind: MediaKind
        public let text: String
        public let servedLanguage: String?
        public let durationMs: Int?

        enum CodingKeys: String, CodingKey {
            case attachmentId, mediaKind, text, servedLanguage, durationMs
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            attachmentId = try c.decode(String.self, forKey: .attachmentId)
            mediaKind = MediaKind(rawValue: try c.decode(String.self, forKey: .mediaKind)) ?? .document
            text = try c.decode(String.self, forKey: .text)
            servedLanguage = try c.decodeIfPresent(String.self, forKey: .servedLanguage)
            durationMs = try c.decodeIfPresent(Int.self, forKey: .durationMs)
        }
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
    public let isBlurred: Bool
    public let match: Match
    public let transcript: Transcript?

    enum CodingKeys: String, CodingKey {
        case id, conversationId, createdAt, messageType, content, servedLanguage
        case originalContent, originalLanguage, sender, conversation
        case isBlurred, match, transcript
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        conversationId = try c.decode(String.self, forKey: .conversationId)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        messageType = try c.decode(String.self, forKey: .messageType)
        content = try c.decode(String.self, forKey: .content)
        servedLanguage = try c.decodeIfPresent(String.self, forKey: .servedLanguage)
        originalContent = try c.decode(String.self, forKey: .originalContent)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        sender = try c.decodeIfPresent(Sender.self, forKey: .sender)
        conversation = try c.decode(Conversation.self, forKey: .conversation)
        isBlurred = try c.decodeIfPresent(Bool.self, forKey: .isBlurred) ?? false
        match = (try c.decodeIfPresent(String.self, forKey: .match)).flatMap(Match.init(rawValue:)) ?? .content
        transcript = try c.decodeIfPresent(Transcript.self, forKey: .transcript)
    }

    /// Le nom à afficher pour l'auteur : son nom affiché, sinon son pseudo.
    public var senderLabel: String {
        guard let sender else { return "?" }
        return sender.displayName.isEmpty ? (sender.username ?? "?") : sender.displayName
    }

    /// L'extrait à peindre : la transcription quand elle a répondu, sinon le texte.
    public var excerpt: String {
        transcript?.text ?? content
    }
}

/// La capacité que le client DÉCLARE à `GET /api/v1/messages/search`
/// (`GLOBAL_SEARCH_CAPS_HEADER`, `packages/shared/types/global-search.ts`) :
/// il sait voiler un flouté et peindre une transcription. Sans elle, la
/// passerelle ne sert ni l'un ni l'autre.
public enum MessageSearchCapabilities {
    public static let header = "X-Search-Caps"
    public static let protection = 1

    public static var requestHeaders: [String: String] {
        [header: String(protection)]
    }
}
