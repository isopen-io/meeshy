import Foundation

// MARK: - Read Status API Models

struct ReadStatusData: Decodable {
    let messageId: String
    let totalMembers: Int
    let receivedCount: Int
    let readCount: Int
    let notSeenCount: Int?
    let receivedBy: [ReceivedByUser]
    let readBy: [ReadByUser]
    let notSeenBy: [NotSeenByUser]?
}

struct ReceivedByUser: Decodable, Identifiable {
    let participantId: String
    let displayName: String
    let avatarURL: String?
    let receivedAt: Date
    var id: String { participantId }
}

struct ReadByUser: Decodable, Identifiable {
    let participantId: String
    let displayName: String
    let avatarURL: String?
    let readAt: Date
    var id: String { participantId }
}

struct NotSeenByUser: Decodable, Identifiable {
    let participantId: String
    let displayName: String
    let avatarURL: String?
    var id: String { participantId }
}
