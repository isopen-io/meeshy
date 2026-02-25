import Foundation

// MARK: - Community Role

public enum CommunityRole: String, Codable, CaseIterable {
    case admin
    case moderator
    case member

    public var displayName: String {
        switch self {
        case .admin: return "Admin"
        case .moderator: return "Moderator"
        case .member: return "Member"
        }
    }

    public var icon: String {
        switch self {
        case .admin: return "crown.fill"
        case .moderator: return "shield.fill"
        case .member: return "person.fill"
        }
    }

    public var hierarchy: Int {
        switch self {
        case .admin: return 3
        case .moderator: return 2
        case .member: return 1
        }
    }

    public func hasPermission(_ permission: CommunityPermission) -> Bool {
        CommunityPermissions.forRole(self).contains(permission)
    }
}

// MARK: - Community Permissions

public enum CommunityPermission: String, CaseIterable {
    case inviteMembers
    case removeMembers
    case editCommunity
    case deleteCommunity
    case moderateContent
    case manageRoles
    case createConversations
    case editConversations
}

public enum CommunityPermissions {
    public static func forRole(_ role: CommunityRole) -> Set<CommunityPermission> {
        switch role {
        case .admin:
            return Set(CommunityPermission.allCases)
        case .moderator:
            return [.inviteMembers, .removeMembers, .moderateContent, .createConversations, .editConversations]
        case .member:
            return [.createConversations]
        }
    }
}

// MARK: - API Community User

public struct APICommunityUser: Decodable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?

    public var name: String { displayName ?? username }
}

// MARK: - API Community Member

public struct APICommunityMember: Decodable, Identifiable {
    public let id: String
    public let communityId: String
    public let userId: String
    public let role: String
    public let joinedAt: Date?
    public let user: APICommunityUser?

    public var communityRole: CommunityRole {
        CommunityRole(rawValue: role) ?? .member
    }
}

// MARK: - API Community Count

public struct APICommunityCount: Decodable {
    public let members: Int?
    public let Conversation: Int?

    enum CodingKeys: String, CodingKey {
        case members
        case Conversation
    }

    public var conversations: Int { Conversation ?? 0 }
}

// MARK: - API Community

public struct APICommunity: Decodable, Identifiable {
    public let id: String
    public let identifier: String
    public let name: String
    public let description: String?
    public let avatar: String?
    public let isPrivate: Bool
    public let createdBy: String
    public let createdAt: Date
    public let updatedAt: Date?
    public let creator: APICommunityUser?
    public let members: [APICommunityMember]?
    public let _count: APICommunityCount?
}

extension APICommunity {
    public func toCommunity() -> MeeshyCommunity {
        MeeshyCommunity(
            id: id,
            identifier: identifier,
            name: name,
            description: description,
            avatar: avatar,
            isPrivate: isPrivate,
            createdBy: createdBy,
            createdAt: createdAt,
            updatedAt: updatedAt ?? createdAt,
            memberCount: _count?.members ?? members?.count ?? 0,
            conversationCount: _count?.conversations ?? 0
        )
    }
}

// MARK: - API Community Search Result

public struct APICommunitySearchResult: Decodable, Identifiable {
    public let id: String
    public let name: String
    public let identifier: String
    public let description: String?
    public let avatar: String?
    public let isPrivate: Bool
    public let memberCount: Int?
    public let conversationCount: Int?
    public let createdAt: Date
    public let creator: APICommunityUser?
    public let members: [APICommunityMember]?

    public func toCommunity() -> MeeshyCommunity {
        MeeshyCommunity(
            id: id,
            identifier: identifier,
            name: name,
            description: description,
            avatar: avatar,
            isPrivate: isPrivate,
            createdAt: createdAt,
            updatedAt: createdAt,
            memberCount: memberCount ?? 0,
            conversationCount: conversationCount ?? 0
        )
    }
}

// MARK: - Create Community Request

public struct CreateCommunityRequest: Encodable {
    public let name: String
    public let identifier: String?
    public let description: String?
    public let isPrivate: Bool

    public init(name: String, identifier: String? = nil, description: String? = nil, isPrivate: Bool = true) {
        self.name = name
        self.identifier = identifier
        self.description = description
        self.isPrivate = isPrivate
    }
}

// MARK: - Update Community Request

public struct UpdateCommunityRequest: Encodable {
    public let name: String?
    public let identifier: String?
    public let description: String?
    public let isPrivate: Bool?

    public init(name: String? = nil, identifier: String? = nil, description: String? = nil, isPrivate: Bool? = nil) {
        self.name = name
        self.identifier = identifier
        self.description = description
        self.isPrivate = isPrivate
    }
}

// MARK: - Invite Member Request

public struct InviteMemberRequest: Encodable {
    public let userId: String

    public init(userId: String) {
        self.userId = userId
    }
}

// MARK: - Identifier Availability

public struct IdentifierAvailability: Decodable {
    public let available: Bool
    public let identifier: String
}
