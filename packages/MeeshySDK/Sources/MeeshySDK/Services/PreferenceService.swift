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

    // MARK: - Cache-first accessors (added 2026-05-11)
    //
    // Each `loadCached…` returns the L2-cached snapshot synchronously (well,
    // through the GRDB actor hop) so the caller can paint UI immediately.
    // `revalidate…` re-fetches the network and persists the fresh result so
    // the next cache load is up-to-date. Callers typically chain them:
    // `if let c = await loadCachedCategories() { … apply … }
    //  let fresh = try await revalidateCategories()`
    // For mutations the caller persists explicitly via `persist…` after the
    // POST/PUT/PATCH succeeds so the optimistic local state survives a
    // subsequent revalidate.
    func loadCachedCategories() async -> [ConversationCategory]?
    func revalidateCategories() async throws -> [ConversationCategory]
    func persistCategories(_ categories: [ConversationCategory]) async

    func loadCachedConversationTags() async -> [String]?
    func revalidateConversationTags() async throws -> [String]
    func persistConversationTags(_ tags: [String]) async

    func loadCachedAllPreferences() async -> UserPreferences?
    func revalidateAllPreferences() async throws -> UserPreferences
    func persistAllPreferences(_ prefs: UserPreferences) async

    func loadCachedConversationPreferences(conversationId: String) async -> APIConversationPreferences?
    func revalidateConversationPreferences(conversationId: String) async throws -> APIConversationPreferences
    func persistConversationPreferences(conversationId: String, prefs: APIConversationPreferences) async
}

// Default no-op implementations so existing PreferenceServiceProviding
// conformers (mocks, alternate implementations) don't have to be updated
// in lock-step. Concrete `PreferenceService` overrides each to actually
// hit the L2 cache via `CacheCoordinator.shared.{categories,userTags,
// userPreferences,conversationPreferences}`.
public extension PreferenceServiceProviding {
    func loadCachedCategories() async -> [ConversationCategory]? { nil }
    func revalidateCategories() async throws -> [ConversationCategory] { try await getCategories() }
    func persistCategories(_ categories: [ConversationCategory]) async {}

    func loadCachedConversationTags() async -> [String]? { nil }
    func revalidateConversationTags() async throws -> [String] { try await getMyConversationTags() }
    func persistConversationTags(_ tags: [String]) async {}

    func loadCachedAllPreferences() async -> UserPreferences? { nil }
    func revalidateAllPreferences() async throws -> UserPreferences { try await getAllPreferences() }
    func persistAllPreferences(_ prefs: UserPreferences) async {}

    func loadCachedConversationPreferences(conversationId: String) async -> APIConversationPreferences? { nil }
    func revalidateConversationPreferences(conversationId: String) async throws -> APIConversationPreferences {
        try await getConversationPreferences(conversationId: conversationId)
    }
    func persistConversationPreferences(conversationId: String, prefs: APIConversationPreferences) async {}
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

    // MARK: - Cache-first overrides

    private static let cacheKey = "list"
    private static let allPrefsKey = "all"

    public func loadCachedCategories() async -> [ConversationCategory]? {
        let result = await CacheCoordinator.shared.categories.load(for: Self.cacheKey)
        switch result {
        case .fresh(let data, _), .stale(let data, _): return data
        case .expired, .empty: return nil
        }
    }

    public func revalidateCategories() async throws -> [ConversationCategory] {
        let fresh = try await getCategories()
        await persistCategories(fresh)
        return fresh
    }

    public func persistCategories(_ categories: [ConversationCategory]) async {
        await CacheCoordinator.shared.categories.save(categories, for: Self.cacheKey)
    }

    public func loadCachedConversationTags() async -> [String]? {
        let result = await CacheCoordinator.shared.userTags.load(for: Self.cacheKey)
        switch result {
        case .fresh(let entries, _), .stale(let entries, _):
            return entries.map(\.name).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
        case .expired, .empty:
            return nil
        }
    }

    public func revalidateConversationTags() async throws -> [String] {
        let fresh = try await getMyConversationTags()
        await persistConversationTags(fresh)
        return fresh
    }

    public func persistConversationTags(_ tags: [String]) async {
        let entries = tags.map { ConversationTagEntry(name: $0) }
        await CacheCoordinator.shared.userTags.save(entries, for: Self.cacheKey)
    }

    public func loadCachedAllPreferences() async -> UserPreferences? {
        let result = await CacheCoordinator.shared.userPreferences.load(for: Self.allPrefsKey)
        switch result {
        case .fresh(let entries, _), .stale(let entries, _):
            return entries.first?.value
        case .expired, .empty:
            return nil
        }
    }

    public func revalidateAllPreferences() async throws -> UserPreferences {
        let fresh = try await getAllPreferences()
        await persistAllPreferences(fresh)
        return fresh
    }

    public func persistAllPreferences(_ prefs: UserPreferences) async {
        let wrapped = PreferenceValue(id: Self.allPrefsKey, value: prefs)
        await CacheCoordinator.shared.userPreferences.save([wrapped], for: Self.allPrefsKey)
    }

    public func loadCachedConversationPreferences(conversationId: String) async -> APIConversationPreferences? {
        let result = await CacheCoordinator.shared.conversationPreferences.load(for: conversationId)
        switch result {
        case .fresh(let entries, _), .stale(let entries, _):
            return entries.first?.value
        case .expired, .empty:
            return nil
        }
    }

    public func revalidateConversationPreferences(conversationId: String) async throws -> APIConversationPreferences {
        let fresh = try await getConversationPreferences(conversationId: conversationId)
        await persistConversationPreferences(conversationId: conversationId, prefs: fresh)
        return fresh
    }

    public func persistConversationPreferences(conversationId: String, prefs: APIConversationPreferences) async {
        let wrapped = PreferenceValue(id: conversationId, value: prefs)
        await CacheCoordinator.shared.conversationPreferences.save([wrapped], for: conversationId)
    }
}
