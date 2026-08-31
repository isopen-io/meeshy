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

public enum LinksEndpoint: MeeshyEndpoint, Sendable {
    case byIdentifier(identifier: String)
    case byIdentifierMessages(identifier: String)
    case byKeyMembers(key: String)
    case byLinkId(linkId: String)
    case byLinkIdExtend(linkId: String)
    case byLinkIdToggle(linkId: String)
    case checkIdentifierByIdentifier(identifier: String)
    case myLinks
    case root
    case stats

    public var path: String {
        switch self {
        case .byIdentifier(let identifier): return "/api/v1/links/\(identifier)"
        case .byIdentifierMessages(let identifier): return "/api/v1/links/\(identifier)/messages"
        case .byKeyMembers(let key): return "/api/v1/links/\(key)/members"
        case .byLinkId(let linkId): return "/api/v1/links/\(linkId)"
        case .byLinkIdExtend(let linkId): return "/api/v1/links/\(linkId)/extend"
        case .byLinkIdToggle(let linkId): return "/api/v1/links/\(linkId)/toggle"
        case .checkIdentifierByIdentifier(let identifier): return "/api/v1/links/check-identifier/\(identifier)"
        case .myLinks: return "/api/v1/links/my-links"
        case .root: return "/api/v1/links"
        case .stats: return "/api/v1/links/stats"
        }
    }
}
