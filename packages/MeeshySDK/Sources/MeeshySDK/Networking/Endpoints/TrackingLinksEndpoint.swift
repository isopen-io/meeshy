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

public enum TrackingLinksEndpoint: MeeshyEndpoint, Sendable {
    case adminAll
    case adminByTokenClicks(token: String)
    case byToken(token: String)
    case byTokenClick(token: String)
    case byTokenClicks(token: String)
    case byTokenDeactivate(token: String)
    case byTokenRedirectStatus(token: String)
    case byTokenResolve(token: String)
    case byTokenStats(token: String)
    case checkTokenByToken(token: String)
    case conversationByConversationId(conversationId: String)
    case root
    case stats
    case userMe

    public var path: String {
        switch self {
        case .adminAll: return "/api/v1/tracking-links/admin/all"
        case .adminByTokenClicks(let token): return "/api/v1/tracking-links/admin/\(token)/clicks"
        case .byToken(let token): return "/api/v1/tracking-links/\(token)"
        case .byTokenClick(let token): return "/api/v1/tracking-links/\(token)/click"
        case .byTokenClicks(let token): return "/api/v1/tracking-links/\(token)/clicks"
        case .byTokenDeactivate(let token): return "/api/v1/tracking-links/\(token)/deactivate"
        case .byTokenRedirectStatus(let token): return "/api/v1/tracking-links/\(token)/redirect-status"
        case .byTokenResolve(let token): return "/api/v1/tracking-links/\(token)/resolve"
        case .byTokenStats(let token): return "/api/v1/tracking-links/\(token)/stats"
        case .checkTokenByToken(let token): return "/api/v1/tracking-links/check-token/\(token)"
        case .conversationByConversationId(let conversationId): return "/api/v1/tracking-links/conversation/\(conversationId)"
        case .root: return "/api/v1/tracking-links"
        case .stats: return "/api/v1/tracking-links/stats"
        case .userMe: return "/api/v1/tracking-links/user/me"
        }
    }
}
