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

public enum RelationsEndpoint: MeeshyEndpoint, Sendable {
    case byUserId(userId: String)
    case byUserIdLevel(userId: String)
    case byUserIdRitual(userId: String)
    case config
    case root

    public var path: String {
        switch self {
        case .byUserId(let userId): return "/api/v1/relations/\(userId)"
        case .byUserIdLevel(let userId): return "/api/v1/relations/\(userId)/level"
        case .byUserIdRitual(let userId): return "/api/v1/relations/\(userId)/ritual"
        case .config: return "/api/v1/relations/config"
        case .root: return "/api/v1/relations"
        }
    }
}
