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
    /// L'auteur, DANS le chiffré, posé par le scelleur (#12976) : libsignal
    /// authentifie la clé de l'expéditeur, pas le nom que le serveur lui donne.
    /// Sans lui, un serveur réétiquetait la copie qu'un de mes appareils m'envoie
    /// comme venant de mon contact. Absent chez un client plus ancien.
    public let authorUserId: String?
    public let authorDeviceId: UInt32?

    public init(
        text: String?,
        language: String?,
        replyTo: String?,
        conversationId: String?,
        clientMessageId: String?,
        sentAt: Date,
        authorUserId: String? = nil,
        authorDeviceId: UInt32? = nil
    ) {
        self.v = Self.currentVersion
        self.text = text
        self.language = language
        self.replyTo = replyTo
        self.conversationId = conversationId
        self.clientMessageId = clientMessageId
        self.sentAt = Int64((sentAt.timeIntervalSince1970 * 1000).rounded())
        self.authorUserId = authorUserId
        self.authorDeviceId = authorDeviceId
    }

    private init(copying content: E2EEContent, authorUserId: String, authorDeviceId: UInt32) {
        self.v = content.v
        self.text = content.text
        self.language = content.language
        self.replyTo = content.replyTo
        self.conversationId = content.conversationId
        self.clientMessageId = content.clientMessageId
        self.sentAt = content.sentAt
        self.authorUserId = authorUserId
        self.authorDeviceId = authorDeviceId
    }

    /// Le même contenu, signé de son auteur avant d'être chiffré.
    public func authored(by userId: String, deviceId: UInt32) -> E2EEContent {
        E2EEContent(copying: self, authorUserId: userId, authorDeviceId: deviceId)
    }

    /// L'auteur porté dans le chiffré est-il l'expéditeur annoncé ? Un contenu
    /// sans auteur (client plus ancien) n'en dit rien.
    public func isAuthored(by userId: String, deviceId: UInt32) -> Bool {
        guard let authorUserId, let authorDeviceId else { return authorUserId == nil && authorDeviceId == nil }
        return authorUserId == userId && authorDeviceId == deviceId
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
    /// Le serveur présente ce chiffré sous un autre expéditeur que son auteur.
    case misattributedAuthor
}
