import Foundation

// MARK: - Participant Type

public enum ParticipantType: String, Codable, Sendable {
    case user
    case anonymous
    case bot
}

// MARK: - Participant Permissions

public struct ParticipantPermissions: Codable, Sendable {
    public let canSendMessages: Bool
    public let canSendFiles: Bool
    public let canSendImages: Bool
    public let canSendVideos: Bool
    public let canSendAudios: Bool
    public let canSendLocations: Bool
    public let canSendLinks: Bool

    public init(
        canSendMessages: Bool = true,
        canSendFiles: Bool = true,
        canSendImages: Bool = true,
        canSendVideos: Bool = true,
        canSendAudios: Bool = true,
        canSendLocations: Bool = true,
        canSendLinks: Bool = true
    ) {
        self.canSendMessages = canSendMessages
        self.canSendFiles = canSendFiles
        self.canSendImages = canSendImages
        self.canSendVideos = canSendVideos
        self.canSendAudios = canSendAudios
        self.canSendLocations = canSendLocations
        self.canSendLinks = canSendLinks
    }

    public static let defaultUser = ParticipantPermissions()

    public static let defaultAnonymous = ParticipantPermissions(
        canSendMessages: true,
        canSendFiles: false,
        canSendImages: true,
        canSendVideos: false,
        canSendAudios: false,
        canSendLocations: false,
        canSendLinks: false
    )
}

// MARK: - Anonymous Profile

public struct AnonymousProfile: Codable, Sendable {
    public let firstName: String
    public let lastName: String
    public let username: String
    public let email: String?
    public let birthday: Date?

    public init(firstName: String, lastName: String, username: String, email: String? = nil, birthday: Date? = nil) {
        self.firstName = firstName
        self.lastName = lastName
        self.username = username
        self.email = email
        self.birthday = birthday
    }
}

// MARK: - Anonymous Session Response (from join endpoint)

public struct AnonymousSessionResponse: Decodable, Sendable {
    public let profile: AnonymousProfile
}

// MARK: - Paginated Participant (GET /conversations/:id/participants response)

public struct PaginatedParticipant: Decodable, Identifiable, Sendable {
    public let id: String
    public let userId: String?
    public let username: String?
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let avatar: String?
    public var conversationRole: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
    public let joinedAt: Date?
    public let isActive: Bool?

    public var name: String {
        displayName ?? [firstName, lastName].compactMap { $0 }.joined(separator: " ").nilIfEmpty ?? username ?? "?"
    }
}

public struct PaginatedParticipantsResponse: Decodable, Sendable {
    public let success: Bool
    public let data: [PaginatedParticipant]
    public let pagination: PaginatedParticipantsPagination?
}

public struct PaginatedParticipantsPagination: Decodable, Sendable {
    public let nextCursor: String?
    public let hasMore: Bool
    public let totalCount: Int?
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

// MARK: - API Participant (REST response model — embedded in conversation responses)

public struct APIParticipant: Decodable, Identifiable, Sendable {
    public let id: String
    public let conversationId: String
    public let type: ParticipantType
    public let userId: String?
    public let displayName: String
    public let avatar: String?
    public let role: String
    public let language: String
    public let permissions: ParticipantPermissions
    public let isActive: Bool
    public let isOnline: Bool?
    public let joinedAt: Date
    public let leftAt: Date?
    public let bannedAt: Date?
    public let nickname: String?
    public let lastActiveAt: Date?
    public let user: APIConversationUser?

    public init(
        id: String,
        conversationId: String,
        type: ParticipantType,
        userId: String?,
        displayName: String,
        avatar: String?,
        role: String,
        language: String,
        permissions: ParticipantPermissions,
        isActive: Bool,
        isOnline: Bool?,
        joinedAt: Date,
        leftAt: Date?,
        bannedAt: Date?,
        nickname: String?,
        lastActiveAt: Date?,
        user: APIConversationUser?
    ) {
        self.id = id
        self.conversationId = conversationId
        self.type = type
        self.userId = userId
        self.displayName = displayName
        self.avatar = avatar
        self.role = role
        self.language = language
        self.permissions = permissions
        self.isActive = isActive
        self.isOnline = isOnline
        self.joinedAt = joinedAt
        self.leftAt = leftAt
        self.bannedAt = bannedAt
        self.nickname = nickname
        self.lastActiveAt = lastActiveAt
        self.user = user
    }

    public var name: String { nickname ?? displayName }
    public var resolvedAvatar: String? { avatar ?? user?.resolvedAvatar }
}
