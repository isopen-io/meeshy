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

public enum ReactionsEndpoint: MeeshyEndpoint, Sendable {
    case byMessageId(messageId: String)
    case byMessageIdByEmoji(messageId: String, emoji: String)
    case root
    case userByUserId(userId: String)

    public var path: String {
        switch self {
        case .byMessageId(let messageId): return "/api/v1/reactions/\(messageId)"
        case .byMessageIdByEmoji(let messageId, let emoji): return "/api/v1/reactions/\(messageId)/\(emoji)"
        case .root: return "/api/v1/reactions"
        case .userByUserId(let userId): return "/api/v1/reactions/user/\(userId)"
        }
    }
}
