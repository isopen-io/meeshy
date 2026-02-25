import Foundation

// MARK: - Friend Request

public struct FriendRequest: Decodable, Identifiable {
    public let id: String
    public let senderId: String
    public let receiverId: String
    public let message: String?
    public let status: String
    public let sender: FriendRequestUser?
    public let receiver: FriendRequestUser?
    public let createdAt: Date
    public let updatedAt: Date?
}

public struct FriendRequestUser: Decodable {
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

// MARK: - String Helper

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
