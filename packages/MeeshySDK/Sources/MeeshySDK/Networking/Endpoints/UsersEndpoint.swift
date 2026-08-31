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

public enum UsersEndpoint: MeeshyEndpoint, Sendable {
    case byId(id: String)
    case byUserIdAffiliateToken(userId: String)
    case byUserIdBlock(userId: String)
    case byUserIdStats(userId: String)
    case emailByEmail(email: String)
    case friendRequests
    case idById(id: String)
    case me
    case meAvatar
    case meBanner
    case meBlockedUsers
    case meChangeEmail
    case meChangePhone
    case meContactChanges
    case meContactChangesByChannelResend(channel: String)
    case meContactChangesByChannelVerify(channel: String)
    case meContacts
    case meContactsMatch
    case meContactsSync
    case meDashboardStats
    case meDevices
    case meDevicesByDeviceId(deviceId: String)
    case mePassword
    case meResendEmailChangeVerification
    case meStats
    case meStatsAchievements
    case meStatsTimeline
    case meUsername
    case meVerifyEmailChange
    case meVerifyPhoneChange
    case phoneByPhone(phone: String)
    case presence
    case registerDeviceToken
    case search

    public var path: String {
        switch self {
        case .byId(let id): return "/api/v1/users/\(id)"
        case .byUserIdAffiliateToken(let userId): return "/api/v1/users/\(userId)/affiliate-token"
        case .byUserIdBlock(let userId): return "/api/v1/users/\(userId)/block"
        case .byUserIdStats(let userId): return "/api/v1/users/\(userId)/stats"
        case .emailByEmail(let email): return "/api/v1/users/email/\(email)"
        case .friendRequests: return "/api/v1/users/friend-requests"
        case .idById(let id): return "/api/v1/users/id/\(id)"
        case .me: return "/api/v1/users/me"
        case .meAvatar: return "/api/v1/users/me/avatar"
        case .meBanner: return "/api/v1/users/me/banner"
        case .meBlockedUsers: return "/api/v1/users/me/blocked-users"
        case .meChangeEmail: return "/api/v1/users/me/change-email"
        case .meChangePhone: return "/api/v1/users/me/change-phone"
        case .meContactChanges: return "/api/v1/users/me/contact-changes"
        case .meContactChangesByChannelResend(let channel): return "/api/v1/users/me/contact-changes/\(channel)/resend"
        case .meContactChangesByChannelVerify(let channel): return "/api/v1/users/me/contact-changes/\(channel)/verify"
        case .meContacts: return "/api/v1/users/me/contacts"
        case .meContactsMatch: return "/api/v1/users/me/contacts/match"
        case .meContactsSync: return "/api/v1/users/me/contacts/sync"
        case .meDashboardStats: return "/api/v1/users/me/dashboard-stats"
        case .meDevices: return "/api/v1/users/me/devices"
        case .meDevicesByDeviceId(let deviceId): return "/api/v1/users/me/devices/\(deviceId)"
        case .mePassword: return "/api/v1/users/me/password"
        case .meResendEmailChangeVerification: return "/api/v1/users/me/resend-email-change-verification"
        case .meStats: return "/api/v1/users/me/stats"
        case .meStatsAchievements: return "/api/v1/users/me/stats/achievements"
        case .meStatsTimeline: return "/api/v1/users/me/stats/timeline"
        case .meUsername: return "/api/v1/users/me/username"
        case .meVerifyEmailChange: return "/api/v1/users/me/verify-email-change"
        case .meVerifyPhoneChange: return "/api/v1/users/me/verify-phone-change"
        case .phoneByPhone(let phone): return "/api/v1/users/phone/\(phone)"
        case .presence: return "/api/v1/users/presence"
        case .registerDeviceToken: return "/api/v1/users/register-device-token"
        case .search: return "/api/v1/users/search"
        }
    }
}
