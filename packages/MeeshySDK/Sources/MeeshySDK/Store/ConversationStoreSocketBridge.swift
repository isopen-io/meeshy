import Foundation
import Combine

/// Bridges real-time socket broadcasts to the conversation/category stores.
///
/// Subscribes to `MessageSocketManager` publishers and routes each event to
/// the matching store mutator. Mapping socket payload → store input lives
/// here so the stores stay transport-agnostic and the socket layer stays
/// store-agnostic.
///
/// Scope — the broadcasts routed to the store:
/// - `conversation:updated`        → `ConversationStore.applyConversationUpdated`
///   (bump-to-top on new message + metadata changes: title, avatar, …)
/// - `conversation:deleted`        → `ConversationStore.applyConversationDeleted`
/// - `user:preferences-updated` (conversation scope, versioned)
///                                 → `ConversationStore.applyRemote`
/// - `user:preferences-reordered`  → `ConversationStore.applyRemoteReorder`
/// - `read-status:updated`         → `ConversationStore.applyReadReceipt`
/// - `category:created/updated/deleted` + `categories:reordered`
///                                 → `UserCategoryStore.applyRemote`
///
/// `read-status:updated` mutates the CURRENT user's own state (multi-device
/// read sync). It is applied only when (a) `type == "read"` — a `received`
/// delivery never advances a read cursor — (b) both `lastReadAt` and
/// `unreadCount` are present (they travel together; the gateway omits them on
/// non-`read` broadcasts), and (c) `event.userId == currentUserId`, since the
/// same broadcast also reaches peers (for checkmarks) and a peer reading must
/// not move our cursor. The store's monotone `lastReadAt` guard then drops any
/// receipt not strictly newer than the local cursor.
///
/// `@MainActor`: subscriptions and `cancellables` live on the main thread
/// (publishers deliver on main via `MessageSocketManager.decode`); each sink
/// hops to the target actor via `Task { await … }`.
@MainActor
public final class ConversationStoreSocketBridge {
    public static let shared = ConversationStoreSocketBridge()

    private var cancellables = Set<AnyCancellable>()
    private let store: ConversationStore
    private let categoryStore: UserCategoryStore
    /// Resolves the signed-in user's id for the read-receipt identity gate.
    /// Injected for testability; production reads it from `AuthManager`.
    private let currentUserId: @Sendable () async -> String?

    public init(
        store: ConversationStore = .shared,
        categoryStore: UserCategoryStore = .shared,
        currentUserId: @escaping @Sendable () async -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.store = store
        self.categoryStore = categoryStore
        self.currentUserId = currentUserId
    }

    /// Wire the shared socket manager's broadcasts to the stores.
    public func activate(socket: MessageSocketManager = .shared) {
        activate(
            conversationUpdated: socket.conversationUpdated.eraseToAnyPublisher(),
            conversationDeleted: socket.conversationDeleted.eraseToAnyPublisher(),
            userPreferencesUpdated: socket.userPreferencesConversationUpdated.eraseToAnyPublisher(),
            userPreferencesReordered: socket.userPreferencesReordered.eraseToAnyPublisher(),
            readStatusUpdated: socket.readStatusUpdated.eraseToAnyPublisher(),
            categoryCreated: socket.categoryCreated.eraseToAnyPublisher(),
            categoryUpdated: socket.categoryUpdated.eraseToAnyPublisher(),
            categoryDeleted: socket.categoryDeleted.eraseToAnyPublisher(),
            categoriesReordered: socket.categoriesReordered.eraseToAnyPublisher(),
            didReconnect: socket.didReconnect.eraseToAnyPublisher()
        )
    }

