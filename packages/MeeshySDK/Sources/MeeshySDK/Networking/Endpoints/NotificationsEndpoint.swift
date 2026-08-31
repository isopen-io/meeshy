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

public enum NotificationsEndpoint: MeeshyEndpoint, Sendable {
    case adminClearAll
    case byId(id: String)
    case byIdRead(id: String)
    case conversationByConversationIdRead(conversationId: String)
    case counts
    case postByPostIdRead(postId: String)
    case read
    case readAll
    case readByTypes
    case root
    case unreadCount

    public var path: String {
        switch self {
        case .adminClearAll: return "/api/v1/notifications/admin/clear-all"
        case .byId(let id): return "/api/v1/notifications/\(id)"
        case .byIdRead(let id): return "/api/v1/notifications/\(id)/read"
        case .conversationByConversationIdRead(let conversationId): return "/api/v1/notifications/conversation/\(conversationId)/read"
        case .counts: return "/api/v1/notifications/counts"
        case .postByPostIdRead(let postId): return "/api/v1/notifications/post/\(postId)/read"
        case .read: return "/api/v1/notifications/read"
        case .readAll: return "/api/v1/notifications/read-all"
        case .readByTypes: return "/api/v1/notifications/read-by-types"
        case .root: return "/api/v1/notifications"
        case .unreadCount: return "/api/v1/notifications/unread-count"
        }
    }
}
