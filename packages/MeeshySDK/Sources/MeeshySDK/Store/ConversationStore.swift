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
}

/// Subset of `ConversationServiceProviding` used by the Store.
public protocol ConversationLifecycleWriting: Sendable {
    func markRead(conversationId: String) async throws
    func markUnread(conversationId: String) async throws
    func deleteForMe(conversationId: String) async throws
    func leave(conversationId: String) async throws
}

// MARK: - Subject registry (Combine bridge)

/// Combine `CurrentValueSubject`s aren't actor-safe to *create* lazily
/// from inside an actor (would require `Task { await … }` indirection).
/// This `@unchecked Sendable` registry wraps a lock so the actor can
/// hand out subjects synchronously to UI code calling `publisher(for:)`
/// from the main thread.
final class ConversationStoreSubjects: @unchecked Sendable {
    private let lock = NSLock()
    private var perConv: [String: CurrentValueSubject<MeeshyConversation, Never>] = [:]
    let list = CurrentValueSubject<[MeeshyConversation], Never>([])

    func subject(for id: String, initial: () -> MeeshyConversation?) -> CurrentValueSubject<MeeshyConversation, Never>? {
        lock.lock(); defer { lock.unlock() }
        if let s = perConv[id] { return s }
        guard let value = initial() else { return nil }
        let s = CurrentValueSubject<MeeshyConversation, Never>(value)
        perConv[id] = s
        return s
    }

    func send(_ conv: MeeshyConversation) {
        lock.lock(); defer { lock.unlock() }
        perConv[conv.id]?.send(conv)
    }

    func remove(_ id: String) {
        lock.lock(); defer { lock.unlock() }
        perConv.removeValue(forKey: id)
    }
}

// MARK: - Errors

public enum ConversationStoreError: Error, Sendable {
    case unknownConversation(String)
    case dispatchFailed(reason: String)
}

// MARK: - Store

