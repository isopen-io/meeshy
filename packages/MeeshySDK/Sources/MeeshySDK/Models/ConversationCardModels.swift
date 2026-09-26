import Foundation

// MARK: - La carte de conversation (#8099)
//
// Miroir de `packages/shared/types/conversation-card.ts`. Deux portes servent
// la même forme : `GET /links/:identifier/card` (lien de PARTAGE, auth
// optionnelle) et `GET /conversations/:id/card` (lien DIRECT, membre seul — un
// non-membre reçoit le même 404 qu'un id inexistant).
//
// Les champs ajoutés après la première version du contrat (`inviter`,
// `inviteMessage`, `viewer.canJoinAnonymously`) se décodent avec un défaut :
// une passerelle plus ancienne les omet, et la carte doit s'afficher quand même.

public enum ConversationCardKind: String, Decodable, Sendable, Equatable {
    case shareLink = "share-link"
    case direct
}

public struct ConversationCardStats: Decodable, Sendable, Equatable {
    public let memberCount: Int
    /// `null` sauf membre ou lien qui autorise l'historique.
    public let messageCount: Int?
    public let languages: [String]

    public init(memberCount: Int, messageCount: Int?, languages: [String]) {
        self.memberCount = memberCount
        self.messageCount = messageCount
        self.languages = languages
    }

    enum CodingKeys: String, CodingKey { case memberCount, messageCount, languages }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        memberCount = try c.decodeIfPresent(Int.self, forKey: .memberCount) ?? 0
        messageCount = try c.decodeIfPresent(Int.self, forKey: .messageCount)
        languages = try c.decodeIfPresent([String].self, forKey: .languages) ?? []
    }
}

public struct ConversationCardViewer: Decodable, Sendable, Equatable {
    public let isMember: Bool
    public let canJoin: Bool
    public let requiresAccount: Bool
    public let canJoinAnonymously: Bool

    public init(isMember: Bool, canJoin: Bool, requiresAccount: Bool, canJoinAnonymously: Bool) {
        self.isMember = isMember
        self.canJoin = canJoin
        self.requiresAccount = requiresAccount
        self.canJoinAnonymously = canJoinAnonymously
    }

    enum CodingKeys: String, CodingKey { case isMember, canJoin, requiresAccount, canJoinAnonymously }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        isMember = try c.decodeIfPresent(Bool.self, forKey: .isMember) ?? false
        canJoin = try c.decodeIfPresent(Bool.self, forKey: .canJoin) ?? false
        requiresAccount = try c.decodeIfPresent(Bool.self, forKey: .requiresAccount) ?? false
        canJoinAnonymously = try c.decodeIfPresent(Bool.self, forKey: .canJoinAnonymously) ?? false
    }
}

public struct ConversationCardLink: Decodable, Sendable, Equatable {
    public let identifier: String
    public let isActive: Bool
    public let expiresAt: String?

    public init(identifier: String, isActive: Bool, expiresAt: String?) {
        self.identifier = identifier
        self.isActive = isActive
        self.expiresAt = expiresAt
    }
}

/// Le créateur du lien — jamais son identifiant.
public struct ConversationCardInviter: Decodable, Sendable, Equatable {
    public let displayName: String
    public let username: String?
    public let avatarUrl: String?

    public init(displayName: String, username: String?, avatarUrl: String?) {
        self.displayName = displayName
        self.username = username
        self.avatarUrl = avatarUrl
    }
}

public struct ConversationCard: Decodable, Sendable, Equatable {
    public let kind: ConversationCardKind
    /// `nil` pour un non-membre sur lien de partage.
    public let conversationId: String?
    public let title: String
    public let description: String?
    public let avatarUrl: String?
    public let bannerUrl: String?
    public let conversationType: String
    public let stats: ConversationCardStats
    public let viewer: ConversationCardViewer
    public let link: ConversationCardLink?
    public let inviter: ConversationCardInviter?
    /// Le message propre au LIEN, distinct de `description` (celle de la
    /// conversation).
    public let inviteMessage: String?

    public init(
        kind: ConversationCardKind,
        conversationId: String?,
        title: String,
        description: String?,
        avatarUrl: String?,
        bannerUrl: String?,
        conversationType: String,
        stats: ConversationCardStats,
        viewer: ConversationCardViewer,
        link: ConversationCardLink?,
        inviter: ConversationCardInviter? = nil,
        inviteMessage: String? = nil
    ) {
        self.kind = kind
        self.conversationId = conversationId
        self.title = title
        self.description = description
        self.avatarUrl = avatarUrl
        self.bannerUrl = bannerUrl
        self.conversationType = conversationType
        self.stats = stats
        self.viewer = viewer
        self.link = link
        self.inviter = inviter
        self.inviteMessage = inviteMessage
    }

