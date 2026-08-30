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

    private enum CodingKeys: String, CodingKey {
        case id, userId, type, title, subtitle, content, priority, isRead
        case actor, context, metadata
        case seq = "_seq"
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
}

public struct SocketNotificationAttachments: Decodable, Sendable {
    public let count: Int?
    public let firstType: String?
    public let firstFilename: String?
}