/// Single source of truth in RAM for the per-user state of every
/// conversation the user has loaded.
///
/// Concurrency: an `actor`, so every mutating access serializes. UI
/// subscribers consume immutable `MeeshyConversation` snapshots via the
/// Combine publishers, which are safe to access from the main thread.
///
/// Phase 4 (foundation) scope:
/// - In-memory state + Combine publishers
/// - `hydrate` / `hydrateList`
/// - `apply(_:for:)` optimistic + outbox + dispatch + ACK/rollback
/// - `applyRemote` for `USER_PREFERENCES_UPDATED` with version gating
/// - `flushOutbox` to dispatch queued writes (foregrounded by the app
///   shell at scene-active / reachability changes)
///
/// Deferred to later phases:
/// - `applyReadReceipt`, `applyConversationDeleted`, composite helpers
///   (`createSectionAndAssign`, `reorderConversations`)
/// - Socket listener wiring on `MessageSocketManager`
/// - `hydrateFromCache` via `CacheCoordinator`
public actor ConversationStore {

    // MARK: - State

    private var conversations: [String: MeeshyConversation] = [:]
    private nonisolated let subjects = ConversationStoreSubjects()

    private let preferenceService: ConversationPreferenceWriting
    private let conversationService: ConversationLifecycleWriting
    private let outbox: ConversationStateOutbox

    // MARK: - Init

    public static let shared = ConversationStore()

    private init() {
        self.preferenceService = DefaultPreferenceWritingAdapter()
        self.conversationService = DefaultConversationLifecycleAdapter()
        self.outbox = ConversationStateOutbox.shared
    }

    public init(
        preferenceService: ConversationPreferenceWriting,
        conversationService: ConversationLifecycleWriting,
        outbox: ConversationStateOutbox
    ) {
        self.preferenceService = preferenceService
        self.conversationService = conversationService
        self.outbox = outbox
    }

    // MARK: - Read

    public func conversation(id: String) -> MeeshyConversation? {
        conversations[id]
    }

    public nonisolated func publisher(for convId: String) -> AnyPublisher<MeeshyConversation, Never>? {
        // Returns nil if the conversation has never been hydrated — the
        // caller should hydrate first then re-subscribe.
        subjects.subject(for: convId, initial: { nil })?.eraseToAnyPublisher()
    }

    public nonisolated func listPublisher() -> AnyPublisher<[MeeshyConversation], Never> {
        subjects.list.eraseToAnyPublisher()
    }

    // MARK: - Hydration

    public func hydrate(_ conv: MeeshyConversation) {
        conversations[conv.id] = conv
        // Seed or refresh the per-conv subject and the list snapshot.
        if let existing = subjects.subject(for: conv.id, initial: { conv }) {
            existing.send(conv)
        }
        publishList()
    }

    public func hydrateList(_ convs: [MeeshyConversation]) {
        for conv in convs {
            conversations[conv.id] = conv
            if let existing = subjects.subject(for: conv.id, initial: { conv }) {
                existing.send(conv)
            }
        }
        publishList()
    }

    // MARK: - Apply (optimistic + outbox + dispatch)

    /// Apply a mutation: snapshot → optimistic mutate + version bump →
    /// outbox enqueue → dispatch → ACK swaps in authoritative version
    /// OR rollback on permanent failure OR retain in outbox on
    /// transient failure.
    ///
    /// For local-only mutations (`UserStateMutation.isLocalOnly`) the
    /// outbox path is skipped entirely.
    public func apply(_ mutation: UserStateMutation, for convId: String) async throws {
        guard var conv = conversations[convId] else {
            throw ConversationStoreError.unknownConversation(convId)
        }
        let snapshot = conv.userState

        // 1. Optimistic mutation + candidate version bump.
        conv.userState = applyLocally(mutation, on: conv.userState)
        if !mutation.isLocalOnly {
            conv.userState.version += 1
        }
        commit(conv)

        // Local-only short-circuit (no network, no outbox).
        if mutation.isLocalOnly { return }

        // 2. Enqueue in outbox.
        guard let task = await outbox.enqueue(mutation, for: convId) else { return }

        // 3. Dispatch and apply outcome.
        await refreshPendingCount(convId: convId)
        let outcome = await dispatch(task)
        switch outcome {
        case .completed(let authoritativeVersion):
            await outbox.markCompleted(task.id)
            if var conv = conversations[convId] {
                if let v = authoritativeVersion {
                    conv.userState.version = v
                }
                conv.userState.lastSyncedAt = Date()
                commit(conv)
            }
            await refreshPendingCount(convId: convId)

        case .failedPermanent(let reason):
            // 4xx — rollback to the snapshot taken before the optimistic
            // mutation, mark task failed (which drops it), propagate.
            if var conv = conversations[convId] {
                conv.userState = snapshot
                commit(conv)
            }
            await outbox.markFailedPermanent(task.id, reason: reason)
            await refreshPendingCount(convId: convId)
            throw ConversationStoreError.dispatchFailed(reason: reason)

        case .failedTransient(let reason):
            // Network / 5xx — leave the optimistic state in place,
            // bump retry, do NOT throw (the caller already saw the
            // optimistic update succeed). A later `flushOutbox()` call
            // will retry.
            await outbox.markFailedTransient(task.id, reason: reason)
            await refreshPendingCount(convId: convId)
        }
    }

    /// Flush the outbox by dispatching every ready task through the
    /// Store's internal dispatch path. Call at app foreground and on
    /// network reachability changes.
    public func flushOutbox() async {
        await outbox.flush { [weak self] task in
            guard let self else { return .failedTransient(reason: "store deallocated") }
            let result = await self.dispatch(task)
            // Outbox dispatch outcome maps 1:1 to the local result, minus
            // the version (which we apply directly to the in-memory
            // conversation here rather than threading it back).
            switch result {
            case .completed(let version):
                if let v = version, var conv = await self.conversations[task.convId] {
                    conv.userState.version = v
                    conv.userState.lastSyncedAt = Date()
                    await self.commit(conv)
                }
                return .completed
            case .failedPermanent(let reason):
                return .failedPermanent(reason: reason)
            case .failedTransient(let reason):
                return .failedTransient(reason: reason)
            }
        }
        for id in conversations.keys {
            await refreshPendingCount(convId: id)
        }
    }

    // MARK: - Remote event application

    /// Apply a `USER_PREFERENCES_UPDATED` socket event. Drops the event
    /// when its version is `<=` the local snapshot (stale broadcast).
    /// On `reset: true` (DELETE), restores defaults preserving the
    /// version (which the server emits as `existing.version + 1`).
    public func applyRemote(_ event: UserPreferencesUpdatedRemote) {
        guard var conv = conversations[event.conversationId] else {
            // Conversation not hydrated yet — drop silently; the next
            // list refresh will catch up.
            return
        }
        if event.version <= conv.userState.version {
            return
        }
        if event.reset {
            conv.userState = ConversationUserState(
                version: event.version,
                lastSyncedAt: Date()
            )
        } else {
            if let prefs = event.preferences {
                conv.userState.isPinned = prefs.isPinned
                conv.userState.isMuted = prefs.isMuted
                conv.userState.mentionsOnly = prefs.mentionsOnly
                conv.userState.isArchived = prefs.isArchived
                conv.userState.tags = prefs.tags
                conv.userState.sectionId = prefs.categoryId
                conv.userState.orderInCategory = prefs.orderInCategory
                conv.userState.customName = prefs.customName
                conv.userState.reaction = prefs.reaction
                conv.userState.deletedForUserAt = prefs.deletedForUserAt
                conv.userState.clearHistoryBefore = prefs.clearHistoryBefore
            }
            conv.userState.version = event.version
            conv.userState.lastSyncedAt = Date()
        }
        commit(conv)
    }

    // MARK: - Private helpers

    /// Apply a mutation to a `ConversationUserState` snapshot without
    /// any version bump. Pure function (no I/O, no side effects).
    func applyLocally(_ mutation: UserStateMutation, on state: ConversationUserState) -> ConversationUserState {
        var s = state
        switch mutation {
        case .setPinned(let v): s.isPinned = v
        case .setMuted(let v): s.isMuted = v
        case .setMentionsOnly(let v): s.mentionsOnly = v
        case .setArchived(let v): s.isArchived = v
        case .setCustomName(let v): s.customName = v
        case .setReaction(let v): s.reaction = v
        case .setSection(let id): s.sectionId = id
        case .setOrderInCategory(let v): s.orderInCategory = v
        case .setTags(let v): s.tags = v
        case .addTag(let t):
            if !s.tags.contains(t) { s.tags.append(t) }
        case .removeTag(let t):
            s.tags.removeAll { $0 == t }
        case .setClearHistoryBefore(let d): s.clearHistoryBefore = d
        case .markAsRead:
            s.unreadCount = 0
            s.lastReadAt = Date()
        case .markAsUnread:
            // Server is authoritative for unread count; locally we hint
            // ≥ 1 so the UI badge appears immediately.
            if s.unreadCount == 0 { s.unreadCount = 1 }
            s.lastReadAt = nil
        case .deleteForUser:
            s.deletedForUserAt = Date()
        case .leave:
            // Visibility-wise treated like a soft delete on the user's
            // side. The server will eventually broadcast the participant
            // leave event; we just clear the local view.
            s.deletedForUserAt = Date()
        case .setLocked(let v):
            s.isLocked = v
        }
        return s
    }

    private func commit(_ conv: MeeshyConversation) {
        conversations[conv.id] = conv
        subjects.send(conv)
        publishList()
    }

    private func publishList() {
        let snapshot = Array(conversations.values).sorted { $0.lastMessageAt > $1.lastMessageAt }
        subjects.list.send(snapshot)
    }

    private func refreshPendingCount(convId: String) async {
        let count = await outbox.pendingCount(for: convId)
        guard var conv = conversations[convId], conv.userState.pendingMutationCount != count else { return }
        conv.userState.pendingMutationCount = count
        commit(conv)
    }

    // MARK: - Dispatch routing

    /// Internal dispatch outcome carrying the authoritative version
    /// returned by the server (for PUT-style mutations). Local-only
    /// outcomes use `.completed(nil)`.
    enum DispatchOutcome: Sendable {
        case completed(authoritativeVersion: Int?)
        case failedPermanent(reason: String)
        case failedTransient(reason: String)
    }

    private func dispatch(_ task: OutboxTask) async -> DispatchOutcome {
        switch task.mutation {
        case .setPinned, .setMuted, .setMentionsOnly, .setArchived,
             .setCustomName, .setReaction, .setSection, .setOrderInCategory,
             .setTags, .addTag, .removeTag, .setClearHistoryBefore:
            return await dispatchPreferencesUpdate(task: task)

        case .markAsRead:
            return await runVoid { try await self.conversationService.markRead(conversationId: task.convId) }
        case .markAsUnread:
            return await runVoid { try await self.conversationService.markUnread(conversationId: task.convId) }
        case .deleteForUser:
            return await runVoid { try await self.conversationService.deleteForMe(conversationId: task.convId) }
        case .leave:
            return await runVoid { try await self.conversationService.leave(conversationId: task.convId) }

        case .setLocked:
            // Local-only — dispatch is a no-op success.
            return .completed(authoritativeVersion: nil)
        }
    }

    private func dispatchPreferencesUpdate(task: OutboxTask) async -> DispatchOutcome {
        let request: UpdateConversationPreferencesRequest
        switch task.mutation {
        case .setPinned(let v): request = UpdateConversationPreferencesRequest(isPinned: v)
        case .setMuted(let v): request = UpdateConversationPreferencesRequest(isMuted: v)
        case .setMentionsOnly(let v): request = UpdateConversationPreferencesRequest(mentionsOnly: v)
        case .setArchived(let v): request = UpdateConversationPreferencesRequest(isArchived: v)
        case .setCustomName(let v): request = UpdateConversationPreferencesRequest(customName: v)
        case .setReaction(let v): request = UpdateConversationPreferencesRequest(reaction: v)
        case .setSection(let id): request = UpdateConversationPreferencesRequest(categoryId: id)
        case .setOrderInCategory: request = UpdateConversationPreferencesRequest()
        case .setTags(let v): request = UpdateConversationPreferencesRequest(tags: v)
        case .addTag, .removeTag:
            // The Store should resolve add/remove to the final tags
            // array via `applyLocally` before enqueueing setTags, but
            // if a raw add/remove makes it here we forward the current
            // local state.
            let tags = conversations[task.convId]?.userState.tags ?? []
            request = UpdateConversationPreferencesRequest(tags: tags)
        case .setClearHistoryBefore:
            // The request type doesn't expose clearHistoryBefore in the
            // current PreferenceService surface; treat as success
            // locally until the server endpoint is wired.
            return .completed(authoritativeVersion: nil)
        default:
            return .completed(authoritativeVersion: nil)
        }

        do {
            let updated = try await preferenceService.updateConversationPreferences(
                conversationId: task.convId,
                request: request
            )
            return .completed(authoritativeVersion: updated.version)
        } catch {
            return classifyError(error)
        }
    }

    private func runVoid(_ op: @Sendable () async throws -> Void) async -> DispatchOutcome {
        do {
            try await op()
            return .completed(authoritativeVersion: nil)
        } catch {
            return classifyError(error)
        }
    }

    private func classifyError(_ error: Error) -> DispatchOutcome {
        // Errors with an HTTP status code in 4xx → permanent (caller
        // sent garbage; rollback). Everything else → transient (network
        // / 5xx; retry).
        if let me = error as? MeeshyError, case .server(let status, let msg) = me, (400..<500).contains(status) {
            let reason = msg.isEmpty ? "HTTP \(status)" : msg
            return .failedPermanent(reason: reason)
        }
        return .failedTransient(reason: String(describing: error))
    }
}

