//
//  CommunityEndpoints.swift
//  Meeshy
//
//  Community API endpoints
//  UPDATED: Uses offset/limit pagination pattern
//

import Foundation

enum CommunityEndpoints: APIEndpoint, Sendable {

    case fetchCommunities
    case getCommunity(id: String)
    case joinCommunity(id: String)
    case leaveCommunity(id: String)
    case getCommunityConversations(communityId: String, offset: Int, limit: Int)

    var path: String {
        switch self {
        case .fetchCommunities:
            return "/api/communities"
        case .getCommunity(let id):
            return "/api/communities/\(id)"
        case .joinCommunity(let id):
            return "/api/communities/\(id)/join"
        case .leaveCommunity(let id):
            return "/api/communities/\(id)/leave"
        case .getCommunityConversations(let communityId, _, _):
            return "/api/communities/\(communityId)/conversations"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .fetchCommunities, .getCommunity, .getCommunityConversations:
            return .get
        case .joinCommunity, .leaveCommunity:
            return .post
        }
    }

    var queryParameters: [String: Any]? {
        switch self {
        case .getCommunityConversations(_, let offset, let limit):
            return ["offset": offset, "limit": limit]
        default:
            return nil
        }
    }

    var body: Encodable? {
        return nil
    }
}
