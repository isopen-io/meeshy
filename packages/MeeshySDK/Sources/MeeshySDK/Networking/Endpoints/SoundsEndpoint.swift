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

public enum SoundsEndpoint: MeeshyEndpoint, Sendable {
    case byId(id: String)
    case byIdPosts(id: String)
    case mine

    public var path: String {
        switch self {
        case .byId(let id): return "/api/v1/sounds/\(id)"
        case .byIdPosts(let id): return "/api/v1/sounds/\(id)/posts"
        case .mine: return "/api/v1/sounds/mine"
        }
    }
}
