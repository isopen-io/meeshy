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
    case bulkDeleteForMe
    case byMessageId(messageId: String)
    case byMessageIdDeleteForMe(messageId: String)
    case byMessageIdReadStatus(messageId: String)
    case byMessageIdRestoreForMe(messageId: String)
    case byMessageIdStatusDetails(messageId: String)
    case byMessageIdTranslations(messageId: String)

    public var path: String {
        switch self {
        case .bulkDeleteForMe: return "/api/v1/messages/bulk/delete-for-me"
        case .byMessageId(let messageId): return "/api/v1/messages/\(messageId)"
        case .byMessageIdDeleteForMe(let messageId): return "/api/v1/messages/\(messageId)/delete-for-me"
        case .byMessageIdReadStatus(let messageId): return "/api/v1/messages/\(messageId)/read-status"
        case .byMessageIdRestoreForMe(let messageId): return "/api/v1/messages/\(messageId)/restore-for-me"
        case .byMessageIdStatusDetails(let messageId): return "/api/v1/messages/\(messageId)/status-details"
        case .byMessageIdTranslations(let messageId): return "/api/v1/messages/\(messageId)/translations"
        }
    }
}
