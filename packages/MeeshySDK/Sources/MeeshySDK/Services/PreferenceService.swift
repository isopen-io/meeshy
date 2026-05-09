import Foundation

// MARK: - Protocol

public protocol PreferenceServiceProviding: Sendable {
    func getCategories() async throws -> [ConversationCategory]
    func getConversationPreferences(conversationId: String) async throws -> APIConversationPreferences
    func updateConversationPreferences(conversationId: String, request: UpdateConversationPreferencesRequest) async throws
    func patchCategory(id: String, isExpanded: Bool) async throws
    func getAllPreferences() async throws -> UserPreferences
    func patchPreferences<T: Encodable>(category: PreferenceCategory, body: T) async throws
    func resetPreferences(category: PreferenceCategory) async throws
    func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory
    func getMyConversationTags() async throws -> [String]
}

public final class PreferenceService: PreferenceServiceProviding, @unchecked Sendable {
    public static let shared = PreferenceService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func getCategories() async throws -> [ConversationCategory] {
        let response: APIResponse<[ConversationCategory]> = try await api.request(endpoint: "/me/preferences/categories")
        return response.data
    }

    public func getConversationPreferences(conversationId: String) async throws -> APIConversationPreferences {
        let response: APIResponse<APIConversationPreferences> = try await api.request(
            endpoint: "/user-preferences/conversations/\(conversationId)"
        )
        return response.data
    }

    public func updateConversationPreferences(conversationId: String, request: UpdateConversationPreferencesRequest) async throws {
        let _: APIResponse<[String: String]> = try await api.put(
            endpoint: "/user-preferences/conversations/\(conversationId)", body: request
        )
    }

    public func patchCategory(id: String, isExpanded: Bool) async throws {
        let body = ["isExpanded": isExpanded]
        let _: APIResponse<[String: String]> = try await api.patch(
            endpoint: "/me/preferences/categories/\(id)", body: body
        )
    }

    // MARK: - User Preferences (all categories)

    public func getAllPreferences() async throws -> UserPreferences {
        let response: APIResponse<UserPreferences> = try await api.request(endpoint: "/me/preferences")
        return response.data
    }

    public func patchPreferences<T: Encodable>(category: PreferenceCategory, body: T) async throws {
        let _: APIResponse<[String: String]> = try await api.patch(
            endpoint: "/me/preferences/\(category.rawValue)", body: body
        )
    }

    public func resetPreferences(category: PreferenceCategory) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            endpoint: "/me/preferences/\(category.rawValue)"
        )
    }

    // MARK: - Category Creation

    public func createCategory(name: String, color: String? = nil, icon: String? = nil) async throws -> ConversationCategory {
        struct Body: Encodable {
            let name: String
            let color: String?
            let icon: String?
        }
        let response: APIResponse<ConversationCategory> = try await api.post(
            endpoint: "/me/preferences/categories",
            body: Body(name: name, color: color, icon: icon)
        )
        return response.data
    }

    // MARK: - User Conversation Tags
    //
    // No dedicated server endpoint exists for tag aggregation (see webapp's
    // ConversationPreferencesStore which does the same client-side). We pull
    // the user's first page of conversation preferences (limit=200, generous
    // for UX-driven autocomplete) and extract the distinct, sorted tags.
    public func getMyConversationTags() async throws -> [String] {
        let response: APIResponse<[APIConversationPreferences]> = try await api.request(
            endpoint: "/user-preferences/conversations",
            queryItems: [
                URLQueryItem(name: "offset", value: "0"),
                URLQueryItem(name: "limit", value: "200")
            ]
        )
        var set = Set<String>()
        for prefs in response.data {
            for tag in prefs.tags ?? [] {
                let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { set.insert(trimmed) }
            }
        }
        return set.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }
}
