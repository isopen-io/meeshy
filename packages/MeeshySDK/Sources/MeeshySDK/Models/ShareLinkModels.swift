import Foundation

// MARK: - Share Link Info (GET /anonymous/link/:identifier)

public struct ShareLinkInfo: Decodable, Sendable {
    public let id: String
    public let linkId: String
    public let name: String?
    public let description: String?
    public let expiresAt: Date?
    public let maxUses: Int?
    public let currentUses: Int
    public let maxConcurrentUsers: Int?
    public let currentConcurrentUsers: Int
    public let requireAccount: Bool
    public let requireNickname: Bool
    public let requireEmail: Bool
    public let requireBirthday: Bool
    public let allowedLanguages: [String]
    /// Droits d'un invité SANS compte. L'aperçu public les sert depuis #7795 ;
    /// une passerelle plus ancienne les omet, d'où les défauts du schéma
    /// Prisma (`ConversationShareLink`) au décodage plutôt qu'un échec.
    public let guestRights: ShareLinkGuestRights
    public let conversation: ShareLinkConversation
    public let creator: ShareLinkCreator
    public let stats: ShareLinkStats

    /// L'adresse canonique `/chat/<linkId>` — jamais `/l/<token>` (suivi) ni
    /// le slug `identifier` (#7795, précision porteur 2026-09-24).
    public var address: ShareLinkAddress { ShareLinkAddress(linkId: linkId) }

    enum CodingKeys: String, CodingKey {
        case id, linkId, name, description, expiresAt, maxUses, currentUses
        case maxConcurrentUsers, currentConcurrentUsers
        case requireAccount, requireNickname, requireEmail, requireBirthday
        case allowedLanguages, conversation, creator, stats
        case allowAnonymousMessages, allowAnonymousImages, allowAnonymousFiles, allowViewHistory
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        linkId = try c.decode(String.self, forKey: .linkId)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        maxUses = try c.decodeIfPresent(Int.self, forKey: .maxUses)
        currentUses = try c.decodeIfPresent(Int.self, forKey: .currentUses) ?? 0
        maxConcurrentUsers = try c.decodeIfPresent(Int.self, forKey: .maxConcurrentUsers)
        currentConcurrentUsers = try c.decodeIfPresent(Int.self, forKey: .currentConcurrentUsers) ?? 0
        requireAccount = try c.decodeIfPresent(Bool.self, forKey: .requireAccount) ?? false
        requireNickname = try c.decodeIfPresent(Bool.self, forKey: .requireNickname) ?? false
        requireEmail = try c.decodeIfPresent(Bool.self, forKey: .requireEmail) ?? false
        requireBirthday = try c.decodeIfPresent(Bool.self, forKey: .requireBirthday) ?? false
        allowedLanguages = try c.decodeIfPresent([String].self, forKey: .allowedLanguages) ?? []
        guestRights = ShareLinkGuestRights(
            messages: try c.decodeIfPresent(Bool.self, forKey: .allowAnonymousMessages),
            images: try c.decodeIfPresent(Bool.self, forKey: .allowAnonymousImages),
            files: try c.decodeIfPresent(Bool.self, forKey: .allowAnonymousFiles),
            history: try c.decodeIfPresent(Bool.self, forKey: .allowViewHistory)
        )
        conversation = try c.decode(ShareLinkConversation.self, forKey: .conversation)
        creator = try c.decode(ShareLinkCreator.self, forKey: .creator)
        stats = try c.decode(ShareLinkStats.self, forKey: .stats)
    }
}

public struct ShareLinkConversation: Decodable, Sendable {
    public let id: String
    public let title: String?
    public let description: String?
    public let type: String
    public let createdAt: Date
    /// Logo du groupe — servi par l'aperçu depuis #7794 ; absent avant.
    public let avatar: String?
    /// Bannière du groupe — servie par l'aperçu depuis #7794 ; absente avant.
    public let banner: String?
}

public struct ShareLinkCreator: Decodable, Sendable {
    public let id: String
    public let username: String
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let avatar: String?

    public var name: String {
        displayName ?? [firstName, lastName].compactMap { $0 }.joined(separator: " ").nonEmpty ?? username
    }
}

public struct ShareLinkStats: Decodable, Sendable {
    public let totalParticipants: Int
    public let memberCount: Int
    public let anonymousCount: Int
    public let languageCount: Int
    public let spokenLanguages: [String]
}

