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

public enum AffiliateEndpoint: MeeshyEndpoint, Sendable {
    case clickByToken(token: String)
    case register
    case stats
    case tokens
    case tokensById(id: String)
    case trackVisit
    case validateByToken(token: String)

    public var path: String {
        switch self {
        case .clickByToken(let token): return "/api/v1/affiliate/click/\(token)"
        case .register: return "/api/v1/affiliate/register"
        case .stats: return "/api/v1/affiliate/stats"
        case .tokens: return "/api/v1/affiliate/tokens"
        case .tokensById(let id): return "/api/v1/affiliate/tokens/\(id)"
        case .trackVisit: return "/api/v1/affiliate/track-visit"
        case .validateByToken(let token): return "/api/v1/affiliate/validate/\(token)"
        }
    }
}
