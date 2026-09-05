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

public enum SignalEndpoint: MeeshyEndpoint, Sendable {
    case keys
    case keysByUserId(userId: String)
    case sessionEstablish

    public var path: String {
        switch self {
        case .keys: return "/api/v1/signal/keys"
        case .keysByUserId(let userId): return "/api/v1/signal/keys/\(userId)"
        case .sessionEstablish: return "/api/v1/signal/session/establish"
        }
    }
}