// MARK: - Anonymous Join Request (POST /anonymous/join/:linkId)

public struct AnonymousJoinRequest: Encodable {
    public let firstName: String
    public let lastName: String
    public let username: String?
    public let email: String?
    public let birthday: String?
    public let language: String
    public let deviceFingerprint: String?

    public init(
        firstName: String,
        lastName: String,
        username: String? = nil,
        email: String? = nil,
        birthday: String? = nil,
        language: String = "fr",
        deviceFingerprint: String? = nil
    ) {
        self.firstName = firstName
        self.lastName = lastName
        self.username = username
        self.email = email
        self.birthday = birthday
        self.language = language
        self.deviceFingerprint = deviceFingerprint
    }
}

// MARK: - Anonymous Join Response

public struct AnonymousJoinResponse: Decodable {
    public let sessionToken: String
    public let participant: AnonymousParticipant
    public let conversation: JoinedConversation
    public let linkId: String
    public let id: String
}

// MARK: - Authenticated Join Response

/// Response returned by `POST /conversations/join/:linkId` when an already
/// authenticated user activates a share link. The gateway is idempotent —
/// existing members get the same shape as fresh joins, so callers can
/// always navigate to `conversationId` without pre-checking membership.
public struct JoinAuthenticatedResponse: Decodable, Sendable {
    public let conversationId: String
    public let message: String?
}

public struct AnonymousParticipant: Decodable, Sendable {
    public let id: String
    public let username: String
    public let displayName: String
    public let firstName: String
    public let lastName: String
    public let avatar: String?
    public let banner: String?
    public let language: String
    public let isMeeshyer: Bool
    public let canSendMessages: Bool
    public let canSendFiles: Bool
    public let canSendImages: Bool
}

public struct JoinedConversation: Decodable {
    public let id: String
    public let title: String?
    public let type: String
    public let allowViewHistory: Bool
}

// MARK: - Create Share Link Request (POST /links)

public struct CreateShareLinkRequest: Encodable, Sendable {
    public let conversationId: String
    public let name: String?
    public let description: String?
    public let identifier: String?
    public let maxUses: Int?
    public let maxConcurrentUsers: Int?
    public let expiresAt: String?
    public let allowAnonymousMessages: Bool
    public let allowAnonymousFiles: Bool
    public let allowAnonymousImages: Bool
    public let allowViewHistory: Bool
    public let requireAccount: Bool
    public let requireNickname: Bool
    public let requireEmail: Bool
    public let requireBirthday: Bool

    public init(
        conversationId: String,
        name: String? = nil,
        description: String? = nil,
        identifier: String? = nil,
        maxUses: Int? = nil,
        maxConcurrentUsers: Int? = nil,
        expiresAt: String? = nil,
        allowAnonymousMessages: Bool = true,
        allowAnonymousFiles: Bool = false,
        allowAnonymousImages: Bool = false,
        allowViewHistory: Bool = false,
        requireAccount: Bool = false,
        requireNickname: Bool = false,
        requireEmail: Bool = false,
        requireBirthday: Bool = false
    ) {
        self.conversationId = conversationId
        self.name = name
        self.description = description
        self.identifier = identifier
        self.maxUses = maxUses
        self.maxConcurrentUsers = maxConcurrentUsers
        self.expiresAt = expiresAt
        self.allowAnonymousMessages = allowAnonymousMessages
        self.allowAnonymousFiles = allowAnonymousFiles
        self.allowAnonymousImages = allowAnonymousImages
        self.allowViewHistory = allowViewHistory
        self.requireAccount = requireAccount
        self.requireNickname = requireNickname
        self.requireEmail = requireEmail
        self.requireBirthday = requireBirthday
    }
}

// MARK: - Create Share Link Response

/// Gateway returns: { data: { linkId, conversationId, shareLink: { id, linkId, name, ... } } }
/// This wrapper matches the actual API shape.
struct CreateShareLinkResponse: Decodable {
    let linkId: String
    let conversationId: String
    let shareLink: ShareLinkDetail

    struct ShareLinkDetail: Decodable {
        let id: String
        let linkId: String
        let name: String?
        let description: String?
        let expiresAt: Date?
        let isActive: Bool
    }
}

public struct CreatedShareLink {
    public let id: String
    public let linkId: String
    public let identifier: String?
    public let conversationId: String
    public let name: String?
    public let isActive: Bool