    /// Publisher-injected variant (testable without a live socket). Idempotent:
    /// drops any prior subscriptions before re-wiring.
    func activate(
        conversationUpdated: AnyPublisher<ConversationUpdatedEvent, Never>,
        conversationDeleted: AnyPublisher<ConversationDeletedSocketEvent, Never>,
        userPreferencesUpdated: AnyPublisher<UserPreferencesConversationUpdatedSocketEvent, Never>,
        userPreferencesReordered: AnyPublisher<UserPreferencesReorderedSocketEvent, Never>,
        readStatusUpdated: AnyPublisher<ReadStatusUpdateEvent, Never>,
        categoryCreated: AnyPublisher<CategorySocketEvent, Never>,
        categoryUpdated: AnyPublisher<CategorySocketEvent, Never>,
        categoryDeleted: AnyPublisher<CategoryDeletedSocketEvent, Never>,
        categoriesReordered: AnyPublisher<CategoriesReorderedSocketEvent, Never>,
        didReconnect: AnyPublisher<Void, Never> = Empty().eraseToAnyPublisher()
    ) {
        cancellables.removeAll()
        let store = self.store
        let categoryStore = self.categoryStore
        let currentUserId = self.currentUserId

        conversationUpdated.sink { event in
            Task { await store.applyConversationUpdated(Self.mapConversationUpdated(event)) }
        }.store(in: &cancellables)

        conversationDeleted.sink { event in
            Task { await store.applyConversationDeleted(ConversationDeletedEvent(conversationId: event.conversationId)) }
        }.store(in: &cancellables)

        userPreferencesUpdated.sink { event in
            let remote = Self.mapPreferences(event)
            Task { await store.applyRemote(remote) }
        }.store(in: &cancellables)

        readStatusUpdated.sink { event in
            // Only a 'read' advances the read cursor; 'received' is delivery
            // and must NOT touch unread state (mirrors ConversationSyncEngine's
            // type gate). The frontier and its count travel together — require
            // both so a partial/legacy payload can never coerce the badge to a
            // bogus 0. The broadcast also reaches peers (for checkmarks), so we
            // additionally gate on identity: only the actor's own devices may
            // advance the cursor. The store's monotone `lastReadAt` guard then
            // drops anything not strictly newer than the local cursor.
            guard event.type == "read",
                  let lastReadAt = event.lastReadAt,
                  let unreadCount = event.unreadCount else { return }
            Task {
                guard let me = await currentUserId(), event.userId == me else { return }
                await store.applyReadReceipt(ReadStatusEvent(
                    conversationId: event.conversationId,
                    unreadCount: unreadCount,
                    lastReadAt: lastReadAt
                ))
            }
        }.store(in: &cancellables)

        userPreferencesReordered.sink { event in
            let updates = event.updates.map { (convId: $0.conversationId, orderInCategory: $0.orderInCategory) }
            Task { await store.applyRemoteReorder(updates) }
        }.store(in: &cancellables)

        categoryCreated.sink { event in
            Task { await categoryStore.applyRemote(.created(event.category)) }
        }.store(in: &cancellables)

        categoryUpdated.sink { event in
            Task { await categoryStore.applyRemote(.updated(event.category)) }
        }.store(in: &cancellables)

        categoryDeleted.sink { event in
            Task { await categoryStore.applyRemote(.deleted(id: event.categoryId)) }
        }.store(in: &cancellables)

        categoriesReordered.sink { event in
            let updates = event.updates.map { (id: $0.categoryId, order: $0.order) }
            Task { await categoryStore.applyRemote(.reordered(updates: updates)) }
        }.store(in: &cancellables)

        didReconnect.sink {
            Task { await store.flushOutbox() }
            Task { try? await categoryStore.hydrate() }
        }.store(in: &cancellables)
    }

    /// Drop all subscriptions (e.g. on logout).
    public func deactivate() {
        cancellables.removeAll()
    }

    /// Map a `conversation:updated` socket event onto the store's input value
    /// type. Pure + `nonisolated` so the sink can build it before hopping to
    /// the store actor.
    nonisolated static func mapConversationUpdated(
        _ event: ConversationUpdatedEvent
    ) -> ConversationUpdatedStoreEvent {
        ConversationUpdatedStoreEvent(
            conversationId: event.conversationId,
            lastMessageAt: event.lastMessageAt,
            lastMessageId: event.lastMessageId,
            lastMessagePreview: event.lastMessagePreview,
            title: event.title,
            avatar: event.avatar,
            description: event.description,
            banner: event.banner,
            isAnnouncementChannel: event.isAnnouncementChannel,
            defaultWriteRole: event.defaultWriteRole,
            slowModeSeconds: event.slowModeSeconds,
            autoTranslateEnabled: event.autoTranslateEnabled
        )
    }

    /// Map the conversation-scope socket payload onto the store's input value
    /// type. Pure + `nonisolated` so the sink can build it before hopping to
    /// the store actor. `preferences == nil` (a reset/DELETE) is preserved —
    /// `applyRemote` restores defaults in that case.
    nonisolated static func mapPreferences(
        _ event: UserPreferencesConversationUpdatedSocketEvent
    ) -> UserPreferencesUpdatedRemote {
        UserPreferencesUpdatedRemote(
            userId: event.userId,
            conversationId: event.conversationId,
            version: event.version,
            reset: event.reset,
            preferences: event.preferences.map { p in
                RemotePreferencesPayload(
                    isPinned: p.isPinned,
                    isMuted: p.isMuted,
                    mentionsOnly: p.mentionsOnly,
                    isArchived: p.isArchived,
                    tags: p.tags,
                    categoryId: p.categoryId,
                    orderInCategory: p.orderInCategory,
                    customName: p.customName,
                    reaction: p.reaction,
                    deletedForUserAt: p.deletedForUserAt,
                    clearHistoryBefore: p.clearHistoryBefore
                )
            }
        )
    }
}
