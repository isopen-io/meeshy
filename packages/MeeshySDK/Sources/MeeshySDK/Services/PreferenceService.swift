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
}