    /// L'URL web canonique du lien — `/chat/<slug>` (voir `MyShareLink.joinUrl`).
    /// Les feuilles de partage l'utilisent au lieu de fabriquer l'URL à la main
    /// (deux d'entre elles codaient `https://meeshy.me/join/…` en dur).
    public var joinUrl: String { "\(MeeshyConfig.shared.webOrigin)/chat/\(identifier ?? linkId)" }
}

// MARK: - User's Own Links (authenticated)

public struct MyShareLink: Codable, Identifiable, Sendable, CacheIdentifiable, Equatable {
    public let id: String
    public let linkId: String
    public let identifier: String?
    public let name: String?
    public let isActive: Bool
    public let currentUses: Int
    public let maxUses: Int?
    public let expiresAt: Date?
    public let createdAt: Date
    public let conversationTitle: String?

    // Servis avec `?expand=conversation,policy` (#7797). Optionnels : un cache
    // écrit par une version antérieure, ou une passerelle qui ne les sert pas,
    // les omet — `settings` résout alors les défauts du schéma.
    public let description: String?
    public let maxConcurrentUsers: Int?
    public let currentConcurrentUsers: Int?
    public let allowAnonymousMessages: Bool?
    public let allowAnonymousFiles: Bool?
    public let allowAnonymousImages: Bool?
    public let allowViewHistory: Bool?
    public let requireAccount: Bool?
    public let requireNickname: Bool?
    public let requireEmail: Bool?
    public let requireBirthday: Bool?
    public let allowedLanguages: [String]?
    public let conversation: ShareLinkConversationSummary?

    public init(
        id: String,
        linkId: String,
        identifier: String?,
        name: String?,
        isActive: Bool,
        currentUses: Int,
        maxUses: Int?,
        expiresAt: Date?,
        createdAt: Date,
        conversationTitle: String?,
        description: String? = nil,
        maxConcurrentUsers: Int? = nil,
        currentConcurrentUsers: Int? = nil,
        allowAnonymousMessages: Bool? = nil,
        allowAnonymousFiles: Bool? = nil,
        allowAnonymousImages: Bool? = nil,
        allowViewHistory: Bool? = nil,
        requireAccount: Bool? = nil,
        requireNickname: Bool? = nil,
        requireEmail: Bool? = nil,
        requireBirthday: Bool? = nil,
        allowedLanguages: [String]? = nil,
        conversation: ShareLinkConversationSummary? = nil
    ) {
        self.id = id
        self.linkId = linkId
        self.identifier = identifier
        self.name = name
        self.isActive = isActive
        self.currentUses = currentUses
        self.maxUses = maxUses
        self.expiresAt = expiresAt
        self.createdAt = createdAt
        self.conversationTitle = conversationTitle
        self.description = description
        self.maxConcurrentUsers = maxConcurrentUsers
        self.currentConcurrentUsers = currentConcurrentUsers
        self.allowAnonymousMessages = allowAnonymousMessages
        self.allowAnonymousFiles = allowAnonymousFiles
        self.allowAnonymousImages = allowAnonymousImages
        self.allowViewHistory = allowViewHistory
        self.requireAccount = requireAccount
        self.requireNickname = requireNickname
        self.requireEmail = requireEmail
        self.requireBirthday = requireBirthday
        self.allowedLanguages = allowedLanguages
        self.conversation = conversation
    }

    public var displayName: String { name ?? identifier ?? linkId }
    /// L'adresse canonique `/chat/<linkId>` que la fiche montre, copie et partage.
    public var address: ShareLinkAddress { ShareLinkAddress(linkId: linkId) }
    /// `/chat/<slug>` est l'URL canonique d'un lien de partage — la page web qui
    /// ouvre la conversation dans la vue courante ET un Universal Link revendiqué
    /// par l'app (`DeepLinkRouter` → `.chatLink`, traité comme `.joinLink`).
    /// `/join/<slug>` ne survit qu'en 308 pour les liens déjà en circulation.
    public var joinUrl: String { "\(MeeshyConfig.shared.webOrigin)/chat/\(identifier ?? linkId)" }
}

public struct MyShareLinkStats: Codable, Sendable, CacheIdentifiable {
    public var id: String { "stats" }
    public let totalLinks: Int
    public let activeLinks: Int
    public let totalUses: Int
}

// MARK: - String Helper

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
