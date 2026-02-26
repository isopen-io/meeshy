import Foundation

public final class CommunityService {
    public static let shared = CommunityService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    // MARK: - List User Communities

    public func list(search: String? = nil, offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APICommunity]> {
        var queryItems = [
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        if let search, !search.isEmpty {
            queryItems.append(URLQueryItem(name: "search", value: search))
        }
        return try await api.request(endpoint: "/communities", queryItems: queryItems)
    }

    // MARK: - Search Public Communities

    public func search(query: String, offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APICommunitySearchResult]> {
        let queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        return try await api.request(endpoint: "/communities/search", queryItems: queryItems)
    }

    // MARK: - Get Community by ID

    public func get(communityId: String) async throws -> APICommunity {
        let response: APIResponse<APICommunity> = try await api.request(endpoint: "/communities/\(communityId)")
        return response.data
    }

    // MARK: - Create Community

    public func create(name: String, identifier: String? = nil, description: String? = nil, isPrivate: Bool = true) async throws -> APICommunity {
        let body = CreateCommunityRequest(name: name, identifier: identifier, description: description, isPrivate: isPrivate)
        let response: APIResponse<APICommunity> = try await api.post(endpoint: "/communities", body: body)
        return response.data
    }

    // MARK: - Update Community

    public func update(communityId: String, name: String? = nil, identifier: String? = nil,
                       description: String? = nil, isPrivate: Bool? = nil,
                       avatar: String? = nil, banner: String? = nil) async throws -> APICommunity {
        let body = UpdateCommunityRequest(name: name, identifier: identifier,
                                          description: description, isPrivate: isPrivate,
                                          avatar: avatar, banner: banner)
        let response: APIResponse<APICommunity> = try await api.put(endpoint: "/communities/\(communityId)", body: body)
        return response.data
    }

    // MARK: - Delete Community

    public func delete(communityId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/communities/\(communityId)")
    }

    // MARK: - Get Members

    public func getMembers(communityId: String, offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APICommunityMember]> {
        let queryItems = [
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        return try await api.request(endpoint: "/communities/\(communityId)/members", queryItems: queryItems)
    }

    // MARK: - Add Member

    public func addMember(communityId: String, userId: String, role: CommunityRole = .member) async throws -> APICommunityMember {
        struct AddMemberBody: Encodable {
            let userId: String
            let role: String
        }
        let body = AddMemberBody(userId: userId, role: role.rawValue)
        let response: APIResponse<APICommunityMember> = try await api.post(endpoint: "/communities/\(communityId)/members", body: body)
        return response.data
    }

    // MARK: - Update Member Role

    public func updateMemberRole(communityId: String, memberId: String, role: CommunityRole) async throws -> APICommunityMember {
        struct RoleBody: Encodable {
            let role: String
        }
        let body = RoleBody(role: role.rawValue)
        let data = try JSONEncoder().encode(body)
        let response: APIResponse<APICommunityMember> = try await api.request(
            endpoint: "/communities/\(communityId)/members/\(memberId)/role",
            method: "PATCH",
            body: data
        )
        return response.data
    }

    // MARK: - Remove Member

    public func removeMember(communityId: String, userId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            endpoint: "/communities/\(communityId)/members/\(userId)",
            method: "DELETE"
        )
    }

    // MARK: - Join Community

    public func join(communityId: String) async throws -> APICommunityMember {
        let response: APIResponse<APICommunityMember> = try await api.request(
            endpoint: "/communities/\(communityId)/join",
            method: "POST"
        )
        return response.data
    }

    // MARK: - Leave Community

    public func leave(communityId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            endpoint: "/communities/\(communityId)/leave",
            method: "POST"
        )
    }

    // MARK: - Invite User

    public func invite(communityId: String, userId: String) async throws -> APICommunityMember {
        let body = InviteMemberRequest(userId: userId)
        let response: APIResponse<APICommunityMember> = try await api.post(endpoint: "/communities/\(communityId)/invite", body: body)
        return response.data
    }

    // MARK: - Check Identifier Availability

    public func checkIdentifier(_ identifier: String) async throws -> IdentifierAvailability {
        let response: APIResponse<IdentifierAvailability> = try await api.request(
            endpoint: "/communities/check-identifier/\(identifier)"
        )
        return response.data
    }

    // MARK: - Get Community Conversations

    public func getConversations(communityId: String) async throws -> [APIConversation] {
        let response: APIResponse<[APIConversation]> = try await api.request(
            endpoint: "/communities/\(communityId)/conversations"
        )
        return response.data
    }

    // MARK: - Add Conversation to Community

    public func addConversation(communityId: String, conversationId: String) async throws -> APIConversation {
        let response: APIResponse<APIConversation> = try await api.request(
            endpoint: "/communities/\(communityId)/conversations/\(conversationId)",
            method: "POST"
        )
        return response.data
    }
}
