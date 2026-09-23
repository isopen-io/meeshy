import Foundation

// Le contrat de la LIGNE D'APERÇU d'une conversation (#7545, milestone #111),
// miroir Swift de `packages/shared/types/conversation-preview.ts`.
//
// Porté À L'IDENTIQUE par `GET /conversations` (sur `lastMessage` et sur la
// conversation) et par `conversation:updated` (clés plates `lastMessage*`,
// `lastReaction`, `activeCall`). Trois règles du contrat valent ici :
// - rien de protégé ne voyage — un dernier message protégé arrive SANS texte,
//   traduction ni pièce jointe, seulement ses drapeaux ;
// - rien de localisé ne voyage — des CLÉS et des paramètres, que le client
//   localise dans ses sept langues ;
// - un détail absent est `nil`, jamais `0` ni `""`.
//
// Les vocabulaires (`kind`, `outcome`, `key`, `excerptProtection`) restent des
// CHAÎNES : un client ancien doit décoder une valeur qu'il ne connaît pas encore
// au lieu de jeter toute la ligne — le composeur, lui, sait retomber sur un
// rendu neutre.

/// Un paramètre d'événement système : `string | number` sur le fil.
public enum PreviewParam: Codable, Sendable, Hashable {
    case text(String)
    case number(Double)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let number = try? container.decode(Double.self) {
            self = .number(number)
        } else {
            self = .text(try container.decode(String.self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .text(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        }
    }

    /// La valeur telle qu'elle s'insère dans un libellé : un entier sans « .0 ».
    public var rendered: String {
        switch self {
        case .text(let value): return value
        case .number(let value):
            return value.rounded() == value ? String(Int(value)) : String(value)
        }
    }
}

/// Le résumé de TOUTES les pièces jointes du dernier message. `kinds` compte
/// par famille (`image`, `video`, `audio`, `file`) ; une famille absente vaut 0.
public struct LastMessageAttachmentSummary: Codable, Sendable, Hashable {
    public let count: Int
    public let kinds: [String: Int]
    public let totalSize: Int?

    public init(count: Int, kinds: [String: Int], totalSize: Int?) {
        self.count = count
        self.kinds = kinds
        self.totalSize = totalSize
    }
}

/// Un appel terminé — ou `outcome == "ongoing"` — dont la synthèse est le
/// dernier message. Lu depuis les métadonnées, jamais depuis le texte stocké.
public struct LastMessageCallSummary: Codable, Sendable, Hashable {
    public let callId: String
    /// `audio` | `video`.
    public let kind: String
    /// `completed` | `missed` | `rejected` | `failed` | `ongoing`.
    public let outcome: String
    public let durationSec: Int
    /// `User.id` de l'appelant — comparé au lecteur pour la flèche.
    public let initiatorId: String
    public let endedByInitiator: Bool

    public init(callId: String, kind: String, outcome: String, durationSec: Int,
                initiatorId: String, endedByInitiator: Bool) {
        self.callId = callId
        self.kind = kind
        self.outcome = outcome
        self.durationSec = durationSec
        self.initiatorId = initiatorId
        self.endedByInitiator = endedByInitiator
    }
}

/// Un message système, par sa CLÉ (`system.member-joined`, …) et ses paramètres.
public struct LastMessageSystemEvent: Codable, Sendable, Hashable {
    public let key: String
    public let params: [String: PreviewParam]

    public init(key: String, params: [String: PreviewParam] = [:]) {
        self.key = key
        self.params = params
    }

    private enum CodingKeys: String, CodingKey { case key, params }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        key = try container.decode(String.self, forKey: .key)
        params = try container.decodeIfPresent([String: PreviewParam].self, forKey: .params) ?? [:]
    }
}

/// La NATURE du dernier message — le sous-groupe que #7545 ajoute au groupe
/// « dernier message ». Il décrit le même message que `lastMessageId` et
/// s'écrit donc avec lui, jamais seul (`LastMessageFacet`).
public struct LastMessageNature: Codable, Sendable, Hashable {
    public let messageType: String?
    public let effectFlags: Int?
    /// Secondes — le décompte part de la RÉCEPTION de chaque lecteur (#7451).
    public let ephemeralDuration: Int?
    public let isEncrypted: Bool
    public let isForwarded: Bool
    public let systemEvent: LastMessageSystemEvent?
    public let callSummary: LastMessageCallSummary?
    public let attachmentSummary: LastMessageAttachmentSummary?

