import Foundation

// MARK: - Legacy NotificationData (computed from context)

public struct NotificationData: Decodable {
    public let conversationId: String?
    public let messageId: String?
    public let postId: String?
    public let achievementId: String?
    public let callId: String?
    public let friendRequestId: String?
    public let preview: String?
}
