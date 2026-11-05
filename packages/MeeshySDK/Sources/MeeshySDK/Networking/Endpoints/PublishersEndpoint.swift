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

public enum PublishersEndpoint: MeeshyEndpoint, Sendable {
    case admin
    case bySlug(slug: String)
    case me

    public var path: String {
        switch self {
        case .admin: return "/api/v1/publishers/admin"
        case .bySlug(let slug): return "/api/v1/publishers/\(slug)"
        case .me: return "/api/v1/publishers/me"
        }
    }
}
