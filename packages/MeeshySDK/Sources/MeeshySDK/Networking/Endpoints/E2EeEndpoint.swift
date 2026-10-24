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

public enum E2EeEndpoint: MeeshyEndpoint, Sendable {
    case devices
    case devicesByDeviceId(deviceId: String)
    case devicesByDeviceIdKeys(deviceId: String)
    case devicesSelfPrekeyCount
    case envelopes
    case envelopesAck
    case keysByUserId(userId: String)
    case keysByUserIdDevices(userId: String)

    public var path: String {
        switch self {
        case .devices: return "/api/v1/e2ee/devices"
        case .devicesByDeviceId(let deviceId): return "/api/v1/e2ee/devices/\(deviceId)"
        case .devicesByDeviceIdKeys(let deviceId): return "/api/v1/e2ee/devices/\(deviceId)/keys"
        case .devicesSelfPrekeyCount: return "/api/v1/e2ee/devices/self/prekey-count"
        case .envelopes: return "/api/v1/e2ee/envelopes"
        case .envelopesAck: return "/api/v1/e2ee/envelopes/ack"
        case .keysByUserId(let userId): return "/api/v1/e2ee/keys/\(userId)"
        case .keysByUserIdDevices(let userId): return "/api/v1/e2ee/keys/\(userId)/devices"
        }
    }
}
