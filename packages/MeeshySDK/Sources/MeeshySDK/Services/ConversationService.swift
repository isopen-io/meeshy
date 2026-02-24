import Foundation

public final class ConversationService {
    public static let shared = ConversationService()
    private init() {}
    private var api: APIClient { APIClient.shared }

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
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/conversations/\(conversationId)/mark-as-read", method: "POST")
    }

    public func markUnread(conversationId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/conversations/\(conversationId)/mark-unread", method: "POST")
    }

    public func getParticipants(conversationId: String, limit: Int = 100) async throws -> [APIConversationMember] {
        let response: APIResponse<[APIConversationMember]> = try await api.request(
            endpoint: "/conversations/\(conversationId)/participants",
            queryItems: [URLQueryItem(name: "limit", value: "\(limit)")]
        )
        return response.data
    }
}
