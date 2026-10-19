import Foundation

// MARK: - Notification Actor (who triggered)

public struct NotificationActor: Codable, Sendable, Equatable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?

    public var displayedName: String {
        displayName ?? username
    }
}
