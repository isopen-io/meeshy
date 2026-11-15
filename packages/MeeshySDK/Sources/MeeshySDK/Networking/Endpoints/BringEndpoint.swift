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

public enum BringEndpoint: MeeshyEndpoint, Sendable {
    case byBringId(bringId: String)
    case byUserId(userId: String)

    public var path: String {
        switch self {
        case .byBringId(let bringId): return "/api/v1/bring/\(bringId)"
        case .byUserId(let userId): return "/api/v1/bring/\(userId)"
        }
    }
}
