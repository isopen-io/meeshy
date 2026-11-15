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

public enum LensEndpoint: MeeshyEndpoint, Sendable {
    case credits
    case partnersByPartnerIdLogo(partnerId: String)
    case partnersByUserIdRevoke(userId: String)
    case partnersByUserIdVerify(userId: String)
    case partnersMe
    case partnersPending
    case usageBySlug(slug: String)

    public var path: String {
        switch self {
        case .credits: return "/api/v1/lens/credits"
        case .partnersByPartnerIdLogo(let partnerId): return "/api/v1/lens/partners/\(partnerId)/logo"
        case .partnersByUserIdRevoke(let userId): return "/api/v1/lens/partners/\(userId)/revoke"
        case .partnersByUserIdVerify(let userId): return "/api/v1/lens/partners/\(userId)/verify"
        case .partnersMe: return "/api/v1/lens/partners/me"
        case .partnersPending: return "/api/v1/lens/partners/pending"
        case .usageBySlug(let slug): return "/api/v1/lens/usage/\(slug)"
        }
    }
}
