import Foundation

public struct MessagesAPIMeta: Decodable, Sendable {
    public let userLanguage: String?
    public let mentionedUsers: [MentionedUser]?
}
