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

public enum ApiLegacyConversationsEndpoint: MeeshyEndpoint, Sendable {
    case byConversationIdClearHistory(conversationId: String)
    case byConversationIdDeleteForMe(conversationId: String)
    case byConversationIdRestoreForMe(conversationId: String)

    public var path: String {
        switch self {
        case .byConversationIdClearHistory(let conversationId): return "/api/conversations/\(conversationId)/clear-history"
        case .byConversationIdDeleteForMe(let conversationId): return "/api/conversations/\(conversationId)/delete-for-me"
        case .byConversationIdRestoreForMe(let conversationId): return "/api/conversations/\(conversationId)/restore-for-me"
        }
    }
}
