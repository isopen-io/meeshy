// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run ios-endpoints:generate
//
// Les politiques d'authentification et de réessai ne sont PAS ici : ce sont des
// décisions client, écrites à la main en redéfinition de `MeeshyEndpoint`.

import Foundation

public enum AuthEndpoint: MeeshyEndpoint, Sendable {
    case checkAvailability
    case forgotPassword
    case forgotPasswordPhoneLookup
    case forgotPasswordPhoneResend
    case forgotPasswordPhoneVerifyCode
    case forgotPasswordPhoneVerifyIdentity
    case login
    case loginN2Fa
    case logout
    case magicLinkRequest
    case magicLinkValidate
    case me
    case n2FaBackupCodes
    case n2FaCancel
    case n2FaDisable
    case n2FaEnable
    case n2FaSetup
    case n2FaStatus
    case n2FaVerify
    case phoneTransferCancel
    case phoneTransferCheck
    case phoneTransferInitiate
    case phoneTransferInitiateRegistration
    case phoneTransferResend
    case phoneTransferVerify
    case phoneTransferVerifyRegistration
    case refresh
    case register
    case resendVerification
    case resetPassword
    case resetPasswordVerifyToken
    case revokeAllSessions
    case sendPhoneCode
    case sessions
    case sessionsBySessionId(sessionId: String)
    case verifyEmail
    case verifyPhone

    public var path: String {
        switch self {
        case .checkAvailability: return "/api/v1/auth/check-availability"
        case .forgotPassword: return "/api/v1/auth/forgot-password"
        case .forgotPasswordPhoneLookup: return "/api/v1/auth/forgot-password/phone/lookup"
        case .forgotPasswordPhoneResend: return "/api/v1/auth/forgot-password/phone/resend"
        case .forgotPasswordPhoneVerifyCode: return "/api/v1/auth/forgot-password/phone/verify-code"
        case .forgotPasswordPhoneVerifyIdentity: return "/api/v1/auth/forgot-password/phone/verify-identity"
        case .login: return "/api/v1/auth/login"
        case .loginN2Fa: return "/api/v1/auth/login/2fa"
        case .logout: return "/api/v1/auth/logout"
        case .magicLinkRequest: return "/api/v1/auth/magic-link/request"
        case .magicLinkValidate: return "/api/v1/auth/magic-link/validate"
        case .me: return "/api/v1/auth/me"
        case .n2FaBackupCodes: return "/api/v1/auth/2fa/backup-codes"
        case .n2FaCancel: return "/api/v1/auth/2fa/cancel"
        case .n2FaDisable: return "/api/v1/auth/2fa/disable"
        case .n2FaEnable: return "/api/v1/auth/2fa/enable"
        case .n2FaSetup: return "/api/v1/auth/2fa/setup"
        case .n2FaStatus: return "/api/v1/auth/2fa/status"
        case .n2FaVerify: return "/api/v1/auth/2fa/verify"
        case .phoneTransferCancel: return "/api/v1/auth/phone-transfer/cancel"
        case .phoneTransferCheck: return "/api/v1/auth/phone-transfer/check"
        case .phoneTransferInitiate: return "/api/v1/auth/phone-transfer/initiate"
        case .phoneTransferInitiateRegistration: return "/api/v1/auth/phone-transfer/initiate-registration"
        case .phoneTransferResend: return "/api/v1/auth/phone-transfer/resend"
        case .phoneTransferVerify: return "/api/v1/auth/phone-transfer/verify"
        case .phoneTransferVerifyRegistration: return "/api/v1/auth/phone-transfer/verify-registration"
        case .refresh: return "/api/v1/auth/refresh"
        case .register: return "/api/v1/auth/register"
        case .resendVerification: return "/api/v1/auth/resend-verification"
        case .resetPassword: return "/api/v1/auth/reset-password"
        case .resetPasswordVerifyToken: return "/api/v1/auth/reset-password/verify-token"
        case .revokeAllSessions: return "/api/v1/auth/revoke-all-sessions"
        case .sendPhoneCode: return "/api/v1/auth/send-phone-code"
        case .sessions: return "/api/v1/auth/sessions"
        case .sessionsBySessionId(let sessionId): return "/api/v1/auth/sessions/\(sessionId)"
        case .verifyEmail: return "/api/v1/auth/verify-email"
        case .verifyPhone: return "/api/v1/auth/verify-phone"
        }
    }
}
