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

public enum DirectoryEndpoint: MeeshyEndpoint, Sendable {
    case availability
    case blocks
    case blocksByUserId(userId: String)
    case contacts
    case friendRequests
    case friendRequestsById(id: String)
    case people
    case peopleByHandle(handle: String)
    case presence

    public var path: String {
        switch self {
        case .availability: return "/api/v1/directory/availability"
        case .blocks: return "/api/v1/directory/blocks"
        case .blocksByUserId(let userId): return "/api/v1/directory/blocks/\(userId)"
        case .contacts: return "/api/v1/directory/contacts"
        case .friendRequests: return "/api/v1/directory/friend-requests"
        case .friendRequestsById(let id): return "/api/v1/directory/friend-requests/\(id)"
        case .people: return "/api/v1/directory/people"
        case .peopleByHandle(let handle): return "/api/v1/directory/people/\(handle)"
        case .presence: return "/api/v1/directory/presence"
        }
    }
}