    public init(
        messageType: String? = nil,
        effectFlags: Int? = nil,
        ephemeralDuration: Int? = nil,
        isEncrypted: Bool = false,
        isForwarded: Bool = false,
        systemEvent: LastMessageSystemEvent? = nil,
        callSummary: LastMessageCallSummary? = nil,
        attachmentSummary: LastMessageAttachmentSummary? = nil
    ) {
        self.messageType = messageType
        self.effectFlags = effectFlags
        self.ephemeralDuration = ephemeralDuration
        self.isEncrypted = isEncrypted
        self.isForwarded = isForwarded
        self.systemEvent = systemEvent
        self.callSummary = callSummary
        self.attachmentSummary = attachmentSummary
    }

    /// `nil` quand le fil ne dit RIEN de la nature — un serveur antérieur à
    /// #7545. Une nature vide n'est pas une information : la garder distincte
    /// de « texte simple » évite de peindre en texte ce qu'on ne connaît pas.
    public var isEmpty: Bool {
        messageType == nil && effectFlags == nil && ephemeralDuration == nil
            && !isEncrypted && !isForwarded
            && systemEvent == nil && callSummary == nil && attachmentSummary == nil
    }
}

/// La DERNIÈRE réaction posée dans la conversation, résolue pour le lecteur.
/// `reactorUserId` / `targetSenderUserId` sont les `User.id` qu'un client
/// compare au sien (« Vous avez réagi », « à votre message »).
public struct ConversationLastReaction: Codable, Sendable, Hashable {
    public let emoji: String
    public let reactorId: String
    public let reactorUserId: String?
    public let reactorName: String
    public let messageId: String
    public let targetSenderId: String?
    public let targetSenderUserId: String?
    public let excerpt: String?
    public let excerptOriginalLanguage: String?
    public let excerptTranslations: [String: String]?
    /// `expired` | `view-once` | `blurred` | `encrypted` | `ephemeral`.
    public let excerptProtection: String?
    public let createdAt: Date

    public init(emoji: String, reactorId: String, reactorUserId: String?, reactorName: String,
                messageId: String, targetSenderId: String?, targetSenderUserId: String?,
                excerpt: String?, excerptOriginalLanguage: String?,
                excerptTranslations: [String: String]?, excerptProtection: String?,
                createdAt: Date) {
        self.emoji = emoji
        self.reactorId = reactorId
        self.reactorUserId = reactorUserId
        self.reactorName = reactorName
        self.messageId = messageId
        self.targetSenderId = targetSenderId
        self.targetSenderUserId = targetSenderUserId
        self.excerpt = excerpt
        self.excerptOriginalLanguage = excerptOriginalLanguage
        self.excerptTranslations = excerptTranslations
        self.excerptProtection = excerptProtection
        self.createdAt = createdAt
    }
}

/// L'appel EN COURS dans la conversation.
public struct ConversationActiveCall: Codable, Sendable, Hashable {
    public let id: String
    /// `audio` | `video`.
    public let kind: String
    public let participantCount: Int
    public let startedAt: Date

