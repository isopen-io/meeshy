//
//  NotificationEndpoints.swift
//  Meeshy
//
//  Notification API endpoints
//  UPDATED: Uses offset/limit pagination pattern
//

import Foundation

enum NotificationEndpoints: APIEndpoint, Sendable {

    case fetchNotifications(offset: Int, limit: Int)
    case markAsRead(notificationId: String)
    case markAllAsRead
    case deleteNotification(notificationId: String)
    case deleteAllNotifications
    case updatePreferences(NotificationPreferencesUpdateRequest)
    case registerPushToken(token: String, platform: String)
    case unregisterPushToken(token: String)

    var path: String {
        switch self {
        case .fetchNotifications:
            return "/api/notifications"
        case .markAsRead(let notificationId):
            return "/api/notifications/\(notificationId)/read"
        case .markAllAsRead:
            return "/api/notifications/read-all"
        case .deleteNotification(let notificationId):
            return "/api/notifications/\(notificationId)"
        case .deleteAllNotifications:
            return "/api/notifications/read"
        case .updatePreferences:
            return "/api/notifications/preferences"
        case .registerPushToken:
            return "/api/notifications/push/register"
        case .unregisterPushToken:
            return "/api/notifications/push/unregister"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .fetchNotifications:
            return .get
        case .registerPushToken:
            return .post
        case .markAsRead, .markAllAsRead:
            return .patch
        case .updatePreferences:
            return .put
        case .deleteNotification, .deleteAllNotifications, .unregisterPushToken:
            return .delete
        }
    }

    var queryParameters: [String: Any]? {
        switch self {
        case .fetchNotifications(let offset, let limit):
            return ["offset": offset, "limit": limit]
        default:
            return nil
        }
    }

    var body: Encodable? {
        switch self {
        case .updatePreferences(let request):
            return request
        case .registerPushToken(let token, let platform):
            return ["token": token, "platform": platform]
        case .unregisterPushToken(let token):
            return ["token": token]
        default:
            return nil
        }
    }
}
