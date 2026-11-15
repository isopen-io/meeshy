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

public enum AnonymousEndpoint: MeeshyEndpoint, Sendable {
    case joinByLinkId(linkId: String)
    case leave
    case linkByIdentifier(identifier: String)
    case refresh

    public var path: String {
        switch self {
        case .joinByLinkId(let linkId): return "/api/v1/anonymous/join/\(linkId)"
        case .leave: return "/api/v1/anonymous/leave"
        case .linkByIdentifier(let identifier): return "/api/v1/anonymous/link/\(identifier)"
        case .refresh: return "/api/v1/anonymous/refresh"
        }
    }
}
