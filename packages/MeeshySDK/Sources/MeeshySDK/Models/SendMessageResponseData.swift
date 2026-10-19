import Foundation

public struct SendMessageResponseData: Decodable, Sendable {
    public let id: String
    /// Echo of the `clientMessageId` sent in the request (Phase 4 contract).
    /// Optional on the wire because anonymous-link / legacy REST surfaces may
    /// not populate it yet during the rollout window.
    public let clientMessageId: String?
    public let conversationId: String
    public let senderId: String?
    public let content: String?
    public let messageType: String?
    public let createdAt: Date
}
