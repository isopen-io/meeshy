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

public enum MessagesEndpoint: MeeshyEndpoint, Sendable {
    case byMessageId(messageId: String)
    case byMessageIdReadStatus(messageId: String)
    case byMessageIdStatusDetails(messageId: String)
    case byMessageIdTranslations(messageId: String)

    public var path: String {
        switch self {
        case .byMessageId(let messageId): return "/api/v1/messages/\(messageId)"
        case .byMessageIdReadStatus(let messageId): return "/api/v1/messages/\(messageId)/read-status"
        case .byMessageIdStatusDetails(let messageId): return "/api/v1/messages/\(messageId)/status-details"
        case .byMessageIdTranslations(let messageId): return "/api/v1/messages/\(messageId)/translations"
        }
    }
}
