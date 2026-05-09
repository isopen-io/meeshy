import Foundation

// MARK: - Friend Request

public struct FriendRequest: Codable, CacheIdentifiable, Identifiable, Sendable, Equatable {
    public let id: String
    public let senderId: String
    public let receiverId: String
    public let message: String?
    public let status: String
    public let sender: FriendRequestUser?
    public let receiver: FriendRequestUser?
    public let respondedAt: Date?
    public let createdAt: Date
    public let updatedAt: Date?

    public init(
        id: String,
        senderId: String,
        receiverId: String,
        message: String? = nil,
        status: String,
        sender: FriendRequestUser? = nil,
        receiver: FriendRequestUser? = nil,
        respondedAt: Date? = nil,
        createdAt: Date,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.senderId = senderId
        self.receiverId = receiverId
        self.message = message
        self.status = status
        self.sender = sender
        self.receiver = receiver
        self.respondedAt = respondedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

extension FriendRequestUser: Equatable {
    public static func == (lhs: FriendRequestUser, rhs: FriendRequestUser) -> Bool {
        lhs.id == rhs.id
            && lhs.username == rhs.username
            && lhs.firstName == rhs.firstName
            && lhs.lastName == rhs.lastName
            && lhs.displayName == rhs.displayName
            && lhs.avatar == rhs.avatar
            && lhs.isOnline == rhs.isOnline
            && lhs.lastActiveAt == rhs.lastActiveAt
    }
}

public struct FriendRequestUser: Codable, CacheIdentifiable, Sendable {
    public let id: String
    public let username: String
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?

    public var name: String {
        displayName ?? [firstName, lastName].compactMap { $0 }.joined(separator: " ").nonEmpty ?? username
    }
}

// MARK: - Send Friend Request

public struct SendFriendRequest: Encodable {
    public let receiverId: String
    public let message: String?

    public init(receiverId: String, message: String? = nil) {
        self.receiverId = receiverId
        self.message = message
    }
}

// MARK: - Respond to Friend Request

public struct RespondFriendRequest: Encodable {
    public let status: String

    public init(accepted: Bool) {
        self.status = accepted ? "accepted" : "rejected"
    }
}

// MARK: - Email Invitation

public struct EmailInvitationRequest: Encodable {
    public let email: String

    public init(email: String) {
        self.email = email
    }
}

public struct EmailInvitationResponse: Decodable {
    public let email: String
    public let sentAt: Date?
}

// MARK: - String Helper

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
