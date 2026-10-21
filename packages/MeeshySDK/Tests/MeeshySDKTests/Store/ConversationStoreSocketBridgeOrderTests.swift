import XCTest
import Combine
import os
@testable import MeeshySDK

@MainActor
final class ConversationStoreSocketBridgeOrderTests: XCTestCase {

    private func makeStore() -> ConversationStore {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("bridge-order-outbox-\(UUID().uuidString).db").path
        return ConversationStore(
            preferenceService: MockPreferenceWriter(),
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: outboxPath)
        )
    }

    private func makeConv(id: String) -> MeeshyConversation {
        MeeshyConversation(
            id: id, identifier: id, type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(unreadCount: 0)
        )
    }

    @MainActor
    private struct OrderEnv {
        let bridge: ConversationStoreSocketBridge
        let deleted = PassthroughSubject<ConversationDeletedSocketEvent, Never>()
        let restored = PassthroughSubject<ConversationRestoredSocketEvent, Never>()
        let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
        let conversationUpdated = PassthroughSubject<ConversationUpdatedEvent, Never>()

        init(
            store: ConversationStore,
            fetchConversation: @escaping @Sendable (String, String) async -> MeeshyConversation?,
            isConversationOpen: @escaping @Sendable (String) -> Bool = { _ in false }
        ) {
            bridge = ConversationStoreSocketBridge(
                store: store,
                categoryStore: UserCategoryStore(service: MockCategoryWriter()),
                currentUserId: { "me" },
                fetchConversation: fetchConversation,
                isConversationOpen: isConversationOpen
            )
            bridge.activate(
                conversationUpdated: conversationUpdated.eraseToAnyPublisher(),
                conversationDeleted: deleted.eraseToAnyPublisher(),
                conversationRestored: restored.eraseToAnyPublisher(),
                userPreferencesUpdated: Empty().eraseToAnyPublisher(),
                userPreferencesReordered: Empty().eraseToAnyPublisher(),
                readStatusUpdated: Empty().eraseToAnyPublisher(),
                unreadUpdated: unreadUpdated.eraseToAnyPublisher(),
                categoryCreated: Empty().eraseToAnyPublisher(),
                categoryUpdated: Empty().eraseToAnyPublisher(),
                categoryDeleted: Empty().eraseToAnyPublisher(),
                categoriesReordered: Empty().eraseToAnyPublisher()
            )
        }
    }

    private func drainMainQueue() async {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
    }

    func test_restoredThenDeleted_conversationEndsAbsent() async {
        let store = makeStore()
        let gate = LaneTestGate()
        let env = OrderEnv(store: store, fetchConversation: { id, _ in
            await gate.wait()
            return MeeshyConversation(
                id: id, identifier: id, type: .direct,
                lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
                createdAt: Date(timeIntervalSince1970: 1_700_000_000),
                updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
                userState: ConversationUserState(version: 1)
            )
        })

        env.restored.send(ConversationRestoredSocketEvent(userId: "me", conversationId: "c1"))
        env.deleted.send(ConversationDeletedSocketEvent(userId: "me", conversationId: "c1"))
        await drainMainQueue()
        await gate.open()
        await env.bridge.awaitPendingEvents()

        let remaining = await store.conversation(id: "c1")
        XCTAssertNil(remaining, "la conversation supprimée en dernier réapparaissait")
    }

    func test_unreadUpdated_gateReadAtArrival() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))
        let gate = LaneTestGate()
        let isOpen = OSAllocatedUnfairLock(initialState: false)
        let env = OrderEnv(
            store: store,
            fetchConversation: { id, _ in
                await gate.wait()
                return nil
            },
            isConversationOpen: { _ in isOpen.withLock { $0 } }
        )

        env.restored.send(ConversationRestoredSocketEvent(userId: "me", conversationId: "c9"))
        isOpen.withLock { $0 = true }
        env.unreadUpdated.send(UnreadUpdateEvent(conversationId: "c1", unreadCount: 6))
        isOpen.withLock { $0 = false }
        await gate.open()
        await env.bridge.awaitPendingEvents()

        let served = await store.conversation(id: "c1")?.userState.unreadCount
        XCTAssertEqual(served, 0, "la conversation ouverte à l'ARRIVÉE reste à zéro")
    }
}
