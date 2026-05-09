import Foundation
import MeeshySDK
import XCTest

final class MockPreferenceService: PreferenceServiceProviding {

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

    // MARK: - Protocol Conformance

    nonisolated func getCategories() async throws -> [ConversationCategory] {
        await MainActor.run { getCategoriesCallCount += 1 }
        return try await MainActor.run { try getCategoriesResult.get() }
    }

    nonisolated func getConversationPreferences(conversationId: String) async throws -> APIConversationPreferences {
        await MainActor.run {
            getConversationPreferencesCallCount += 1
            lastGetConversationPreferencesId = conversationId
        }
        return try await MainActor.run { try getConversationPreferencesResult.get() }
    }

    nonisolated func updateConversationPreferences(conversationId: String, request: UpdateConversationPreferencesRequest) async throws {
        await MainActor.run {
            updateConversationPreferencesCallCount += 1
            lastUpdateConversationPreferencesId = conversationId
            lastUpdateConversationPreferencesRequest = request
        }
        try await MainActor.run { try updateConversationPreferencesResult.get() }
    }

    nonisolated func patchCategory(id: String, isExpanded: Bool) async throws {
        await MainActor.run {
            patchCategoryCallCount += 1
            lastPatchCategoryId = id
            lastPatchCategoryIsExpanded = isExpanded
        }
        try await MainActor.run { try patchCategoryResult.get() }
    }

    nonisolated func getAllPreferences() async throws -> UserPreferences {
        await MainActor.run { getAllPreferencesCallCount += 1 }
        return try await MainActor.run { try getAllPreferencesResult.get() }
    }

    nonisolated func patchPreferences<T: Encodable>(category: PreferenceCategory, body: T) async throws {
        await MainActor.run {
            patchPreferencesCallCount += 1
            lastPatchPreferencesCategory = category
        }
        try await MainActor.run { try patchPreferencesResult.get() }
    }

    nonisolated func resetPreferences(category: PreferenceCategory) async throws {
        await MainActor.run {
            resetPreferencesCallCount += 1
            lastResetPreferencesCategory = category
        }
        try await MainActor.run { try resetPreferencesResult.get() }
    }

    nonisolated func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        await MainActor.run {
            createCategoryCallCount += 1
            lastCreateCategoryName = name
            lastCreateCategoryColor = color
            lastCreateCategoryIcon = icon
        }
        return try await MainActor.run { try createCategoryResult.get() }
    }

    nonisolated func getMyConversationTags() async throws -> [String] {
        await MainActor.run { getMyConversationTagsCallCount += 1 }
        return try await MainActor.run { try getMyConversationTagsResult.get() }
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
    }
}
