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

public enum ApiLegacyMessagesEndpoint: MeeshyEndpoint, Sendable {
    case bulkDeleteForMe
    case byMessageIdDeleteForMe(messageId: String)
    case byMessageIdRestoreForMe(messageId: String)

    public var path: String {
        switch self {
        case .bulkDeleteForMe: return "/api/messages/bulk/delete-for-me"
        case .byMessageIdDeleteForMe(let messageId): return "/api/messages/\(messageId)/delete-for-me"
        case .byMessageIdRestoreForMe(let messageId): return "/api/messages/\(messageId)/restore-for-me"
        }
    }
}
