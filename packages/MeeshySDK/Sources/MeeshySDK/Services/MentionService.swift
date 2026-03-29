import Foundation

// MARK: - Models

public struct MentionSuggestion: Codable, Identifiable, Sendable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let badge: String?
    public let inConversation: Bool?
    public let isFriend: Bool?
}

// MARK: - Protocol

public protocol MentionServiceProviding: AnyObject, Sendable {
    func suggestions(conversationId: String, query: String) async throws -> [MentionSuggestion]
}

// MARK: - Service

public final class MentionService: MentionServiceProviding, @unchecked Sendable {
    public static let shared = MentionService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func suggestions(conversationId: String, query: String) async throws -> [MentionSuggestion] {
        var queryItems = [URLQueryItem(name: "conversationId", value: conversationId)]
        if !query.isEmpty {
            queryItems.append(URLQueryItem(name: "query", value: query))
        }
        let response: APIResponse<[MentionSuggestion]> = try await api.request(
            endpoint: "/mentions/suggestions",
            queryItems: queryItems
        )
        return response.data
    }
}
