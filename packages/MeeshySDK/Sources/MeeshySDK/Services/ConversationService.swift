import Foundation

// MARK: - Protocol

public protocol ConversationServiceProviding: Sendable {
    func list(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APIConversation]>
    func getById(_ conversationId: String) async throws -> APIConversation
    func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse
    func delete(conversationId: String) async throws
    func markRead(conversationId: String) async throws
    func markUnread(conversationId: String) async throws
    func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]>
    func deleteForMe(conversationId: String) async throws
    func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation]
    func removeParticipant(conversationId: String, participantId: String) async throws
    func updateParticipantRole(conversationId: String, participantId: String, role: String) async throws
}

public final class ConversationService: ConversationServiceProviding, @unchecked Sendable {
    public static let shared = ConversationService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func list(offset: Int = 0, limit: Int = 30) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        try await api.offsetPaginatedRequest(endpoint: "/conversations", offset: offset, limit: limit)
    }

    public func getById(_ conversationId: String) async throws -> APIConversation {
        let response: APIResponse<APIConversation> = try await api.request(
            endpoint: "/conversations/\(conversationId)"
        )
        return response.data
    }

    public func create(type: String, title: String? = nil, participantIds: [String]) async throws -> CreateConversationResponse {
        let body = CreateConversationRequest(type: type, title: title, participantIds: participantIds)
        let response: APIResponse<CreateConversationResponse> = try await api.post(endpoint: "/conversations", body: body)
        return response.data
    }

    public func delete(conversationId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/conversations/\(conversationId)")
    }

    public func markRead(conversationId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/conversations/\(conversationId)/mark-read", method: "POST")
    }

    public func markUnread(conversationId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/conversations/\(conversationId)/mark-unread", method: "POST")
    }

    public func getParticipants(conversationId: String, limit: Int = 100, cursor: String? = nil) async throws -> PaginatedAPIResponse<[APIParticipant]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await api.request(
            endpoint: "/conversations/\(conversationId)/participants",
            queryItems: queryItems
        )
    }

    public func deleteForMe(conversationId: String) async throws {
        let _ = try await api.delete(
            endpoint: "/conversations/\(conversationId)/delete-for-me"
        )
    }

    public func removeParticipant(conversationId: String, participantId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            endpoint: "/conversations/\(conversationId)/participants/\(participantId)",
            method: "DELETE"
        )
    }

    public func updateParticipantRole(conversationId: String, participantId: String, role: String) async throws {
        struct RoleBody: Encodable { let role: String }
        let _: APIResponse<[String: String]> = try await api.patch(
            endpoint: "/conversations/\(conversationId)/participants/\(participantId)/role",
            body: RoleBody(role: role)
        )
    }

    /// Récupère les conversations en commun avec un utilisateur spécifique
    public func listSharedWith(userId: String, limit: Int = 50) async throws -> [APIConversation] {
        let response: APIResponse<[APIConversation]> = try await api.request(
            endpoint: "/conversations",
            queryItems: [
                URLQueryItem(name: "withUserId", value: userId),
                URLQueryItem(name: "limit", value: "\(limit)")
            ]
        )
        return response.data
    }
}
