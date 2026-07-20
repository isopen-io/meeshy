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

    /// Batch reorder (`POST /user-preferences/conversations/reorder`). Used by
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

    func removeAll() {
        lock.lock(); defer { lock.unlock() }
        perConv.removeAll()
        list.send([])
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
/// Phase 4 bis (complete): `applyReadReceipt` (monotone),
/// `applyConversationDeleted`, `createSectionAndAssign`, `reorderConversations`
/// (batch via `POST /user-preferences/reorder`), `hydrateFromCache` (SWR from
/// the conversation cache, key "list").
///
/// Still deferred:
/// - Socket listener wiring on `MessageSocketManager` (maps socket events to
///   `applyRemote` / `applyReadReceipt` / `applyConversationDeleted` /
///   reordered) — Phase 5/6 glue.
public actor ConversationStore {

    // MARK: - State

    private var conversations: [String: MeeshyConversation] = [:]
    private nonisolated let subjects = ConversationStoreSubjects()

    private let preferenceService: ConversationPreferenceWriting
    private let conversationService: ConversationLifecycleWriting
    private let categoryService: ConversationCategoryCreating
    private let cache: ConversationCacheReading
    private let outbox: ConversationStateOutbox

    // MARK: - Init

    public static let shared = ConversationStore()

    private init() {
        self.preferenceService = DefaultPreferenceWritingAdapter()
        self.conversationService = DefaultConversationLifecycleAdapter()
        self.categoryService = DefaultCategoryCreatingAdapter()
        self.cache = DefaultCacheReadingAdapter()
        self.outbox = ConversationStateOutbox.shared
    }

    public init(
        preferenceService: ConversationPreferenceWriting,
        conversationService: ConversationLifecycleWriting,
        outbox: ConversationStateOutbox,
        categoryService: ConversationCategoryCreating = DefaultCategoryCreatingAdapter(),
        cache: ConversationCacheReading = DefaultCacheReadingAdapter()
    ) {
        self.preferenceService = preferenceService
        self.conversationService = conversationService
        self.categoryService = categoryService
        self.cache = cache
        self.outbox = outbox
    }

    // MARK: - Session teardown

    /// Purge au logout (cascade `AuthManager.logout`) — isolation des données
    /// entre comptes sur le même device : sans elle, les conversations de
    /// l'utilisateur A (et un `CurrentValueSubject` par conversation hydratée,
    /// jamais évincé) restaient résidents pendant toute la session de
    /// l'utilisateur B. Les publishers per-conv encore détenus par une UI en
    /// cours de teardown deviennent orphelins (plus d'émission) — attendu.
    public func reset() {
        conversations.removeAll()
        subjects.removeAll()
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

    /// Merge a server / cache metadata snapshot into the store while
    /// preserving any local `userState` that is newer than the incoming
    /// one — i.e. an in-flight optimistic mutation the server hasn't ACK'd
    /// yet (`local.version > incoming.version`).
    ///
    /// Unlike `hydrateList`, which replaces each conversation wholesale,
    /// this is the safe path for repeated metadata refreshes (the list VM
    /// re-hydrates on every sync / socket update): metadata (title,
    /// `lastMessageAt`, members, …) always takes the incoming value, but
    /// the per-user state is version-gated so a concurrent refresh can't
    /// clobber an optimistic toggle that is still draining through the
    /// outbox. Conversations the store doesn't know yet are seeded
    /// wholesale.
    public func hydrateMetadata(_ convs: [MeeshyConversation]) {
        for incoming in convs {
            let merged: MeeshyConversation
            if let existing = conversations[incoming.id],
               existing.userState.version > incoming.userState.version {
                var grafted = incoming
                grafted.userState = existing.userState
                merged = grafted
            } else {
                merged = incoming
            }
            conversations[merged.id] = merged
            if let subject = subjects.subject(for: merged.id, initial: { merged }) {
                subject.send(merged)
            }
        }
        publishList()
    }

    /// Seed the store from the L2 conversation cache (Stale-While-Revalidate):
    /// both `.fresh` and `.stale` snapshots hydrate immediately so the UI
    /// paints from cache without a spinner; `.expired` / `.empty` are no-ops
    /// (the caller's network fetch will hydrate later).
    public func hydrateFromCache() async {
        switch await cache.loadConversationList() {
        case .fresh(let convs, _), .stale(let convs, _):
            hydrateList(convs)
        case .expired, .empty:
            break
        }
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
        await outbox.flush(force: true) { [weak self] task in
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

    /// Apply a read-receipt socket event. Read receipts are **monotone**:
    /// `lastReadAt` only ever moves forward, so a receipt whose `lastReadAt`
    /// is not strictly newer than the local one is dropped (stale broadcast).
    /// `unreadCount` is server-authoritative and applied as-is when the
    /// receipt is accepted. This path NEVER bumps `userState.version`
    /// (versioning is reserved for the prefs path — §9 of the design).
    public func applyReadReceipt(_ event: ReadStatusEvent) {
        guard var conv = conversations[event.conversationId] else { return }
        let isNewer: Bool
        if let incoming = event.lastReadAt {
            isNewer = conv.userState.lastReadAt.map { incoming > $0 } ?? true
        } else {
            isNewer = false
        }
        guard isNewer else { return }
        conv.userState.lastReadAt = event.lastReadAt
        conv.userState.unreadCount = event.unreadCount
        commit(conv)
    }

    /// Apply a conversation-deleted socket event: drop the conversation from
    /// the in-memory store, release its per-conv subject, and republish the
    /// list. No-op for an unknown conversation.
    public func applyConversationDeleted(_ event: ConversationDeletedEvent) {
        guard conversations[event.conversationId] != nil else { return }
        conversations.removeValue(forKey: event.conversationId)
        subjects.remove(event.conversationId)
        publishList()
    }

    /// Apply a `conversation:updated` socket event. Updates conversation
    /// metadata and/or the last-message fields used for bump-to-top list
    /// reordering. Only non-nil fields are applied (nil = "not provided by
    /// this payload variant"). `lastMessageAt`, `lastMessageId` and
    /// `lastMessagePreview` are monotone as a group: an incoming
    /// `lastMessageAt` older than the current one means the whole payload
    /// describes a stale message, so the id/preview are skipped along with
    /// the timestamp (otherwise a delayed broadcast for an older message
    /// would leave the row showing the newest timestamp paired with the
    /// older message's text). Fields unrelated to message ordering (e.g.
    /// `title`) are still applied regardless. No-op for an unknown
    /// conversation (the next list refresh will catch up).
    public func applyConversationUpdated(_ event: ConversationUpdatedStoreEvent) {
        guard var conv = conversations[event.conversationId] else { return }

        var changed = false

        let lastMessageIsCurrent = event.lastMessageAt.map { $0 > conv.lastMessageAt } ?? true
        if lastMessageIsCurrent {
            if let incoming = event.lastMessageAt { conv.lastMessageAt = incoming; changed = true }
            if let v = event.lastMessageId { conv.lastMessageId = v; changed = true }
            if let v = event.lastMessagePreview { conv.lastMessagePreview = v.meeshyPreviewTruncated; changed = true }
        }
        if let v = event.title { conv.title = v; changed = true }
        if let v = event.avatar { conv.avatar = v; changed = true }
        if let v = event.description { conv.description = v; changed = true }
        if let v = event.banner { conv.banner = v; changed = true }
        if let v = event.isAnnouncementChannel { conv.isAnnouncementChannel = v; changed = true }
        if let v = event.defaultWriteRole { conv.defaultWriteRole = v; changed = true }
        if let v = event.slowModeSeconds { conv.slowModeSeconds = v; changed = true }
        if let v = event.autoTranslateEnabled { conv.autoTranslateEnabled = v; changed = true }

        if changed { commit(conv) }
    }

    // MARK: - Composite mutations

    /// Create a new category (server round-trip) then assign `convId` to it.
    /// The section assignment goes through the regular optimistic `apply`
    /// path so it inherits outbox + version + rollback semantics. Throws
    /// `unknownConversation` before creating the category if `convId` is
    /// not hydrated (avoids orphan categories).
    public func createSectionAndAssign(
        name: String,
        color: String?,
        icon: String?,
        toConversation convId: String
    ) async throws {
        guard conversations[convId] != nil else {
            throw ConversationStoreError.unknownConversation(convId)
        }
        let category = try await categoryService.create(name: name, color: color, icon: icon)
        try await apply(.setSection(categoryId: category.id), for: convId)
    }

    /// Batch drag-to-reorder. Applies the new `orderInCategory` to every
    /// affected conversation optimistically (single publish per conv), then
    /// commits via the batch reorder endpoint. On failure the whole batch is
    /// rolled back to its pre-reorder snapshot and the error is rethrown.
    /// Order does not participate in the per-field outbox/version path — it is
    /// a direct composite write (matches the gateway's batch endpoint).
    public func reorderConversations(_ updates: [(convId: String, orderInCategory: Int)]) async throws {
        var snapshots: [String: ConversationUserState] = [:]
        for update in updates {
            guard var conv = conversations[update.convId] else { continue }
            snapshots[update.convId] = conv.userState
            conv.userState.orderInCategory = update.orderInCategory
            commit(conv)
        }
        do {
            try await preferenceService.reorderConversations(updates)
        } catch {
            for (id, snapshot) in snapshots {
                if var conv = conversations[id] {
                    conv.userState = snapshot
                    commit(conv)
                }
            }
            throw error
        }
    }

    /// Apply a remote reorder broadcast (`USER_PREFERENCES_REORDERED` from
    /// another device). Updates `orderInCategory` locally and republishes —
    /// NO network round-trip (unlike `reorderConversations`) and no version
    /// bump (order is not version-tracked). Unknown conversations are skipped.
    public func applyRemoteReorder(_ updates: [(convId: String, orderInCategory: Int)]) {
        for update in updates {
            guard var conv = conversations[update.convId] else { continue }
            conv.userState.orderInCategory = update.orderInCategory
            commit(conv)
        }
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

/// Store-owned input for `applyReadReceipt`. Decoupled from the socket
/// layer's `ReadStatusUpdateEvent` so the wiring layer maps socket → store.
public struct ReadStatusEvent: Sendable, Hashable {
    public let conversationId: String
    public let unreadCount: Int
    public let lastReadAt: Date?

    public init(conversationId: String, unreadCount: Int, lastReadAt: Date?) {
        self.conversationId = conversationId
        self.unreadCount = unreadCount
        self.lastReadAt = lastReadAt
    }
}

/// Store-owned input for `applyConversationDeleted`.
public struct ConversationDeletedEvent: Sendable, Hashable {
    public let conversationId: String

    public init(conversationId: String) {
        self.conversationId = conversationId
    }
}

/// Store-owned input for `applyConversationUpdated`. Carries the fields
/// the store cares about from the `conversation:updated` socket event.
/// Both the message-driven path (bump-to-top: `lastMessageAt`,
/// `lastMessageId`, `lastMessagePreview`) and the metadata-driven path
/// (rename, avatar, etc.) share this type — unset fields are `nil` and
/// skipped during application.
public struct ConversationUpdatedStoreEvent: Sendable, Hashable {
    public let conversationId: String
    public let lastMessageAt: Date?
    public let lastMessageId: String?
    public let lastMessagePreview: String?
    public let title: String?
    public let avatar: String?
    public let description: String?
    public let banner: String?
    public let isAnnouncementChannel: Bool?
    public let defaultWriteRole: String?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?

    public init(
        conversationId: String,
        lastMessageAt: Date? = nil,
        lastMessageId: String? = nil,
        lastMessagePreview: String? = nil,
        title: String? = nil,
        avatar: String? = nil,
        description: String? = nil,
        banner: String? = nil,
        isAnnouncementChannel: Bool? = nil,
        defaultWriteRole: String? = nil,
        slowModeSeconds: Int? = nil,
        autoTranslateEnabled: Bool? = nil
    ) {
        self.conversationId = conversationId
        self.lastMessageAt = lastMessageAt
        self.lastMessageId = lastMessageId
        self.lastMessagePreview = lastMessagePreview
        self.title = title
        self.avatar = avatar
        self.description = description
        self.banner = banner
        self.isAnnouncementChannel = isAnnouncementChannel
        self.defaultWriteRole = defaultWriteRole
        self.slowModeSeconds = slowModeSeconds
        self.autoTranslateEnabled = autoTranslateEnabled
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
