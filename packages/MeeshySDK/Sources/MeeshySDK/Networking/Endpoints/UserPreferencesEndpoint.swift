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

public enum UserPreferencesEndpoint: MeeshyEndpoint, Sendable {
    case communities
    case communitiesByCommunityId(communityId: String)
    case communitiesReorder
    case conversations
    case conversationsByConversationId(conversationId: String)
    case reorder

    public var path: String {
        switch self {
        case .communities: return "/api/v1/user-preferences/communities"
        case .communitiesByCommunityId(let communityId): return "/api/v1/user-preferences/communities/\(communityId)"
        case .communitiesReorder: return "/api/v1/user-preferences/communities/reorder"
        case .conversations: return "/api/v1/user-preferences/conversations"
        case .conversationsByConversationId(let conversationId): return "/api/v1/user-preferences/conversations/\(conversationId)"
        case .reorder: return "/api/v1/user-preferences/reorder"
        }
    }
}
