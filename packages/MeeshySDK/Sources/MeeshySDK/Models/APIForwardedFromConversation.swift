import Foundation

public struct APIForwardedFromConversation: Decodable, Sendable {
    public let id: String
    public let title: String?
    public let identifier: String?
    public let type: String?
    public let avatar: String?
}
