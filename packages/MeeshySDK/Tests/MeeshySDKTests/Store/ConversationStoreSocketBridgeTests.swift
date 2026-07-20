import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class ConversationStoreSocketBridgeTests: XCTestCase {

    // MARK: Builders

    private func makeStore() -> ConversationStore {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("bridge-outbox-\(UUID().uuidString).db").path
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
            userState: ConversationUserState(version: 1)
        )
    }

    @MainActor
    private struct BridgeEnv {
        let bridge: ConversationStoreSocketBridge
        let conversationUpdated = PassthroughSubject<ConversationUpdatedEvent, Never>()
        let deleted = PassthroughSubject<ConversationDeletedSocketEvent, Never>()
        let prefsUpdated = PassthroughSubject<UserPreferencesConversationUpdatedSocketEvent, Never>()
        let reordered = PassthroughSubject<UserPreferencesReorderedSocketEvent, Never>()
        let readStatus = PassthroughSubject<ReadStatusUpdateEvent, Never>()
        let categoryCreated = PassthroughSubject<CategorySocketEvent, Never>()
        let categoryUpdated = PassthroughSubject<CategorySocketEvent, Never>()
        let categoryDeleted = PassthroughSubject<CategoryDeletedSocketEvent, Never>()
        let categoriesReordered = PassthroughSubject<CategoriesReorderedSocketEvent, Never>()
        let didReconnect = PassthroughSubject<Void, Never>()

        init(store: ConversationStore, categoryStore: UserCategoryStore, currentUserId: String? = "me") {
            bridge = ConversationStoreSocketBridge(
                store: store,
                categoryStore: categoryStore,
                currentUserId: { currentUserId }
            )
            bridge.activate(
                conversationUpdated: conversationUpdated.eraseToAnyPublisher(),
                conversationDeleted: deleted.eraseToAnyPublisher(),
                userPreferencesUpdated: prefsUpdated.eraseToAnyPublisher(),
                userPreferencesReordered: reordered.eraseToAnyPublisher(),
                readStatusUpdated: readStatus.eraseToAnyPublisher(),
                categoryCreated: categoryCreated.eraseToAnyPublisher(),
                categoryUpdated: categoryUpdated.eraseToAnyPublisher(),
                categoryDeleted: categoryDeleted.eraseToAnyPublisher(),
                categoriesReordered: categoriesReordered.eraseToAnyPublisher(),
                didReconnect: didReconnect.eraseToAnyPublisher()
            )
        }
    }

    private func makePrefsEvent(
        conversationId: String,
        version: Int,
        reset: Bool = false,
        isPinned: Bool = false,
        isMuted: Bool = false
    ) -> UserPreferencesConversationUpdatedSocketEvent {
        let prefs: UserPreferencesConversationUpdatedSocketEvent.Preferences? = reset ? nil : .init(
            isPinned: isPinned, isMuted: isMuted, mentionsOnly: false, isArchived: false,
            tags: [], categoryId: nil, orderInCategory: nil, customName: nil,
            reaction: nil, deletedForUserAt: nil, clearHistoryBefore: nil
        )
        return UserPreferencesConversationUpdatedSocketEvent(
            userId: "me", conversationId: conversationId, version: version, reset: reset, preferences: prefs
        )
    }

    private func makeReadEvent(
        conversationId: String,
        userId: String?,
        lastReadAt: Date?,
        unreadCount: Int?,
        type: String = "read"
    ) -> ReadStatusUpdateEvent {
        ReadStatusUpdateEvent(
            conversationId: conversationId,
            participantId: "p1",
            userId: userId,
            type: type,
            updatedAt: Date(),
            summary: ReadStatusSummary(totalMembers: 2, deliveredCount: 1, readCount: 1),
            lastReadAt: lastReadAt,
            unreadCount: unreadCount
        )
    }

    /// Poll an async condition (the routing hops through `Task { await … }`,
    /// so the store mutation lands shortly after the publisher fires).
    private func waitUntil(timeout: TimeInterval = 2, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        return await condition()
    }

    private func makeConversationUpdatedEvent(
        conversationId: String,
        lastMessageAt: Date? = nil,
        lastMessageId: String? = nil,
        lastMessagePreview: String? = nil,
        title: String? = nil
    ) -> ConversationUpdatedEvent {
        ConversationUpdatedEvent(
            conversationId: conversationId,
            title: title,
            lastMessageAt: lastMessageAt,
            lastMessageId: lastMessageId,
            lastMessagePreview: lastMessagePreview,
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
    }

    // MARK: conversation:updated

    func test_conversationUpdated_newerLastMessageAt_bumpsConversationToTop() async {
        let store = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        let t1 = Date(timeIntervalSince1970: 1_700_001_000)
        await store.hydrate(makeConv(id: "c1"))  // lastMessageAt = t0
        var c2 = makeConv(id: "c2")
        c2.lastMessageAt = t1
        await store.hydrate(c2)
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        let t2 = Date(timeIntervalSince1970: 1_700_002_000)
        env.conversationUpdated.send(makeConversationUpdatedEvent(conversationId: "c1", lastMessageAt: t2))

        let applied = await waitUntil { (await store.conversation(id: "c1"))?.lastMessageAt == t2 }
        XCTAssertTrue(applied, "bridge must route conversation:updated → applyConversationUpdated for lastMessageAt")
    }

    func test_conversationUpdated_staleLastMessageAt_dropped() async {
        let store = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        await store.hydrate(makeConv(id: "c1"))  // lastMessageAt = t0
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        let olderDate = Date(timeIntervalSince1970: 1_699_000_000)
        env.conversationUpdated.send(makeConversationUpdatedEvent(conversationId: "c1", lastMessageAt: olderDate))

        let overwritten = await waitUntil { (await store.conversation(id: "c1"))?.lastMessageAt != t0 }
        XCTAssertFalse(overwritten, "a stale lastMessageAt must not overwrite the current value")
    }

    func test_conversationUpdated_lastMessageId_andPreview_applied() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        let newAt = Date(timeIntervalSince1970: 1_700_002_000)
        env.conversationUpdated.send(makeConversationUpdatedEvent(
            conversationId: "c1",
            lastMessageAt: newAt,
            lastMessageId: "msg-99",
            lastMessagePreview: "Hello!"
        ))

        let applied = await waitUntil {
            let c = await store.conversation(id: "c1")
            return c?.lastMessageId == "msg-99" && c?.lastMessagePreview == "Hello!"
        }
        XCTAssertTrue(applied, "bridge must apply lastMessageId and lastMessagePreview from conversation:updated")
    }

    func test_conversationUpdated_metadataTitle_applied() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        env.conversationUpdated.send(makeConversationUpdatedEvent(conversationId: "c1", title: "New Group Name"))

        let applied = await waitUntil { (await store.conversation(id: "c1"))?.title == "New Group Name" }
        XCTAssertTrue(applied, "bridge must apply title updates from conversation:updated")
    }

    func test_conversationUpdated_unknownConversation_ignoredSilently() async {
        let store = makeStore()
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        let newAt = Date(timeIntervalSince1970: 1_700_002_000)
        env.conversationUpdated.send(makeConversationUpdatedEvent(conversationId: "unknown", lastMessageAt: newAt))

        // No crash, no state corruption — just wait a moment.
        try? await Task.sleep(nanoseconds: 50_000_000)
        let conv = await store.conversation(id: "unknown")
        XCTAssertNil(conv, "a conversation:updated for an unknown id must be silently ignored")
    }

    // MARK: didReconnect

    func test_didReconnect_rehydratesCategoryStore() async {
        let service = MockCategoryWriter()
        let freshCat = ConversationCategory(id: "cat-1", name: "Work", color: nil, icon: nil, order: 0, isExpanded: true)
        service.listResult = [freshCat]
        let categoryStore = UserCategoryStore(service: service)

        let env = BridgeEnv(store: makeStore(), categoryStore: categoryStore)

        env.didReconnect.send(())

        let hydrated = await waitUntil { service.listCallCount >= 1 }
        XCTAssertTrue(hydrated, "didReconnect must trigger categoryStore.hydrate() to resync server-side deletions")

        // The store must reflect the fresh list returned by the mock.
        let resynced = await waitUntil { await categoryStore.categories().contains { $0.id == "cat-1" } }
        XCTAssertTrue(resynced, "categoryStore must hold the fresh category after hydrate on reconnect")
    }

    func test_didReconnect_flushesOutbox() async throws {
        let prefs = MockPreferenceWriter()
        // First call will fail transiently so the mutation queues in the outbox.
        prefs.errorToThrow = MeeshyError.server(statusCode: 503, message: "down")
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("bridge-reconnect-\(UUID().uuidString).db").path
        let store = ConversationStore(
            preferenceService: prefs,
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: outboxPath)
        )
        await store.hydrate(makeConv(id: "c1"))
        // Pin the conversation — transient failure keeps it in the outbox.
        try await store.apply(.setPinned(true), for: "c1")
        XCTAssertEqual(prefs.calls.count, 1, "setup: transient call must have been attempted")

        // Now let the mock succeed so the flush can drain the outbox.
        prefs.errorToThrow = nil
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        env.didReconnect.send(())

        // Outbox flush retries the queued preference mutation → 2nd call.
        let flushed = await waitUntil { prefs.calls.count >= 2 }
        XCTAssertTrue(flushed, "didReconnect must trigger flushOutbox, retrying the queued preference mutation")
    }

    // MARK: ConversationStore routes

    func test_conversationDeleted_routesToApplyConversationDeleted() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        env.deleted.send(ConversationDeletedSocketEvent(userId: "u", conversationId: "c1"))

        let removed = await waitUntil { await store.conversation(id: "c1") == nil }
        XCTAssertTrue(removed, "bridge must route conversation:deleted → applyConversationDeleted")
    }

    func test_userPreferencesReordered_routesToApplyRemoteReorder() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        env.reordered.send(UserPreferencesReorderedSocketEvent(
            userId: "u",
            updates: [.init(conversationId: "c1", orderInCategory: 7)]
        ))

        let applied = await waitUntil {
            (await store.conversation(id: "c1"))?.userState.orderInCategory == 7
        }
        XCTAssertTrue(applied, "bridge must route user:preferences-reordered → applyRemoteReorder")
    }

    // MARK: user:preferences-updated (conversation scope)

    func test_userPreferencesUpdated_newerVersion_routesToApplyRemote() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))   // version 1, unpinned
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        env.prefsUpdated.send(makePrefsEvent(conversationId: "c1", version: 2, isPinned: true))

        let applied = await waitUntil {
            let s = (await store.conversation(id: "c1"))?.userState
            return s?.isPinned == true && s?.version == 2
        }
        XCTAssertTrue(applied, "bridge must route conversation-scope prefs → applyRemote")
    }

    func test_userPreferencesUpdated_staleVersion_dropped() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))   // version 1
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        // version 1 is NOT > local 1 → must be dropped, isPinned stays false.
        env.prefsUpdated.send(makePrefsEvent(conversationId: "c1", version: 1, isPinned: true))

        let pinned = await waitUntil { (await store.conversation(id: "c1"))?.userState.isPinned == true }
        XCTAssertFalse(pinned, "a non-newer version must be dropped by applyRemote")
    }

    func test_userPreferencesUpdated_reset_restoresDefaults() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        env.prefsUpdated.send(makePrefsEvent(conversationId: "c1", version: 2, isPinned: true))
        _ = await waitUntil { (await store.conversation(id: "c1"))?.userState.isPinned == true }

        env.prefsUpdated.send(makePrefsEvent(conversationId: "c1", version: 3, reset: true))

        let reset = await waitUntil {
            let s = (await store.conversation(id: "c1"))?.userState
            return s?.isPinned == false && s?.version == 3
        }
        XCTAssertTrue(reset, "reset must restore defaults while preserving the bumped version")
    }

    // MARK: read-status:updated

    func test_readStatus_currentUser_routesToApplyReadReceipt() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()), currentUserId: "me")

        let readAt = Date(timeIntervalSince1970: 1_700_001_000)
        env.readStatus.send(makeReadEvent(conversationId: "c1", userId: "me", lastReadAt: readAt, unreadCount: 0))

        let applied = await waitUntil { (await store.conversation(id: "c1"))?.userState.lastReadAt == readAt }
        XCTAssertTrue(applied, "bridge must route own read-status → applyReadReceipt")
    }

    func test_readStatus_foreignUser_ignored() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()), currentUserId: "me")

        let readAt = Date(timeIntervalSince1970: 1_700_001_000)
        // A PEER reading must NOT advance our own read cursor.
        env.readStatus.send(makeReadEvent(conversationId: "c1", userId: "someone-else", lastReadAt: readAt, unreadCount: 0))

        let leaked = await waitUntil { (await store.conversation(id: "c1"))?.userState.lastReadAt != nil }
        XCTAssertFalse(leaked, "a peer's read receipt must not touch the current user's cursor")
    }

    func test_readStatus_receivedType_ignored() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()), currentUserId: "me")

        let readAt = Date(timeIntervalSince1970: 1_700_001_000)
        // A 'received' (delivery) event must never advance the read cursor.
        env.readStatus.send(makeReadEvent(conversationId: "c1", userId: "me", lastReadAt: readAt, unreadCount: 0, type: "received"))

        let leaked = await waitUntil { (await store.conversation(id: "c1"))?.userState.lastReadAt != nil }
        XCTAssertFalse(leaked, "a 'received' delivery event must not touch the read cursor")
    }

    func test_readStatus_missingFields_ignored() async {
        let store = makeStore()
        await store.hydrate(makeConv(id: "c1"))
        let env = BridgeEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()), currentUserId: "me")

        let readAt = Date(timeIntervalSince1970: 1_700_001_000)
        // lastReadAt present but unreadCount absent (partial/legacy payload):
        // must be dropped, never coerced to a bogus unreadCount = 0.
        env.readStatus.send(makeReadEvent(conversationId: "c1", userId: "me", lastReadAt: readAt, unreadCount: nil))

        let applied = await waitUntil { (await store.conversation(id: "c1"))?.userState.lastReadAt != nil }
        XCTAssertFalse(applied, "a read event missing unreadCount must not be applied")
    }

    // MARK: UserCategoryStore routes

    func test_categoryCreated_routesToApplyRemoteCreated() async {
        let categoryStore = UserCategoryStore(service: MockCategoryWriter())
        let env = BridgeEnv(store: makeStore(), categoryStore: categoryStore)

        let cat = ConversationCategory(id: "cat-7", name: "Work", color: nil, icon: nil, order: 0, isExpanded: true)
        env.categoryCreated.send(CategorySocketEvent(userId: "u", category: cat))

        let added = await waitUntil { await categoryStore.categories().contains { $0.id == "cat-7" } }
        XCTAssertTrue(added, "bridge must route category:created → UserCategoryStore.applyRemote(.created)")
    }

    func test_categoryDeleted_routesToApplyRemoteDeleted() async {
        let categoryStore = UserCategoryStore(service: MockCategoryWriter())
        let env = BridgeEnv(store: makeStore(), categoryStore: categoryStore)
        await categoryStore.applyRemote(.created(
            ConversationCategory(id: "cat-9", name: "Temp", color: nil, icon: nil, order: 0, isExpanded: true)
        ))

        env.categoryDeleted.send(CategoryDeletedSocketEvent(userId: "u", categoryId: "cat-9"))

        let removed = await waitUntil { await categoryStore.categories().contains { $0.id == "cat-9" } == false }
        XCTAssertTrue(removed, "bridge must route category:deleted → UserCategoryStore.applyRemote(.deleted)")
    }
}
