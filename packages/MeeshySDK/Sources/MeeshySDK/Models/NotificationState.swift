import Foundation

// MARK: - Notification State

public struct NotificationState: Codable, Sendable, Equatable {
    public let isRead: Bool
    public let readAt: String?
    public let createdAt: String
    public let expiresAt: String?

    public init(isRead: Bool, readAt: String?, createdAt: String, expiresAt: String?) {
        self.isRead = isRead; self.readAt = readAt
        self.createdAt = createdAt; self.expiresAt = expiresAt
    }
}
