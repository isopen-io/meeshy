import Foundation

// MARK: - Share Link Info (GET /anonymous/link/:identifier)

public struct ShareLinkInfo: Decodable {
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
    public let conversation: ShareLinkConversation
    public let creator: ShareLinkCreator
    public let stats: ShareLinkStats
}

public struct ShareLinkConversation: Decodable {
    public let id: String
    public let title: String?
    public let description: String?
    public let type: String
    public let createdAt: Date
}

public struct ShareLinkCreator: Decodable {
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

public struct ShareLinkStats: Decodable {
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

public struct AnonymousParticipant: Decodable {
    public let id: String
    public let username: String
    public let firstName: String
    public let lastName: String
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

public struct CreateShareLinkRequest: Encodable {
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

public struct CreatedShareLink: Decodable {
    public let id: String
    public let linkId: String
    public let identifier: String?
    public let conversationId: String
    public let name: String?
    public let isActive: Bool
    public let createdAt: Date
}

// MARK: - User's Own Links (authenticated)

public struct MyShareLink: Decodable, Identifiable {
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

    public var displayName: String { name ?? identifier ?? linkId }
    public var joinUrl: String { "\(MeeshyConfig.shared.serverOrigin)/join/\(identifier ?? linkId)" }
}

public struct MyShareLinkStats: Decodable {
    public let totalLinks: Int
    public let activeLinks: Int
    public let totalUses: Int
}

// MARK: - String Helper

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
