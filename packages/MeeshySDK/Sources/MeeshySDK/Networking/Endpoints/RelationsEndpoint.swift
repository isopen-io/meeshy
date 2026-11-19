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

public enum RelationsEndpoint: MeeshyEndpoint, Sendable {
    case battery
    case byUserId(userId: String)
    case byUserIdBattery(userId: String)
    case byUserIdBatteryPull(userId: String)
    case byUserIdBatterySettings(userId: String)
    case byUserIdInactivitySettings(userId: String)
    case byUserIdLevel(userId: String)
    case byUserIdLocationHistory(userId: String)
    case byUserIdLocationRequest(userId: String)
    case byUserIdPhoneCallSettings(userId: String)
    case byUserIdPhoneReachability(userId: String)
    case byUserIdPhoneReachabilitySettings(userId: String)
    case byUserIdRitual(userId: String)
    case byUserIdSettings(userId: String)
    case config
    case inactivity
    case locations
    case locationsMine
    case nowPlaying
    case phoneCalls
    case phoneReachability
    case root
    case summary

    public var path: String {
        switch self {
        case .battery: return "/api/v1/relations/battery"
        case .byUserId(let userId): return "/api/v1/relations/\(userId)"
        case .byUserIdBattery(let userId): return "/api/v1/relations/\(userId)/battery"
        case .byUserIdBatteryPull(let userId): return "/api/v1/relations/\(userId)/battery/pull"
        case .byUserIdBatterySettings(let userId): return "/api/v1/relations/\(userId)/battery/settings"
        case .byUserIdInactivitySettings(let userId): return "/api/v1/relations/\(userId)/inactivity/settings"
        case .byUserIdLevel(let userId): return "/api/v1/relations/\(userId)/level"
        case .byUserIdLocationHistory(let userId): return "/api/v1/relations/\(userId)/location/history"
        case .byUserIdLocationRequest(let userId): return "/api/v1/relations/\(userId)/location/request"
        case .byUserIdPhoneCallSettings(let userId): return "/api/v1/relations/\(userId)/phone-call/settings"
        case .byUserIdPhoneReachability(let userId): return "/api/v1/relations/\(userId)/phone-reachability"
        case .byUserIdPhoneReachabilitySettings(let userId): return "/api/v1/relations/\(userId)/phone-reachability/settings"
        case .byUserIdRitual(let userId): return "/api/v1/relations/\(userId)/ritual"
        case .byUserIdSettings(let userId): return "/api/v1/relations/\(userId)/settings"
        case .config: return "/api/v1/relations/config"
        case .inactivity: return "/api/v1/relations/inactivity"
        case .locations: return "/api/v1/relations/locations"
        case .locationsMine: return "/api/v1/relations/locations/mine"
        case .nowPlaying: return "/api/v1/relations/now-playing"
        case .phoneCalls: return "/api/v1/relations/phone-calls"
        case .phoneReachability: return "/api/v1/relations/phone-reachability"
        case .root: return "/api/v1/relations"
        case .summary: return "/api/v1/relations/summary"
        }
    }
}
