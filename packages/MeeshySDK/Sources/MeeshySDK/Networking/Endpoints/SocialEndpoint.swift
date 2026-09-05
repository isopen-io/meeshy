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

public enum SocialEndpoint: MeeshyEndpoint, Sendable {
    case events
    case posts

    public var path: String {
        switch self {
        case .events: return "/api/v1/social/events"
        case .posts: return "/api/v1/social/posts"
        }
    }
}