    enum CodingKeys: String, CodingKey {
        case kind, conversationId, title, description, avatarUrl, bannerUrl, conversationType
        case stats, viewer, link, inviter, inviteMessage
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decode(ConversationCardKind.self, forKey: .kind)
        conversationId = try c.decodeIfPresent(String.self, forKey: .conversationId)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        description = try c.decodeIfPresent(String.self, forKey: .description)
        avatarUrl = try c.decodeIfPresent(String.self, forKey: .avatarUrl)
        bannerUrl = try c.decodeIfPresent(String.self, forKey: .bannerUrl)
        conversationType = try c.decodeIfPresent(String.self, forKey: .conversationType) ?? "group"
        stats = try c.decodeIfPresent(ConversationCardStats.self, forKey: .stats)
            ?? ConversationCardStats(memberCount: 0, messageCount: nil, languages: [])
        viewer = try c.decodeIfPresent(ConversationCardViewer.self, forKey: .viewer)
            ?? ConversationCardViewer(isMember: false, canJoin: false, requiresAccount: false, canJoinAnonymously: false)
        link = try c.decodeIfPresent(ConversationCardLink.self, forKey: .link)
        inviter = try c.decodeIfPresent(ConversationCardInviter.self, forKey: .inviter)
        inviteMessage = try c.decodeIfPresent(String.self, forKey: .inviteMessage)
    }

    /// Un lien de partage dont le serveur dit qu'il ne sert plus.
    public var isLinkExpired: Bool { link.map { !$0.isActive } ?? false }

    /// Ce que la carte doit porter, maintenant que le lecteur a (ou non)
    /// rejoint : l'état optimiste d'une action se lit comme une vraie carte.
    public func with(isMember: Bool, conversationId: String?) -> ConversationCard {
        ConversationCard(
            kind: kind,
            conversationId: conversationId ?? self.conversationId,
            title: title,
            description: description,
            avatarUrl: avatarUrl,
            bannerUrl: bannerUrl,
            conversationType: conversationType,
            stats: stats,
            viewer: ConversationCardViewer(
                isMember: isMember,
                canJoin: kind == .shareLink && !isMember && !isLinkExpired,
                requiresAccount: viewer.requiresAccount,
                canJoinAnonymously: isMember ? false : viewer.canJoinAnonymously
            ),
            link: link,
            inviter: inviter,
            inviteMessage: inviteMessage
        )
    }
}

// MARK: - La cible d'une URL Meeshy de conversation

/// Ce qu'une URL de conversation désigne : un lien de PARTAGE (l'identifiant
/// d'un `ConversationShareLink`, `/join/<id>` ou `/chat/<id>`) ou un lien
/// DIRECT vers une conversation (`/c/<id>`). L'analyse des URL elle-même est
/// celle des liens universels de l'app (`DeepLinkParser`) — une seule table.
public enum ConversationCardTarget: Hashable, Sendable {
    case shareLink(identifier: String)
    case direct(conversationId: String)
}

// MARK: - Ce que la carte propose (règle pure)

public enum ConversationCardActions: Equatable, Sendable {
    /// Aucune action : lien expiré, carte privée, ou jonction refusée.
    case none
    /// Non-membre sur un lien actif : « Rejoindre », précédé de « Rejoindre en
    /// anonyme » quand le lien l'autorise.
    case join(identifier: String, allowsAnonymous: Bool)
    /// Membre : « Quitter » EN PREMIER, puis « Ouvrir ».
    case leaveOrOpen(conversationId: String)

    public static func resolve(for card: ConversationCard, target: ConversationCardTarget) -> ConversationCardActions {
        if card.isLinkExpired { return .none }
        if card.viewer.isMember, let conversationId = card.conversationId ?? target.directConversationId {
            return .leaveOrOpen(conversationId: conversationId)
        }
        guard card.kind == .shareLink, card.viewer.canJoin || card.viewer.canJoinAnonymously else { return .none }
        guard let identifier = card.link?.identifier ?? target.shareLinkIdentifier else { return .none }
        return .join(identifier: identifier, allowsAnonymous: card.viewer.canJoinAnonymously)
    }
}

public extension ConversationCardTarget {
    var shareLinkIdentifier: String? {
        if case .shareLink(let identifier) = self { return identifier }
        return nil
    }

    var directConversationId: String? {
        if case .direct(let id) = self { return id }
        return nil
    }
}

// MARK: - Ce que la bulle rend

/// Le verdict d'une résolution de carte, CACHÉ tel quel : une carte privée ou
/// indisponible se relit sans rappel réseau au défilement.
public enum ConversationCardResolution: Equatable, Sendable {
    case card(ConversationCard)
    /// Lien DIRECT refusé (404) : non-membre ou conversation inexistante —
    /// indistinguables, et rien du titre ne doit fuir.
    case privateConversation
    /// Serveur sans la route, lien inconnu, erreur réseau : la bulle retombe
    /// sur l'aperçu de lien générique d'avant.
    case unavailable
}
