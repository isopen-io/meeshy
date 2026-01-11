//
//  UserEndpoints.swift
//  Meeshy
//
//  User API endpoints
//  UPDATED: Uses offset/limit pagination pattern
//

import Foundation

enum UserEndpoints: APIEndpoint, Sendable {

    case getCurrentUser
    case updateProfile(UserProfileUpdateRequest)
    case getUser(userId: String)
    case searchUsers(query: String, offset: Int, limit: Int)
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

    // Availability checks for registration
    case checkUsernameAvailability(username: String)
    case checkEmailAvailability(email: String)
    case checkPhoneAvailability(phone: String)

    var path: String {
        switch self {
        case .getCurrentUser:
            return "\(EnvironmentConfig.apiPath)/auth/me"
        case .updateProfile:
            return "\(EnvironmentConfig.apiPath)/users/me"
        case .getUser(let userId):
            return "\(EnvironmentConfig.apiPath)/users/\(userId)"
        case .searchUsers:
            return "\(EnvironmentConfig.apiPath)/users/search"
        case .updateStatus:
            return "\(EnvironmentConfig.apiPath)/users/me/status"
        case .updatePreferences:
            return "\(EnvironmentConfig.apiPath)/users/me/preferences"
        case .blockUser(let userId):
            return "\(EnvironmentConfig.apiPath)/users/me/blocked/\(userId)"
        case .unblockUser(let userId):
            return "\(EnvironmentConfig.apiPath)/users/me/blocked/\(userId)"
        case .getBlockedUsers:
            return "\(EnvironmentConfig.apiPath)/users/me/blocked"
        case .reportUser(let userId, _):
            return "\(EnvironmentConfig.apiPath)/users/\(userId)/report"
        case .deleteAccount:
            return "\(EnvironmentConfig.apiPath)/users/me"
        case .uploadAvatar:
            return "\(EnvironmentConfig.apiPath)/users/me/avatar"
        case .registerDeviceToken, .unregisterDeviceToken:
            return "\(EnvironmentConfig.apiPath)/users/register-device-token"
        case .checkUsernameAvailability(let username):
            return "\(EnvironmentConfig.apiPath)/auth/check-username/\(username)"
        case .checkEmailAvailability(let email):
            return "\(EnvironmentConfig.apiPath)/auth/check-email/\(email.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? email)"
        case .checkPhoneAvailability(let phone):
            return "\(EnvironmentConfig.apiPath)/auth/check-phone/\(phone.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? phone)"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .getCurrentUser, .getUser, .searchUsers, .getBlockedUsers,
             .checkUsernameAvailability, .checkEmailAvailability, .checkPhoneAvailability:
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
        case .searchUsers(let query, let offset, let limit):
            return ["q": query, "offset": offset, "limit": limit]
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
