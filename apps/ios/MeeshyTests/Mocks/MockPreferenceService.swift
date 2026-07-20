import Foundation
import MeeshySDK
import XCTest

final class MockPreferenceService: PreferenceServiceProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var getCategoriesResult: Result<[ConversationCategory], Error> = .success(
        JSONStub.decode("[]")
    )
    var getConversationPreferencesResult: Result<APIConversationPreferences, Error> = .success(
        JSONStub.decode("""
        {"isPinned":null,"isMuted":null,"isArchived":null,"deletedForUserAt":null,"tags":null,"categoryId":null,"reaction":null}
        """)
    )
    var updateConversationPreferencesResult: Result<Void, Error> = .success(())
    var patchCategoryResult: Result<Void, Error> = .success(())
    var getAllPreferencesResult: Result<UserPreferences, Error> = .success(.defaults)
    var patchPreferencesResult: Result<Void, Error> = .success(())
    var resetPreferencesResult: Result<Void, Error> = .success(())
    var createCategoryResult: Result<ConversationCategory, Error> = .success(
        ConversationCategory(id: "new-cat", name: "New", color: nil, icon: nil, order: 0, isExpanded: true)
    )
    var getMyConversationTagsResult: Result<[String], Error> = .success([])

    // MARK: - Call Tracking

    var getCategoriesCallCount = 0

    var getConversationPreferencesCallCount = 0
    var lastGetConversationPreferencesId: String?

    var updateConversationPreferencesCallCount = 0
    var lastUpdateConversationPreferencesId: String?
    var lastUpdateConversationPreferencesRequest: UpdateConversationPreferencesRequest?

    var patchCategoryCallCount = 0
    var lastPatchCategoryId: String?
    var lastPatchCategoryIsExpanded: Bool?

    var getAllPreferencesCallCount = 0

    var patchPreferencesCallCount = 0
    var lastPatchPreferencesCategory: PreferenceCategory?

    var resetPreferencesCallCount = 0
    var lastResetPreferencesCategory: PreferenceCategory?

    var createCategoryCallCount = 0
    var lastCreateCategoryName: String?
    var lastCreateCategoryColor: String?
    var lastCreateCategoryIcon: String?

    var getMyConversationTagsCallCount = 0

    // Cache-first stubs (added 2026-05-11). Default: cache empty so legacy
    // tests keep their network-only behaviour. Set to non-nil in a test to
    // simulate a warm cache.
    var cachedCategoriesStub: [ConversationCategory]?
    var cachedConversationTagsStub: [String]?
    var cachedAllPreferencesStub: UserPreferences?
    var cachedConversationPreferencesStubs: [String: APIConversationPreferences] = [:]

    var loadCachedCategoriesCallCount = 0
    var revalidateCategoriesCallCount = 0
    var persistCategoriesCallCount = 0
    var lastPersistedCategories: [ConversationCategory]?

    var loadCachedConversationTagsCallCount = 0
    var revalidateConversationTagsCallCount = 0
    var persistConversationTagsCallCount = 0
    var lastPersistedConversationTags: [String]?

    var loadCachedAllPreferencesCallCount = 0
    var revalidateAllPreferencesCallCount = 0
    var persistAllPreferencesCallCount = 0
    var lastPersistedAllPreferences: UserPreferences?

    var loadCachedConversationPreferencesCallCount = 0
    var revalidateConversationPreferencesCallCount = 0
    var persistConversationPreferencesCallCount = 0
    var lastPersistedConversationPreferences: (id: String, prefs: APIConversationPreferences)?

    // MARK: - Protocol Conformance

    nonisolated func getCategories() async throws -> [ConversationCategory] {
        await MainActor.run { getCategoriesCallCount += 1 }
        return try getCategoriesResult.get()
    }

    nonisolated func getConversationPreferences(conversationId: String) async throws -> APIConversationPreferences {
        await MainActor.run {
            getConversationPreferencesCallCount += 1
            lastGetConversationPreferencesId = conversationId
        }
        return try getConversationPreferencesResult.get()
    }

    nonisolated func updateConversationPreferences(conversationId: String, request: UpdateConversationPreferencesRequest) async throws {
        await MainActor.run {
            updateConversationPreferencesCallCount += 1
            lastUpdateConversationPreferencesId = conversationId
            lastUpdateConversationPreferencesRequest = request
        }
        try updateConversationPreferencesResult.get()
    }

    nonisolated func patchCategory(id: String, isExpanded: Bool) async throws {
        await MainActor.run {
            patchCategoryCallCount += 1
            lastPatchCategoryId = id
            lastPatchCategoryIsExpanded = isExpanded
        }
        try patchCategoryResult.get()
    }

    nonisolated func getAllPreferences() async throws -> UserPreferences {
        await MainActor.run { getAllPreferencesCallCount += 1 }
        return try getAllPreferencesResult.get()
    }

    nonisolated func patchPreferences<T: Encodable>(category: PreferenceCategory, body: T) async throws {
        await MainActor.run {
            patchPreferencesCallCount += 1
            lastPatchPreferencesCategory = category
        }
        try patchPreferencesResult.get()
    }

    nonisolated func resetPreferences(category: PreferenceCategory) async throws {
        await MainActor.run {
            resetPreferencesCallCount += 1
            lastResetPreferencesCategory = category
        }
        try resetPreferencesResult.get()
    }

    nonisolated func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        await MainActor.run {
            createCategoryCallCount += 1
            lastCreateCategoryName = name
            lastCreateCategoryColor = color
            lastCreateCategoryIcon = icon
        }
        return try createCategoryResult.get()
    }

    nonisolated func getMyConversationTags() async throws -> [String] {
        await MainActor.run { getMyConversationTagsCallCount += 1 }
        return try getMyConversationTagsResult.get()
    }

    // MARK: - Cache-first overrides

    nonisolated func loadCachedCategories() async -> [ConversationCategory]? {
        await MainActor.run {
            loadCachedCategoriesCallCount += 1
            return cachedCategoriesStub
        }
    }

    nonisolated func revalidateCategories() async throws -> [ConversationCategory] {
        await MainActor.run { revalidateCategoriesCallCount += 1 }
        let fresh = try await getCategories()
        await persistCategories(fresh)
        return fresh
    }

    nonisolated func persistCategories(_ categories: [ConversationCategory]) async {
        await MainActor.run {
            persistCategoriesCallCount += 1
            lastPersistedCategories = categories
            cachedCategoriesStub = categories
        }
    }

    nonisolated func loadCachedConversationTags() async -> [String]? {
        await MainActor.run {
            loadCachedConversationTagsCallCount += 1
            return cachedConversationTagsStub
        }
    }

    nonisolated func revalidateConversationTags() async throws -> [String] {
        await MainActor.run { revalidateConversationTagsCallCount += 1 }
        let fresh = try await getMyConversationTags()
        await persistConversationTags(fresh)
        return fresh
    }

    nonisolated func persistConversationTags(_ tags: [String]) async {
        await MainActor.run {
            persistConversationTagsCallCount += 1
            lastPersistedConversationTags = tags
            cachedConversationTagsStub = tags
        }
    }

    nonisolated func loadCachedAllPreferences() async -> UserPreferences? {
        await MainActor.run {
            loadCachedAllPreferencesCallCount += 1
            return cachedAllPreferencesStub
        }
    }

    nonisolated func revalidateAllPreferences() async throws -> UserPreferences {
        await MainActor.run { revalidateAllPreferencesCallCount += 1 }
        let fresh = try await getAllPreferences()
        await persistAllPreferences(fresh)
        return fresh
    }

    nonisolated func persistAllPreferences(_ prefs: UserPreferences) async {
        await MainActor.run {
            persistAllPreferencesCallCount += 1
            lastPersistedAllPreferences = prefs
            cachedAllPreferencesStub = prefs
        }
    }

    nonisolated func loadCachedConversationPreferences(conversationId: String) async -> APIConversationPreferences? {
        await MainActor.run {
            loadCachedConversationPreferencesCallCount += 1
            return cachedConversationPreferencesStubs[conversationId]
        }
    }

    nonisolated func revalidateConversationPreferences(conversationId: String) async throws -> APIConversationPreferences {
        await MainActor.run { revalidateConversationPreferencesCallCount += 1 }
        let fresh = try await getConversationPreferences(conversationId: conversationId)
        await persistConversationPreferences(conversationId: conversationId, prefs: fresh)
        return fresh
    }

    nonisolated func persistConversationPreferences(conversationId: String, prefs: APIConversationPreferences) async {
        await MainActor.run {
            persistConversationPreferencesCallCount += 1
            lastPersistedConversationPreferences = (conversationId, prefs)
            cachedConversationPreferencesStubs[conversationId] = prefs
        }
    }

    // MARK: - Reset

    func reset() {
        getCategoriesCallCount = 0
        getConversationPreferencesCallCount = 0
        lastGetConversationPreferencesId = nil
        updateConversationPreferencesCallCount = 0
        lastUpdateConversationPreferencesId = nil
        lastUpdateConversationPreferencesRequest = nil
        patchCategoryCallCount = 0
        lastPatchCategoryId = nil
        lastPatchCategoryIsExpanded = nil
        getAllPreferencesCallCount = 0
        patchPreferencesCallCount = 0
        lastPatchPreferencesCategory = nil
        resetPreferencesCallCount = 0
        lastResetPreferencesCategory = nil
        createCategoryCallCount = 0
        lastCreateCategoryName = nil
        lastCreateCategoryColor = nil
        lastCreateCategoryIcon = nil
        getMyConversationTagsCallCount = 0

        cachedCategoriesStub = nil
        cachedConversationTagsStub = nil
        cachedAllPreferencesStub = nil
        cachedConversationPreferencesStubs = [:]
        loadCachedCategoriesCallCount = 0
        revalidateCategoriesCallCount = 0
        persistCategoriesCallCount = 0
        lastPersistedCategories = nil
        loadCachedConversationTagsCallCount = 0
        revalidateConversationTagsCallCount = 0
        persistConversationTagsCallCount = 0
        lastPersistedConversationTags = nil
        loadCachedAllPreferencesCallCount = 0
        revalidateAllPreferencesCallCount = 0
        persistAllPreferencesCallCount = 0
        lastPersistedAllPreferences = nil
        loadCachedConversationPreferencesCallCount = 0
        revalidateConversationPreferencesCallCount = 0
        persistConversationPreferencesCallCount = 0
        lastPersistedConversationPreferences = nil
    }
}
