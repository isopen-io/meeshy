import Foundation

public final class MessageService {
    public static let shared = MessageService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func list(conversationId: String, offset: Int = 0, limit: Int = 30, includeReplies: Bool = true) async throws -> MessagesAPIResponse {
        try await api.request(
            endpoint: "/conversations/\(conversationId)/messages",
            queryItems: [
                URLQueryItem(name: "limit", value: "\(limit)"),
                URLQueryItem(name: "offset", value: "\(offset)"),
                URLQueryItem(name: "include_replies", value: "\(includeReplies)"),
            ]
        )
    }

    public func listBefore(conversationId: String, before: String, limit: Int = 30, includeReplies: Bool = true) async throws -> MessagesAPIResponse {
        try await api.request(
            endpoint: "/conversations/\(conversationId)/messages",
            queryItems: [
                URLQueryItem(name: "before", value: before),
                URLQueryItem(name: "limit", value: "\(limit)"),
                URLQueryItem(name: "include_replies", value: "\(includeReplies)"),
            ]
        )
    }

    public func listAround(conversationId: String, around: String, limit: Int = 30) async throws -> MessagesAPIResponse {
        try await api.request(
            endpoint: "/conversations/\(conversationId)/messages",
            queryItems: [
                URLQueryItem(name: "around", value: around),
                URLQueryItem(name: "limit", value: "\(limit)"),
            ]
        )
    }

    public func send(conversationId: String, request: SendMessageRequest) async throws -> SendMessageResponseData {
        let response: APIResponse<SendMessageResponseData> = try await api.post(
            endpoint: "/conversations/\(conversationId)/messages", body: request
        )
        return response.data
    }

    public func edit(messageId: String, content: String) async throws -> APIMessage {
        struct EditBody: Encodable { let content: String }
        let response: APIResponse<APIMessage> = try await api.put(endpoint: "/messages/\(messageId)", body: EditBody(content: content))
        return response.data
    }

    public func delete(conversationId: String, messageId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/conversations/\(conversationId)/messages/\(messageId)")
    }

    public func pin(conversationId: String, messageId: String) async throws {
        struct Empty: Encodable {}
        let _: APIResponse<[String: String]> = try await api.put(endpoint: "/conversations/\(conversationId)/messages/\(messageId)/pin", body: Empty())
    }

    public func unpin(conversationId: String, messageId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/conversations/\(conversationId)/messages/\(messageId)/pin")
    }

    public func consumeViewOnce(conversationId: String, messageId: String) async throws -> ConsumeViewOnceResponse {
        struct Empty: Encodable {}
        let response: APIResponse<ConsumeViewOnceResponse> = try await api.post(
            endpoint: "/conversations/\(conversationId)/messages/\(messageId)/consume", body: Empty()
        )
        return response.data
    }

    public func search(conversationId: String, query: String, limit: Int = 20) async throws -> MessagesAPIResponse {
        try await api.request(
            endpoint: "/conversations/\(conversationId)/messages/search",
            queryItems: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "limit", value: "\(limit)"),
            ]
        )
    }

    public func searchWithCursor(conversationId: String, query: String, cursor: String) async throws -> MessagesAPIResponse {
        try await api.request(
            endpoint: "/conversations/\(conversationId)/messages/search",
            queryItems: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "cursor", value: cursor),
            ]
        )
    }
}
