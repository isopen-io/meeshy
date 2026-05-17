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

    public init(
        id: String,
        username: String,
        displayName: String? = nil,
        avatar: String? = nil,
        badge: String? = nil,
        inConversation: Bool? = nil,
        isFriend: Bool? = nil
    ) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.badge = badge
        self.inConversation = inConversation
        self.isFriend = isFriend
    }
}

// MARK: - Context Type

public enum MentionContextType: String, Sendable {
    case conversation
    case post
}

// MARK: - Protocol

public protocol MentionServiceProviding: AnyObject, Sendable {
    func suggestions(contextId: String, contextType: MentionContextType, query: String) async throws -> [MentionSuggestion]
    @available(*, deprecated, renamed: "suggestions(contextId:contextType:query:)")
    func suggestions(conversationId: String, query: String) async throws -> [MentionSuggestion]
}

// MARK: - Service

public final class MentionService: MentionServiceProviding, @unchecked Sendable {
    public static let shared = MentionService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// Unified suggestion endpoint — supports both conversation and post contexts.
    public func suggestions(contextId: String, contextType: MentionContextType, query: String) async throws -> [MentionSuggestion] {
        var queryItems = [
            URLQueryItem(name: "contextId", value: contextId),
            URLQueryItem(name: "contextType", value: contextType.rawValue)
        ]
        if !query.isEmpty {
            queryItems.append(URLQueryItem(name: "query", value: query))
        }
        let response: APIResponse<[MentionSuggestion]> = try await api.request(
            endpoint: "/mentions/suggestions",
            queryItems: queryItems
        )
        return response.data
    }

    /// Legacy method — passes `conversationId` as the deprecated query param.
    /// Prefer `suggestions(contextId:contextType:query:)` for new call sites.
    @available(*, deprecated, message: "Use suggestions(contextId:contextType:query:) instead")
    public func suggestions(conversationId: String, query: String) async throws -> [MentionSuggestion] {
        try await suggestions(contextId: conversationId, contextType: .conversation, query: query)
    }
}
