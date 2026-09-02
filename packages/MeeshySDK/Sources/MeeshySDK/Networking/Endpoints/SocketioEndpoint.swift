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

public enum SocketioEndpoint: MeeshyEndpoint, Sendable {
    case disconnectUser
    case stats

    public var path: String {
        switch self {
        case .disconnectUser: return "/api/v1/socketio/disconnect-user"
        case .stats: return "/api/v1/socketio/stats"
        }
    }
}
