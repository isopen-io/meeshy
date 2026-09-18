import Foundation

// MARK: - Default service adapters
//
// Bridge the lean `ConversationPreferenceWriting` /
// `ConversationLifecycleWriting` protocols onto the existing
// PreferenceService / ConversationService shared singletons.
// Tests inject their own mocks via the init that takes both protocols.

struct DefaultPreferenceWritingAdapter: ConversationPreferenceWriting {
    func updateConversationPreferences(
        conversationId: String,
        request: UpdateConversationPreferencesRequest
    ) async throws -> APIConversationPreferences {
        // The legacy PreferenceService.updateConversationPreferences
        // returns Void; Phase 4 needs the new prefs (with `version`) to
        // close the loop. Re-fetch the prefs after the write until the
        // service interface gets the unified update-and-return shape in
        // a follow-up.
        try await PreferenceService.shared.updateConversationPreferences(
            conversationId: conversationId,
            request: request
        )
        return try await PreferenceService.shared.getConversationPreferences(
            conversationId: conversationId
        )
    }

    func reorderConversations(_ updates: [(convId: String, orderInCategory: Int)]) async throws {
        try await PreferenceService.shared.reorderConversations(
            updates.map { (conversationId: $0.convId, orderInCategory: $0.orderInCategory) }
        )
    }
}

public struct DefaultCacheReadingAdapter: ConversationCacheReading {
    public init() {}
    public func loadConversationList() async -> CacheResult<[MeeshyConversation]> {
        await CacheCoordinator.shared.conversations.load(for: "list")
    }
}

struct DefaultConversationLifecycleAdapter: ConversationLifecycleWriting {
    func markRead(conversationId: String) async throws {
        try await ConversationService.shared.markRead(conversationId: conversationId)
    }
    func markUnread(conversationId: String) async throws {
        try await ConversationService.shared.markUnread(conversationId: conversationId)
    }
    func deleteForMe(conversationId: String) async throws {
        try await ConversationService.shared.deleteForMe(conversationId: conversationId)
    }
    func leave(conversationId: String) async throws {
        try await ConversationService.shared.leave(conversationId: conversationId)
    }
}

public struct DefaultCategoryCreatingAdapter: ConversationCategoryCreating {
    public init() {}
    public func create(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        try await UserCategoryStore.shared.create(name: name, color: color, icon: icon)
    }
}
