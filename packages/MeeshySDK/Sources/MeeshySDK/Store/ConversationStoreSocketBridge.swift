import Foundation
import Combine

/// Bridges real-time socket broadcasts to the conversation/category stores.
///
/// Subscribes to `MessageSocketManager` publishers and routes each event to
/// the matching store mutator. Mapping socket payload → store input lives
/// here so the stores stay transport-agnostic and the socket layer stays
/// store-agnostic.
///
/// Scope (this increment) — the cleanly-mappable broadcasts:
/// - `conversation:deleted`        → `ConversationStore.applyConversationDeleted`
/// - `user:preferences-reordered`  → `ConversationStore.applyRemoteReorder`
/// - `category:created/updated/deleted` + `categories:reordered`
///                                 → `UserCategoryStore.applyRemote`
///
/// Deferred (payload mismatch — the socket events don't carry the fields the
/// store needs): `user:preferences-updated` (no `version`/`reset`, flat shape)
/// and `read-status:updated` (no per-user `lastReadAt`/`unreadCount`). Their
/// store methods (`applyRemote`, `applyReadReceipt`) exist and are tested;
/// they wire up once the socket payloads are aligned.
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

    public init(
        store: ConversationStore = .shared,
        categoryStore: UserCategoryStore = .shared
    ) {
        self.store = store
        self.categoryStore = categoryStore
    }

    /// Wire the shared socket manager's broadcasts to the stores.
    public func activate(socket: MessageSocketManager = .shared) {
        activate(
            conversationDeleted: socket.conversationDeleted.eraseToAnyPublisher(),
            userPreferencesReordered: socket.userPreferencesReordered.eraseToAnyPublisher(),
            categoryCreated: socket.categoryCreated.eraseToAnyPublisher(),
            categoryUpdated: socket.categoryUpdated.eraseToAnyPublisher(),
            categoryDeleted: socket.categoryDeleted.eraseToAnyPublisher(),
            categoriesReordered: socket.categoriesReordered.eraseToAnyPublisher()
        )
    }

    /// Publisher-injected variant (testable without a live socket). Idempotent:
    /// drops any prior subscriptions before re-wiring.
    func activate(
        conversationDeleted: AnyPublisher<ConversationDeletedSocketEvent, Never>,
        userPreferencesReordered: AnyPublisher<UserPreferencesReorderedSocketEvent, Never>,
        categoryCreated: AnyPublisher<CategorySocketEvent, Never>,
        categoryUpdated: AnyPublisher<CategorySocketEvent, Never>,
        categoryDeleted: AnyPublisher<CategoryDeletedSocketEvent, Never>,
        categoriesReordered: AnyPublisher<CategoriesReorderedSocketEvent, Never>
    ) {
        cancellables.removeAll()
        let store = self.store
        let categoryStore = self.categoryStore

        conversationDeleted.sink { event in
            Task { await store.applyConversationDeleted(ConversationDeletedEvent(conversationId: event.conversationId)) }
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
    }

    /// Drop all subscriptions (e.g. on logout).
    public func deactivate() {
        cancellables.removeAll()
    }
}
