import Foundation

// MARK: - Models

/// **D'où vient une suggestion** (#14052) — la passerelle range sa liste dans
/// cet ordre : connaissances, personnes du contexte (intervenants d'un post,
/// membres d'une conversation), contacts de tout cercle, annuaire. Miroir de
/// `MentionSuggestionGroup` (`packages/shared/types/mention.ts`).
public enum MentionSuggestionGroup: String, Codable, Sendable {
    case known
    case context
    case contact
    case directory
}

public struct MentionSuggestion: Codable, Identifiable, Sendable, ProfileDecorWearer {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let badge: String?
    public let inConversation: Bool?
    public let isFriend: Bool?
    /// Le contour d'avatar équipé (#10945), servi avec la personne. Additif et tolérant : absent
    /// (ancien serveur, aucun contour) ⇒ `nil` ; illisible ⇒ aucun contour (`avatarRing == nil`).
    public let profileDecor: ServedProfileDecor?
    /// Le groupe de la suggestion (#14052). Additif et tolérant : absent (passerelle
    /// antérieure) ou inconnu (groupe ajouté plus tard) ⇒ `nil`, jamais un échec de la liste.
    public let group: MentionSuggestionGroup?

    public init(
        id: String,
        username: String,
        displayName: String? = nil,
        avatar: String? = nil,
        badge: String? = nil,
        inConversation: Bool? = nil,
        isFriend: Bool? = nil,
        profileDecor: ServedProfileDecor? = nil,
        group: MentionSuggestionGroup? = nil
    ) {
        self.profileDecor = profileDecor
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.badge = badge
        self.inConversation = inConversation
        self.isFriend = isFriend
        self.group = group
    }

    private enum CodingKeys: String, CodingKey {
        case id, username, displayName, avatar, badge, inConversation, isFriend, profileDecor, group
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        username = try c.decode(String.self, forKey: .username)
        displayName = try c.decodeIfPresent(String.self, forKey: .displayName)
        avatar = try c.decodeIfPresent(String.self, forKey: .avatar)
        badge = try c.decodeIfPresent(String.self, forKey: .badge)
        inConversation = try c.decodeIfPresent(Bool.self, forKey: .inConversation)
        isFriend = try c.decodeIfPresent(Bool.self, forKey: .isFriend)
        profileDecor = try c.decodeIfPresent(ServedProfileDecor.self, forKey: .profileDecor)
        group = (try? c.decodeIfPresent(String.self, forKey: .group))
            .flatMap(MentionSuggestionGroup.init(rawValue:))
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

public final class MentionService: MentionServiceProviding, Sendable {
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
            MentionsEndpoint.suggestions,
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
