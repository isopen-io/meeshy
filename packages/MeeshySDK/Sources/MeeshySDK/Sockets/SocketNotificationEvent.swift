import Foundation

// MARK: - Notification Socket Event Data
//
// Sortis de `MessageSocketManager.swift` (4 263 lignes, très au-delà du budget
// de 800–1100 de la directive 2026-08-28) : la bannière in-app avait besoin de
// TROIS champs de plus sur le fil, et « ajouter à un fichier déjà hors budget
// est interdit — on extrait d'abord, on ajoute ensuite ».
//
// Ce fichier ne contient que le CONTRAT du fil `notification:new` : ce que la
// passerelle émet, et rien de ce qui le présente (cf.
// `Notifications/NotificationBannerPresentation.swift`).

public struct SocketNotificationEvent: Decodable, Sendable {
    public let id: String
    public let userId: String
    public let type: String
    public let title: String?
    /// La PHRASE D'ACTION localisée par la passerelle (« a commenté votre
    /// statut », « veut se connecter ») pour tout ce qui n'est pas un message
    /// de conversation ; le NOM DU GROUPE pour un message de groupe.
    ///
    /// Elle voyageait déjà sur le fil (`buildPushHeader` la promeut en subtitle
    /// justement parce qu'iOS réécrit le TITRE d'une Communication
    /// Notification) — mais ce décodeur ne la lisait pas, et la bannière in-app
    /// n'a donc jamais pu dire CE QUI venait d'arriver : elle affichait
    /// l'auteur et le contenu, jamais le type.
    public let subtitle: String?
    public let content: String
    public let priority: String?
    public let isRead: Bool?

    // Gateway sends nested objects — decoded into typed structs
    public let actor: SocketNotificationActor?
    public let context: SocketNotificationContext?
    public let metadata: SocketNotificationMetadata?

    /// SyncEngine A5 — numéro de séquence monotone per-user tamponné par le
    /// gateway (`emitWithSeq`, A2.1) sous la clé JSON `_seq`. `nil` sur un
    /// gateway antérieur (backward-compat). Consommé par `SyncSeqState` pour
    /// la détection de gap EXACTE au reconnect.
    public let seq: Int64?

    /// Le détail du message (#8858) : position, contact, invitation, lien,
    /// vignette vidéo — les clés du contrat #8856, lues dans `context` puis,
    /// à défaut, dans `metadata`. Décodées à part, en table tolérante, parce
    /// que leurs nombres voyagent en nombre OU en chaîne selon l'émetteur.
    public let detailFields: SocketNotificationDetailFields

    private enum CodingKeys: String, CodingKey {
        case id, userId, type, title, subtitle, content, priority, isRead
        case actor, context, metadata
        case seq = "_seq"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decode(String.self, forKey: .userId)
        type = try container.decode(String.self, forKey: .type)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        subtitle = try container.decodeIfPresent(String.self, forKey: .subtitle)
        content = try container.decode(String.self, forKey: .content)
        priority = try container.decodeIfPresent(String.self, forKey: .priority)
        isRead = try container.decodeIfPresent(Bool.self, forKey: .isRead)
        actor = try container.decodeIfPresent(SocketNotificationActor.self, forKey: .actor)
        context = try container.decodeIfPresent(SocketNotificationContext.self, forKey: .context)
        metadata = try container.decodeIfPresent(SocketNotificationMetadata.self, forKey: .metadata)
        seq = try container.decodeIfPresent(Int64.self, forKey: .seq)
        let fromContext = (try? container.decodeIfPresent(SocketNotificationDetailFields.self, forKey: .context)) ?? nil
        let fromMetadata = (try? container.decodeIfPresent(SocketNotificationDetailFields.self, forKey: .metadata)) ?? nil
        detailFields = (fromContext ?? .empty).merging(fallback: fromMetadata ?? .empty)
    }

    // Computed accessors: resolve from nested structs (gateway format)
    public var senderUsername: String? { actor?.username }
    public var senderDisplayName: String? { actor?.displayName }
    public var senderAvatar: String? { actor?.avatar }
    public var senderId: String? { actor?.id }
    public var conversationId: String? { context?.conversationId }
    public var messageId: String? { context?.messageId }
    public var postId: String? { context?.postId ?? metadata?.postId }
    public var commentId: String? { context?.commentId ?? metadata?.commentId }
    public var parentCommentId: String? { context?.parentCommentId ?? metadata?.parentCommentId }
    /// Discriminant d'entité : `postType` fait autorité, `contentType` sert de
    /// repli (famille `friend_new_*`). Le NOM du type de notification n'est
    /// JAMAIS un discriminant — `story_thread_reply` est émis pour n'importe
    /// quel contenu commenté, réel inclus.
    public var postType: String? {
        let explicit = metadata?.postType
        return explicit?.isEmpty == false ? explicit : metadata?.contentType
    }
    public var messagePreview: String? { metadata?.commentPreview }
    public var conversationTitle: String? { context?.conversationTitle }
    public var conversationAvatar: String? { context?.conversationAvatar }
    public var conversationType: String? { context?.conversationType }
    public var isDirect: Bool { context?.conversationType == "direct" }
    public var attachments: SocketNotificationAttachments? { metadata?.attachments }

