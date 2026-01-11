//
//  AuthEndpoints.swift
//  Meeshy
//
//  Authentication API endpoints
//

import Foundation

enum AuthEndpoints: APIEndpoint, Sendable {

    case login(LoginRequest)
    case currentUser
    case register(RegisterRequest)
    case refreshToken(RefreshTokenRequest)
    case logout(LogoutRequest?)
    case setup2FA
    case verify2FA(TwoFactorVerifyRequest)
    case requestPasswordReset(PasswordResetRequest)
    case changePassword(PasswordChangeRequest)
    case verifyEmail(token: String)
    case resendVerification
    case checkAvailability(username: String?, email: String?, phoneNumber: String?)
    case joinAnonymous(linkId: String, request: JoinAnonymousRequest)

    // Anonymous link endpoints
    case getLinkInfo(linkId: String)
    case checkUsername(username: String)
    case refreshAnonymousSession
    case leaveAnonymousSession

    var path: String {
        switch self {
        case .login:
            return "\(EnvironmentConfig.apiPath)/auth/login"
        case .currentUser:
            return "\(EnvironmentConfig.apiPath)/auth/me"
        case .register:
            return "\(EnvironmentConfig.apiPath)/auth/register"
        case .refreshToken:
            return "\(EnvironmentConfig.apiPath)/auth/refresh"
        case .logout:
            return "\(EnvironmentConfig.apiPath)/auth/logout"
        case .setup2FA:
            return "\(EnvironmentConfig.apiPath)/auth/2fa/setup"
        case .verify2FA:
            return "\(EnvironmentConfig.apiPath)/auth/2fa/verify"
        case .requestPasswordReset:
            return "\(EnvironmentConfig.apiPath)/auth/password/reset"
        case .changePassword:
            return "\(EnvironmentConfig.apiPath)/auth/password/change"
        case .verifyEmail(let token):
            return "\(EnvironmentConfig.apiPath)/auth/verify/\(token)"
        case .resendVerification:
            return "\(EnvironmentConfig.apiPath)/auth/verify/resend"
        case .checkAvailability(let username, let email, let phoneNumber):
            var queryItems: [String] = []
            if let username = username {
                queryItems.append("username=\(username.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? username)")
            }
            if let email = email {
                queryItems.append("email=\(email.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? email)")
            }
            if let phoneNumber = phoneNumber {
                queryItems.append("phoneNumber=\(phoneNumber.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? phoneNumber)")
            }
            let queryString = queryItems.isEmpty ? "" : "?\(queryItems.joined(separator: "&"))"
            return "\(EnvironmentConfig.apiPath)/auth/check-availability\(queryString)"
        case .joinAnonymous(let linkId, _):
            return "\(EnvironmentConfig.apiPath)/anonymous/join/\(linkId)"
        case .getLinkInfo(let linkId):
            return "\(EnvironmentConfig.apiPath)/anonymous/link/\(linkId)"
        case .checkUsername(let username):
            return "\(EnvironmentConfig.apiPath)/users/check-username/\(username.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? username)"
        case .refreshAnonymousSession:
            return "\(EnvironmentConfig.apiPath)/anonymous/refresh"
        case .leaveAnonymousSession:
            return "\(EnvironmentConfig.apiPath)/anonymous/leave"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .login, .register, .refreshToken, .logout, .verify2FA, .requestPasswordReset, .changePassword, .resendVerification, .joinAnonymous, .refreshAnonymousSession, .leaveAnonymousSession:
            return .post
        case .currentUser, .setup2FA, .verifyEmail, .checkAvailability, .getLinkInfo, .checkUsername:
            return .get
        }
    }

    var body: Encodable? {
        switch self {
        case .login(let request):
            return request
        case .register(let request):
            return request
        case .refreshToken(let request):
            return request
        case .logout(let request):
            return request
        case .verify2FA(let request):
            return request
        case .requestPasswordReset(let request):
            return request
        case .changePassword(let request):
            return request
        case .joinAnonymous(_, let request):
            return request
        default:
            return nil
        }
    }

    var requiresAuth: Bool {
        switch self {
        case .login, .register, .refreshToken, .verifyEmail, .requestPasswordReset, .resendVerification, .checkAvailability, .joinAnonymous, .getLinkInfo, .checkUsername:
            return false
        case .refreshAnonymousSession, .leaveAnonymousSession:
            return false // Uses X-Session-Token header instead
        default:
            return true
        }
    }

    var customHeaders: [String: String]? {
        switch self {
        case .refreshAnonymousSession, .leaveAnonymousSession:
            // These endpoints use X-Session-Token header
            // Token will be added by the service
            return nil
        default:
            return nil
        }
    }
}
