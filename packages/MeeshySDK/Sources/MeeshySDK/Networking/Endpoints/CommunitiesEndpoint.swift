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

public enum CommunitiesEndpoint: MeeshyEndpoint, Sendable {
    case byId(id: String)
    case byIdConversations(id: String)
    case byIdConversationsByConversationId(id: String, conversationId: String)
    case byIdInvite(id: String)
    case byIdJoin(id: String)
    case byIdLeave(id: String)
    case byIdMembers(id: String)
    case byIdMembersByMemberId(id: String, memberId: String)
    case byIdMembersByMemberIdRole(id: String, memberId: String)
    case checkIdentifierByIdentifier(identifier: String)
    case mine
    case root
    case search

    public var path: String {
        switch self {
        case .byId(let id): return "/api/v1/communities/\(id)"
        case .byIdConversations(let id): return "/api/v1/communities/\(id)/conversations"
        case .byIdConversationsByConversationId(let id, let conversationId): return "/api/v1/communities/\(id)/conversations/\(conversationId)"
        case .byIdInvite(let id): return "/api/v1/communities/\(id)/invite"
        case .byIdJoin(let id): return "/api/v1/communities/\(id)/join"
        case .byIdLeave(let id): return "/api/v1/communities/\(id)/leave"
        case .byIdMembers(let id): return "/api/v1/communities/\(id)/members"
        case .byIdMembersByMemberId(let id, let memberId): return "/api/v1/communities/\(id)/members/\(memberId)"
        case .byIdMembersByMemberIdRole(let id, let memberId): return "/api/v1/communities/\(id)/members/\(memberId)/role"
        case .checkIdentifierByIdentifier(let identifier): return "/api/v1/communities/check-identifier/\(identifier)"
        case .mine: return "/api/v1/communities/mine"
        case .root: return "/api/v1/communities"
        case .search: return "/api/v1/communities/search"
        }
    }
}