    public var attachmentLabel: String? {
        guard let att = metadata?.attachments, let count = att.count, count > 0 else { return nil }
        if count > 1 { return "\u{1F4CE} \(count) fichiers" }
        switch att.firstType {
        case "image": return "\u{1F4F7} Photo"
        case "video": return "\u{1F3AC} Vid\u{00E9}o"
        case "audio": return "\u{1F3B5} Audio"
        case "document": return "\u{1F4C4} Document"
        default: return "\u{1F4CE} Fichier"
        }
    }

    public var notificationType: MeeshyNotificationType {
        MeeshyNotificationType(rawValue: type) ?? .system
    }
}

public struct SocketNotificationActor: Decodable, Sendable {
    public let id: String?
    public let username: String?
    public let displayName: String?
    public let avatar: String?
}

public struct SocketNotificationContext: Decodable, Sendable {
    public let conversationId: String?
    public let conversationTitle: String?
    /// Avatar (image URL) of the conversation/group. Used by the in-app toast
    /// as a fallback when the sender has no personal avatar (group messages).
    public let conversationAvatar: String?
    public let conversationType: String?
    public let messageId: String?
    public let postId: String?
    public let commentId: String?
    public let parentCommentId: String?
    public let friendRequestId: String?
    /// URL du 1er attachment du message — la vignette de la bannière quand le
    /// mime est une image. **Absent quand le message est protégé** (éphémère,
    /// vue unique, flouté, chiffré) : la passerelle le retient en bloc derrière
    /// `mediaMayTravel` (cycle 125). Le client n'a donc rien à re-garder ici,
    /// mais il ne doit pas non plus le FABRIQUER depuis une autre source.
    public let firstAttachmentUrl: String?
    public let firstAttachmentMimeType: String?
}

public struct SocketNotificationMetadata: Decodable, Sendable {
    public let postId: String?
    public let commentId: String?
    public let parentCommentId: String?
    public let postType: String?
    /// Discriminant d'entité de la famille `friend_new_*`, que la gateway a
    /// historiquement émis SOUS CE NOM au lieu de `postType`. Lu en repli pour
    /// que le nouveau réel d'un ami n'atterrisse pas sur le détail de post plat.
    public let contentType: String?
    public let commentPreview: String?
    public let emoji: String?
    /// Second nom de l'émoji de réaction : les éventails de réaction sur
    /// MESSAGE l'écrivent sous `reactionEmoji`, ceux sur CONTENU sous `emoji`.
    public let reactionEmoji: String?
    /// Miniature du contenu visé (post / story / réel) — la vignette que la
    /// bannière pose devant son corps.
    public let postThumbnailUrl: String?
    /// Nature du média principal du contenu visé — « image » | « video » | « audio ».
    public let mediaType: String?
    public let attachments: SocketNotificationAttachments?

    // Paliers d'engagement (#5809). La passerelle les pose sur le MÊME objet
    // `metadata` que le chemin REST ; ce décodeur-ci les ignorait aussi. Sans
    // eux, un palier reçu EN DIRECT — l'app ouverte, le cas le plus fréquent —
    // n'aurait jamais été célébré, pendant que le même palier reçu par la
    // liste des notifications l'aurait été. Deux chemins, un seul comportement.
    public let achievementKey: String?
    /// L'AXE d'un badge — la moitié que la passe #5809 avait laissée dehors des
    /// DEUX décodeurs. Un badge n'a pas de `achievementKey` : sans `axisKey`,
    /// le chemin direct comme le chemin REST rendaient `nil`.
    public let axisKey: String?
    public let threshold: Int?
    public let level: Int?
}

public struct SocketNotificationAttachments: Decodable, Sendable {
    public let count: Int?
    public let firstType: String?
    public let firstFilename: String?
}

/// Table tolérante des clés de DÉTAIL (#8858) — chaîne ou nombre, tout se lit
/// en chaîne ; `NotificationMessageDetail(lookup:)` fait le reste.
public struct SocketNotificationDetailFields: Decodable, Sendable, Equatable {
    public let values: [String: String]

    public static let empty = SocketNotificationDetailFields(values: [:])

    /// Les clés du contrat, plus les deux qui QUALIFIENT le message : son type
    /// (un sticker n'a pas d'autre signe) et la clé de protection.
    static let decodedKeys = NotificationMessageDetail.wireKeys + ["messageType", "notificationLocKey"]

    public init(values: [String: String]) {
        self.values = values
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DetailKey.self)
        let pairs: [(String, String)] = Self.decodedKeys.compactMap { name in
            let key = DetailKey(name)
            if let text = try? container.decode(String.self, forKey: key) { return (name, text) }
            guard let number = try? container.decode(Double.self, forKey: key) else { return nil }
            let isWhole = number.rounded() == number && abs(number) < 1e15
            return (name, isWhole ? String(Int64(number)) : String(number))
        }
        values = Dictionary(pairs, uniquingKeysWith: { first, _ in first })
    }

    public subscript(_ key: String) -> String? { values[key] }

    func merging(fallback: SocketNotificationDetailFields) -> SocketNotificationDetailFields {
        SocketNotificationDetailFields(values: values.merging(fallback.values) { primary, _ in primary })
    }

    private struct DetailKey: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init(_ name: String) { stringValue = name }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }
}
