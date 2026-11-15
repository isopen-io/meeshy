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

public enum HealthEndpoint: MeeshyEndpoint, Sendable {
    case circuitBreakers
    case metrics
    case ready
    case root

    public var path: String {
        switch self {
        case .circuitBreakers: return "/api/v1/health/circuit-breakers"
        case .metrics: return "/api/v1/health/metrics"
        case .ready: return "/api/v1/health/ready"
        case .root: return "/health"
        }
    }
}
