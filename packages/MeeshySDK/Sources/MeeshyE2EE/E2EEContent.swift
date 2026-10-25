import Foundation

/// Ce que libsignal chiffre : pas le texte nu, une structure versionnée (spec
/// § 4.2). Tout ce qui part À CÔTÉ du corps et qui dit quelque chose du
/// contenu — la langue détectée, le message cité — voyage DEDANS, jamais en
/// champ libre du message (#12526). Les champs que cette version ne connaît pas
/// encore (mentions, pièces, lieu, sticker) sont ignorés à la lecture : une
/// version suivante peut les ajouter sans casser celle-ci.
public struct E2EEContent: Codable, Equatable, Sendable {
    public static let currentVersion = 1

    public let v: Int
    public let text: String?
    public let language: String?
    public let replyTo: String?
    /// La conversation et l'identifiant client du message, DANS le chiffré :
    /// libsignal lie le chiffré à son expéditeur, pas au message ni à la
    /// conversation que le serveur lui associe. Sans eux, un serveur compromis
    /// pourrait ranger un message de Bob dans une autre conversation avec lui.
    public let conversationId: String?
    public let clientMessageId: String?
    /// L'instant de composition, en millisecondes depuis 1970.
    public let sentAt: Int64

    public init(
        text: String?,
        language: String?,
        replyTo: String?,
        conversationId: String?,
        clientMessageId: String?,
        sentAt: Date
    ) {
        self.v = Self.currentVersion
        self.text = text
        self.language = language
        self.replyTo = replyTo
        self.conversationId = conversationId
        self.clientMessageId = clientMessageId
        self.sentAt = Int64((sentAt.timeIntervalSince1970 * 1000).rounded())
    }

    /// Le serveur range-t-il ce contenu dans la conversation pour laquelle il a été écrit ? Un contenu
    /// qui ne la nomme pas ne se range nulle part.
    public func belongs(to conversationId: String) -> Bool {
        self.conversationId == conversationId
    }

    /// JSON canonique : clés triées, aucun champ absent écrit.
    public func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(self)
    }

    /// Refuse une version que cet appareil ne sait pas lire : un message d'une
    /// version future ne s'affiche jamais à moitié.
    public static func decoded(from data: Data) throws -> E2EEContent {
        let content = try JSONDecoder().decode(E2EEContent.self, from: data)
        guard content.v == currentVersion else { throw E2EEContentError.unsupportedVersion(content.v) }
        return content
    }
}

public enum E2EEContentError: Error, Equatable {
    case unsupportedVersion(Int)
    /// Le serveur présente ce chiffré dans une autre conversation que la sienne.
    case misattributed
}
