import Foundation
import Combine

// MARK: - Service protocols (testable seams)

/// Subset of `PreferenceServiceProviding` that `ConversationStore` needs.
/// Declared separately so tests can mock just these methods without
/// implementing the full PreferenceService surface.
public protocol ConversationPreferenceWriting: Sendable {
    /// Apply a partial update. Returns the server's authoritative state
    /// (including the new `version`) so the Store can replace its
    /// optimistic candidate.
    func updateConversationPreferences(
        conversationId: String,
        request: UpdateConversationPreferencesRequest
    ) async throws -> APIConversationPreferences

    /// Batch reorder (`POST /user-preferences/reorder`). Used by
    /// the Store's `reorderConversations` composite (drag-to-reorder).
    func reorderConversations(_ updates: [(convId: String, orderInCategory: Int)]) async throws
}

/// Read seam for cache hydration (`hydrateFromCache`). Default adapter reads
/// the cached conversation list (`CacheCoordinator.conversations`, key "list");
/// tests stub a `CacheResult` directly.
public protocol ConversationCacheReading: Sendable {
    func loadConversationList() async -> CacheResult<[MeeshyConversation]>
}

/// Subset of `ConversationServiceProviding` used by the Store.
public protocol ConversationLifecycleWriting: Sendable {
    func markRead(conversationId: String) async throws
    func markUnread(conversationId: String) async throws
    func deleteForMe(conversationId: String) async throws
    func leave(conversationId: String) async throws
}

/// Category-creation seam used by the Store's `createSectionAndAssign`
/// composite helper. Default adapter forwards to `UserCategoryStore.shared`;
/// tests inject a mock so the composite can be verified without I/O.
public protocol ConversationCategoryCreating: Sendable {
    func create(name: String, color: String?, icon: String?) async throws -> ConversationCategory
}

// MARK: - Subject registry (Combine bridge)

/// Combine `CurrentValueSubject`s aren't actor-safe to *create* lazily
/// from inside an actor (would require `Task { await … }` indirection).
/// This `@unchecked Sendable` registry wraps a lock so the actor can
/// hand out subjects synchronously to UI code calling `publisher(for:)`
/// from the main thread.
// unchecked: registre sous `perConv` (Locked) ; `CurrentValueSubject` n'est pas Sendable.
final class ConversationStoreSubjects: @unchecked Sendable {
    private let perConv = Locked(uncheckedState: [String: CurrentValueSubject<MeeshyConversation, Never>]())
    let list = CurrentValueSubject<[MeeshyConversation], Never>([])

    func subject(for id: String, initial: () -> MeeshyConversation?) -> CurrentValueSubject<MeeshyConversation, Never>? {
        perConv.mutateUnchecked { subjects in
            if let existing = subjects[id] { return existing }
            guard let value = initial() else { return nil }
            let created = CurrentValueSubject<MeeshyConversation, Never>(value)
            subjects[id] = created
            return created
        }
    }

    func send(_ conv: MeeshyConversation) {
        perConv.mutateUnchecked { $0[conv.id]?.send(conv) }
    }

    func remove(_ id: String) {
        perConv.mutateUnchecked { _ = $0.removeValue(forKey: id) }
    }

    func removeAll() {
        perConv.mutateUnchecked { subjects in
            subjects.removeAll()
            list.send([])
        }
    }
}

// MARK: - Errors

public enum ConversationStoreError: Error, Sendable {
    case unknownConversation(String)
    case dispatchFailed(reason: String)
}
