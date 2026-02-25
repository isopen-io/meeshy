import Foundation

public final class NotificationService {
    public static let shared = NotificationService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func list(offset: Int = 0, limit: Int = 20, unreadOnly: Bool = false) async throws -> NotificationListResponse {
        var queryItems = [
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if unreadOnly {
            queryItems.append(URLQueryItem(name: "unreadOnly", value: "true"))
        }
        return try await api.request(endpoint: "/notifications", queryItems: queryItems)
    }

    public func unreadCount() async throws -> Int {
        let response: UnreadCountResponse = try await api.request(endpoint: "/notifications/unread-count")
        return response.count
    }

    public func markAsRead(notificationId: String) async throws {
        let _: APIResponse<APINotification> = try await api.request(
            endpoint: "/notifications/\(notificationId)/read",
            method: "POST"
        )
    }

    public func markAllAsRead() async throws -> Int {
        let response: MarkReadResponse = try await api.request(
            endpoint: "/notifications/read-all",
            method: "POST"
        )
        return response.count ?? 0
    }

    public func delete(notificationId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/notifications/\(notificationId)")
    }
}
