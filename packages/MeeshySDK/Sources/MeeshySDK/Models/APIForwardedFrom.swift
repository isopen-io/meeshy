import Foundation

public struct APIForwardedFrom: Decodable, Sendable {
    public let id: String
    public let content: String?
    public let messageType: String?
    public let createdAt: Date?
    public let sender: APIMessageSender?
    public let attachments: [APIMessageAttachment]?
}
