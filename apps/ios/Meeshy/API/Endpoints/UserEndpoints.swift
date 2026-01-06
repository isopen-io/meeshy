//
//  UserEndpoints.swift
//  Meeshy
//
//  User API endpoints
//

import Foundation

enum UserEndpoints: APIEndpoint, Sendable {

    case getCurrentUser
    case updateProfile(UserProfileUpdateRequest)
    case getUser(userId: String)
    case searchUsers(query: String, page: Int, limit: Int)
    case updateStatus(UserStatusUpdateRequest)
    case updatePreferences(UserPreferences)
    case blockUser(userId: String)
    case unblockUser(userId: String)
    case getBlockedUsers
    case reportUser(userId: String, reason: String)
    case deleteAccount
    case uploadAvatar

    // Device Token Registration (VoIP/APNS) - aligned with gateway API
    case registerDeviceToken(apnsToken: String, platform: String)
    case unregisterDeviceToken

    var path: String {
        switch self {
        case .getCurrentUser:
            return "/api/auth/me"
        case .updateProfile:
            return "/api/users/me"
        case .getUser(let userId):
            return "/api/users/\(userId)"
        case .searchUsers:
            return "/api/users/search"
        case .updateStatus:
            return "/api/users/me/status"
        case .updatePreferences:
            return "/api/users/me/preferences"
        case .blockUser(let userId):
            return "/api/users/me/blocked/\(userId)"
        case .unblockUser(let userId):
            return "/api/users/me/blocked/\(userId)"
        case .getBlockedUsers:
            return "/api/users/me/blocked"
        case .reportUser(let userId, _):
            return "/api/users/\(userId)/report"
        case .deleteAccount:
            return "/api/users/me"
        case .uploadAvatar:
            return "/api/users/me/avatar"
        case .registerDeviceToken, .unregisterDeviceToken:
            return "/api/users/register-device-token"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .getCurrentUser, .getUser, .searchUsers, .getBlockedUsers:
            return .get
        case .blockUser, .reportUser, .uploadAvatar, .registerDeviceToken:
            return .post
        case .updateProfile:
            return .patch
        case .updateStatus, .updatePreferences:
            return .put
        case .unblockUser, .deleteAccount, .unregisterDeviceToken:
            return .delete
        }
    }

    var queryParameters: [String: Any]? {
        switch self {
        case .searchUsers(let query, let page, let limit):
            return ["q": query, "page": page, "limit": limit]
        default:
            return nil
        }
    }

    var body: Encodable? {
        switch self {
        case .updateProfile(let request):
            return request
        case .updateStatus(let request):
            return request
        case .updatePreferences(let preferences):
            return preferences
        case .reportUser(_, let reason):
            return ["reason": reason]
        case .registerDeviceToken(let apnsToken, let platform):
            return ["apnsToken": apnsToken, "platform": platform]
        default:
            return nil
        }
    }
}