// MARK: - Remote event value type

/// Strongly-typed payload for `USER_PREFERENCES_UPDATED` (conversation
/// scope). Mirrors the gateway's `UserPreferencesConversationUpdatedEventData`.
public struct UserPreferencesUpdatedRemote: Sendable, Hashable {
    public let userId: String
    public let conversationId: String
    public let version: Int
    public let reset: Bool
    public let preferences: RemotePreferencesPayload?

    public init(
        userId: String,
        conversationId: String,
        version: Int,
        reset: Bool,
        preferences: RemotePreferencesPayload?
    ) {
        self.userId = userId
        self.conversationId = conversationId
        self.version = version
        self.reset = reset
        self.preferences = preferences
    }
}

public struct RemotePreferencesPayload: Sendable, Hashable {
    public let isPinned: Bool
    public let isMuted: Bool
    public let mentionsOnly: Bool
    public let isArchived: Bool
    public let tags: [String]
    public let categoryId: String?
    public let orderInCategory: Int?
    public let customName: String?
    public let reaction: String?
    public let deletedForUserAt: Date?
    public let clearHistoryBefore: Date?

    public init(
        isPinned: Bool,
        isMuted: Bool,
        mentionsOnly: Bool,
        isArchived: Bool,
        tags: [String],
        categoryId: String?,
        orderInCategory: Int?,
        customName: String?,
        reaction: String?,
        deletedForUserAt: Date?,
        clearHistoryBefore: Date?
    ) {
        self.isPinned = isPinned
        self.isMuted = isMuted
        self.mentionsOnly = mentionsOnly
        self.isArchived = isArchived
        self.tags = tags
        self.categoryId = categoryId
        self.orderInCategory = orderInCategory
        self.customName = customName
        self.reaction = reaction
        self.deletedForUserAt = deletedForUserAt
        self.clearHistoryBefore = clearHistoryBefore
    }
}

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
