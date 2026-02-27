import Foundation

public final class PreferenceService {
    public static let shared = PreferenceService()
    private init() {}
    private var api: APIClient { APIClient.shared }

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
