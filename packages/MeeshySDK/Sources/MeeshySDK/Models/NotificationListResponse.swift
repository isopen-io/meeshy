import Foundation

// MARK: - Notification Response

public struct NotificationListResponse: Decodable {
    public let success: Bool
    public let data: [APINotification]
    public let pagination: NotificationPagination?
    public let unreadCount: Int?
}

public struct NotificationPagination: Decodable {
    /// Mode offset uniquement — une page servie par curseur n'est pas comptée.
    public let total: Int?
    /// Mode offset uniquement — une page servie par curseur n'a pas de rang.
    public let offset: Int?
    public let limit: Int
    public let hasMore: Bool
    /// Ancre de reprise `(createdAt, id)` ; `nil` en fin de liste.
    public let nextCursor: String?
}
