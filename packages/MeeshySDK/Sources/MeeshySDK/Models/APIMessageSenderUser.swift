import Foundation

public struct APIMessageSenderUser: Decodable, Sendable {
    public let id: String?
    public let username: String?
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
}