    public init(id: String, kind: String, participantCount: Int, startedAt: Date) {
        self.id = id
        self.kind = kind
        self.participantCount = participantCount
        self.startedAt = startedAt
    }
}

/// Une clé qui se distingue ABSENTE (« cet événement n'en parle pas ») et
/// NULLE (« il n'y en a plus ») — la forme de `LastMessageIdentity`, pour les
/// champs de la ligne qui ne sont pas des chaînes.
public enum PreviewFieldUpdate<Value: Sendable & Hashable>: Sendable, Hashable {
    case unchanged
    case replaced(Value?)
}

/// Une pièce jointe telle que le sous-groupe média de `conversation:updated`
/// la sert : sans `fileUrl` — la ligne ne montre jamais le fichier.
struct LastMessagePreviewAttachment: Decodable, Sendable {
    let id: String
    let mimeType: String
    let thumbnailUrl: String?
    let originalName: String?
    let fileSize: Int?
    let duration: Int?
    let width: Int?
    let height: Int?
    let pageCount: Int?

    var attachment: MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            originalName: originalName ?? "",
            mimeType: mimeType,
            fileSize: fileSize ?? 0,
            width: width,
            height: height,
            thumbnailUrl: thumbnailUrl,
            duration: duration,
            pageCount: pageCount
        )
    }
}

public extension LastMessageNature {
    /// La nature d'un message que le client TIENT en entier (`message:new`,
    /// envoi) — même lecture que le serveur fait pour `GET /conversations`.
    init(message: MeeshyMessage) {
        let call = message.callSummary.map {
            LastMessageCallSummary(
                callId: $0.callId,
                kind: $0.callType.rawValue,
                outcome: $0.isLive ? "ongoing" : $0.outcome.rawValue,
                durationSec: $0.durationSeconds,
                initiatorId: $0.initiatorId,
                endedByInitiator: $0.endedByInitiator ?? false
            )
        }
        self.init(
            messageType: message.messageType.rawValue,
            effectFlags: message.effects.flags.rawValue == 0 ? nil : Int(message.effects.flags.rawValue),
            ephemeralDuration: message.effects.ephemeralDuration,
            isEncrypted: message.isEncrypted,
            isForwarded: message.forwardedFromId != nil,
            callSummary: call,
            attachmentSummary: LastMessageAttachmentSummary(attachments: message.attachments)
        )
    }
}

public extension LastMessageAttachmentSummary {
    /// Le décompte par famille, dérivé du seul `mimeType` comme au serveur.
    /// `nil` sans pièce jointe ; `totalSize` `nil` si aucune taille n'est connue.
    init?(attachments: [MeeshyMessageAttachment]) {
        guard !attachments.isEmpty else { return nil }
        let kinds = attachments.reduce(into: [String: Int]()) { counts, attachment in
            counts[Self.kind(forMimeType: attachment.mimeType), default: 0] += 1
        }
        let sizes = attachments.map(\.fileSize).filter { $0 > 0 }
        self.init(count: attachments.count, kinds: kinds, totalSize: sizes.isEmpty ? nil : sizes.reduce(0, +))
    }

    static func kind(forMimeType mimeType: String) -> String {
        let lowered = mimeType.lowercased()
        if lowered.hasPrefix("image/") { return "image" }
        if lowered.hasPrefix("video/") { return "video" }
        if lowered.hasPrefix("audio/") { return "audio" }
        return "file"
    }
}

public extension ConversationLastReaction {
    /// La réaction vise-t-elle un message du lecteur ? Un lecteur inconnu
    /// (`""`, auth non résolue) ne s'attribue jamais une réaction.
    func targets(readerId: String) -> Bool {
        !readerId.isEmpty && targetSenderUserId == readerId
    }
}

public extension MeeshyConversation {
    /// Le RANG de la ligne dans la liste (règle client du contrat #7545,
    /// décision porteur #7546) : max(`lastMessageAt`, `lastReaction.createdAt`
    /// quand la réaction vise un message du lecteur). Une réaction entre tiers
    /// s'affiche sans réordonner ; `lastMessageAt` reste la date AFFICHÉE.
    var listActivityAt: Date {
        guard lastReactionTargetsReader, let reaction = lastReaction else { return lastMessageAt }
        return max(lastMessageAt, reaction.createdAt)
    }
}
