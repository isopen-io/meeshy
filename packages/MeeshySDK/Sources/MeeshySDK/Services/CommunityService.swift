import Foundation

// MARK: - Protocol

public protocol CommunityServiceProviding: Sendable {
    func list(search: String?, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APICommunity]>
    func search(query: String, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APICommunitySearchResult]>
    func get(communityId: String) async throws -> APICommunity
    func create(name: String, identifier: String?, description: String?, isPrivate: Bool) async throws -> APICommunity
    func update(communityId: String, name: String?, identifier: String?, description: String?, isPrivate: Bool?, avatar: String?, banner: String?) async throws -> APICommunity
    func delete(communityId: String) async throws
    func getMembers(communityId: String, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APICommunityMember]>
    func addMember(communityId: String, userId: String, role: MemberRole) async throws -> APICommunityMember
    func updateMemberRole(communityId: String, memberId: String, role: MemberRole) async throws -> APICommunityMember
    func removeMember(communityId: String, userId: String) async throws
    func join(communityId: String) async throws -> APICommunityMember
    func leave(communityId: String) async throws
    func invite(communityId: String, userId: String) async throws -> APICommunityMember
    func invite(communityId: String, userIds: [String]) async throws
    func checkIdentifier(_ identifier: String) async throws -> IdentifierAvailability
    func getConversations(communityId: String) async throws -> [APIConversation]
    func addConversation(communityId: String, conversationId: String) async throws -> APIConversation
}

public final class CommunityService: CommunityServiceProviding, @unchecked Sendable {
    public static let shared = CommunityService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    // MARK: - List User Communities

    public func list(search: String? = nil, offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APICommunity]> {
        var queryItems = [
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        if let search, !search.isEmpty {
            queryItems.append(URLQueryItem(name: "search", value: search))
        }
        return try await api.request(CommunitiesEndpoint.root, queryItems: queryItems)
    }

    // MARK: - Search Public Communities

    public func search(query: String, offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APICommunitySearchResult]> {
        let queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        return try await api.request(CommunitiesEndpoint.search, queryItems: queryItems)
    }

    // MARK: - Get Community by ID

    public func get(communityId: String) async throws -> APICommunity {
        let response: APIResponse<APICommunity> = try await api.request(CommunitiesEndpoint.byId(id: communityId))
        return response.data
    }

    // MARK: - Create Community

    public func create(name: String, identifier: String? = nil, description: String? = nil, isPrivate: Bool = true) async throws -> APICommunity {
        let body = CreateCommunityRequest(name: name, identifier: identifier, description: description, isPrivate: isPrivate)
        let response: APIResponse<APICommunity> = try await api.post(CommunitiesEndpoint.root, body: body)
        return response.data
    }

    // MARK: - Update Community

    public func update(communityId: String, name: String? = nil, identifier: String? = nil,
                       description: String? = nil, isPrivate: Bool? = nil,
                       avatar: String? = nil, banner: String? = nil) async throws -> APICommunity {
        let body = UpdateCommunityRequest(name: name, identifier: identifier,
                                          description: description, isPrivate: isPrivate,
                                          avatar: avatar, banner: banner)
        let response: APIResponse<APICommunity> = try await api.put(CommunitiesEndpoint.byId(id: communityId), body: body)
        return response.data
    }

    // MARK: - Delete Community

    public func delete(communityId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(CommunitiesEndpoint.byId(id: communityId))
    }

    // MARK: - Get Members

    public func getMembers(communityId: String, offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[APICommunityMember]> {
        let queryItems = [
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        return try await api.request(CommunitiesEndpoint.byIdMembers(id: communityId), queryItems: queryItems)
    }

    // MARK: - Add Member

    public func addMember(communityId: String, userId: String, role: MemberRole = .member) async throws -> APICommunityMember {
        struct AddMemberBody: Encodable {
            let userId: String
            let role: String
        }
        let body = AddMemberBody(userId: userId, role: role.rawValue)
        let response: APIResponse<APICommunityMember> = try await api.post(CommunitiesEndpoint.byIdMembers(id: communityId), body: body)
        return response.data
    }

    // MARK: - Update Member Role

    public func updateMemberRole(communityId: String, memberId: String, role: MemberRole) async throws -> APICommunityMember {
        struct RoleBody: Encodable {
            let role: String
        }
        let body = RoleBody(role: role.rawValue)
        let data = try JSONEncoder().encode(body)
        let response: APIResponse<APICommunityMember> = try await api.request(
            CommunitiesEndpoint.byIdMembersByMemberIdRole(id: communityId, memberId: memberId),
            method: "PATCH",
            body: data
        )
        return response.data
    }

    // MARK: - Remove Member

    public func removeMember(communityId: String, userId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            CommunitiesEndpoint.byIdMembersByMemberId(id: communityId, memberId: userId),
            method: "DELETE"
        )
    }

    // MARK: - Join Community

    public func join(communityId: String) async throws -> APICommunityMember {
        let response: APIResponse<APICommunityMember> = try await api.request(
            CommunitiesEndpoint.byIdJoin(id: communityId),
            method: "POST"
        )
        return response.data
    }

    // MARK: - Leave Community

    public func leave(communityId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            CommunitiesEndpoint.byIdLeave(id: communityId),
            method: "POST"
        )
    }

    // MARK: - Invite User

    public func invite(communityId: String, userId: String) async throws -> APICommunityMember {
        let body = InviteMemberRequest(userId: userId)
        let response: APIResponse<APICommunityMember> = try await api.post(CommunitiesEndpoint.byIdInvite(id: communityId), body: body)
        return response.data
    }

    // MARK: - Invite Multiple Users

    public func invite(communityId: String, userIds: [String]) async throws {
        var failCount = 0
        for userId in userIds {
            do {
                _ = try await invite(communityId: communityId, userId: userId)
            } catch {
                failCount += 1
            }
        }
        if failCount > 0 {
            throw MeeshyError.server(statusCode: 0, message: "Failed to invite \(failCount) user(s)")
        }
    }

    // MARK: - Check Identifier Availability

    public func checkIdentifier(_ identifier: String) async throws -> IdentifierAvailability {
        let response: APIResponse<IdentifierAvailability> = try await api.request(
            CommunitiesEndpoint.checkIdentifierByIdentifier(identifier: identifier)
        )
        return response.data
    }

    // MARK: - Get Community Conversations

    public func getConversations(communityId: String) async throws -> [APIConversation] {
        let response: APIResponse<[APIConversation]> = try await api.request(
            CommunitiesEndpoint.byIdConversations(id: communityId)
        )
        return response.data
    }

    // MARK: - Add Conversation to Community

    public func addConversation(communityId: String, conversationId: String) async throws -> APIConversation {
        let response: APIResponse<APIConversation> = try await api.request(
            CommunitiesEndpoint.byIdConversationsByConversationId(id: communityId, conversationId: conversationId),
            method: "POST"
        )
        return response.data
    }
}
