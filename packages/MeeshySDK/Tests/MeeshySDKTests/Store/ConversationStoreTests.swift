import XCTest
import Combine
@testable import MeeshySDK

// MARK: - Test doubles

final class MockPreferenceWriter: ConversationPreferenceWriting, @unchecked Sendable {
    var stubbedResponse: APIConversationPreferences = APIConversationPreferences(version: 1)
    var errorToThrow: Error?
    var reorderError: Error?
    private(set) var calls: [(String, UpdateConversationPreferencesRequest)] = []
    private(set) var reorderCalls: [[(convId: String, orderInCategory: Int)]] = []

    func updateConversationPreferences(
        conversationId: String,
        request: UpdateConversationPreferencesRequest
    ) async throws -> APIConversationPreferences {
        calls.append((conversationId, request))
        if let e = errorToThrow { throw e }
        return stubbedResponse
    }

    func reorderConversations(_ updates: [(convId: String, orderInCategory: Int)]) async throws {
        reorderCalls.append(updates)
        if let e = reorderError { throw e }
    }
}

final class MockCacheReading: ConversationCacheReading, @unchecked Sendable {
    var stubbed: CacheResult<[MeeshyConversation]> = .empty
    private(set) var loadCalls = 0

    func loadConversationList() async -> CacheResult<[MeeshyConversation]> {
        loadCalls += 1
        return stubbed
    }
}

final class MockLifecycleWriter: ConversationLifecycleWriting, @unchecked Sendable {
    var errorToThrow: Error?
    private(set) var markReadCount = 0
    private(set) var markUnreadCount = 0
    private(set) var deleteForMeCount = 0
    private(set) var leaveCount = 0

    func markRead(conversationId: String) async throws {
        markReadCount += 1
        if let e = errorToThrow { throw e }
    }
    func markUnread(conversationId: String) async throws {
        markUnreadCount += 1
        if let e = errorToThrow { throw e }
    }
    func deleteForMe(conversationId: String) async throws {
        deleteForMeCount += 1
        if let e = errorToThrow { throw e }
    }
    func leave(conversationId: String) async throws {
        leaveCount += 1
        if let e = errorToThrow { throw e }
    }
}

final class MockCategoryCreating: ConversationCategoryCreating, @unchecked Sendable {
    var stubbed = ConversationCategory(id: "cat-1", name: "Cat", color: nil, icon: nil, order: 0, isExpanded: true)
    var errorToThrow: Error?
    private(set) var createCalls: [(name: String, color: String?, icon: String?)] = []

    func create(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        createCalls.append((name, color, icon))
        if let e = errorToThrow { throw e }
        return stubbed
    }
}

// MARK: - Tests

final class ConversationStoreTests: XCTestCase {

    private var cancellables: Set<AnyCancellable> = []

    override func tearDown() {
        cancellables.removeAll()
        super.tearDown()
    }

    // MARK: Builders

    private func makeStore(
        prefs: MockPreferenceWriter = MockPreferenceWriter(),
        lifecycle: MockLifecycleWriter = MockLifecycleWriter()
    ) -> (ConversationStore, MockPreferenceWriter, MockLifecycleWriter, ConversationStateOutbox) {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("store-outbox-\(UUID().uuidString).db").path
        let outbox = ConversationStateOutbox(dbPath: outboxPath)
        let store = ConversationStore(
            preferenceService: prefs,
            conversationService: lifecycle,
            outbox: outbox
        )
        return (store, prefs, lifecycle, outbox)
    }

    private func makeConv(id: String = "conv-1", version: Int = 5) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: id,
            type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(version: version)
        )
    }

    // MARK: - Hydration

    func test_hydrate_seedsConversationAndPublishesList() async {
        let (store, _, _, _) = makeStore()
        let conv = makeConv()
        await store.hydrate(conv)

        let stored = await store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.id, "conv-1")

        let list = store.listPublisher().value()
        XCTAssertEqual(list?.count, 1)
    }

    // MARK: - hydrateMetadata (version-aware merge)

    func test_hydrateMetadata_unknownConv_seedsWholesale() async {
        let (store, _, _, _) = makeStore()

        let incoming = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(isPinned: true, version: 2)
        )
        await store.hydrateMetadata([incoming])

        let stored = await store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.id, "conv-1")
        XCTAssertTrue(stored?.userState.isPinned ?? false)
        XCTAssertEqual(store.listPublisher().value()?.count, 1)
    }

    func test_hydrateMetadata_lowerIncomingVersion_preservesLocalUserStateTakesMetadata() async {
        let (store, _, _, _) = makeStore()
        // Local has an in-flight optimistic pin at version 6.
        await store.hydrate(MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct,
            title: "Old title",
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(isPinned: true, version: 6)
        ))

        // A stale server snapshot (version 5) that hasn't seen the pin yet,
        // but carries fresher metadata (newer lastMessageAt + new title).
        let serverSnapshot = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct,
            title: "New title",
            lastMessageAt: Date(timeIntervalSince1970: 1_700_009_999),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_009_999),
            userState: ConversationUserState(isPinned: false, version: 5)
        )
        await store.hydrateMetadata([serverSnapshot])

        let after = await store.conversation(id: "conv-1")!
        XCTAssertTrue(after.userState.isPinned, "Newer local optimistic userState must survive a stale refresh")
        XCTAssertEqual(after.userState.version, 6, "Local version preserved")
        XCTAssertEqual(after.title, "New title", "Incoming metadata is still taken")
        XCTAssertEqual(after.lastMessageAt, Date(timeIntervalSince1970: 1_700_009_999))
    }

    func test_hydrateMetadata_equalOrHigherIncomingVersion_takesIncomingUserState() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(isPinned: true, version: 5)
        ))

        // Server has caught up (version 6) and shows the pin removed.
        let serverSnapshot = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(isPinned: false, version: 6)
        )
        await store.hydrateMetadata([serverSnapshot])

        let after = await store.conversation(id: "conv-1")!
        XCTAssertFalse(after.userState.isPinned, "Server-authoritative state at higher version wins")
        XCTAssertEqual(after.userState.version, 6)
    }

    func test_hydrateMetadata_publishesPerConvAndList() async {
        let (store, _, _, _) = makeStore()
        let conv = makeConv()
        await store.hydrate(conv)

        var perConvEmissions = 0
        let perConv = store.publisher(for: "conv-1")
        let token = perConv?.sink { _ in perConvEmissions += 1 }
        defer { token?.cancel() }

        let updated = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct,
            title: "Updated",
            lastMessageAt: Date(timeIntervalSince1970: 1_700_111_111),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_111_111),
            userState: ConversationUserState(version: 0)
        )
        await store.hydrateMetadata([updated])

        XCTAssertGreaterThanOrEqual(perConvEmissions, 2, "initial value + post-merge emission")
        XCTAssertEqual(store.listPublisher().value()?.first?.title, "Updated")
    }

    // MARK: - apply optimistic + ACK

    func test_apply_optimisticVisibleImmediately_versionCandidateBumped() async throws {
        let (store, prefs, _, _) = makeStore()
        await store.hydrate(makeConv(version: 5))
        prefs.stubbedResponse = APIConversationPreferences(isPinned: true, version: 6)

        try await store.apply(.setPinned(true), for: "conv-1")

        let after = await store.conversation(id: "conv-1")!
        XCTAssertTrue(after.userState.isPinned)
        XCTAssertEqual(after.userState.version, 6, "ACK must overwrite the candidate version with the authoritative one")
        XCTAssertNotNil(after.userState.lastSyncedAt)
    }

    func test_apply_rollbackOnPermanent4xx() async {
        let (store, prefs, _, _) = makeStore()
        await store.hydrate(makeConv(version: 3))
        prefs.errorToThrow = MeeshyError.server(statusCode: 422, message: "bad payload")

        do {
            try await store.apply(.setPinned(true), for: "conv-1")
            XCTFail("Expected apply to throw on 4xx")
        } catch {
            // expected
        }

        let after = await store.conversation(id: "conv-1")!
        XCTAssertFalse(after.userState.isPinned, "4xx must roll back the optimistic state to snapshot")
        XCTAssertEqual(after.userState.version, 3, "Version must roll back too")
    }

    func test_apply_transientFailureKeepsOptimisticAndQueuesRetry() async throws {
        let (store, prefs, _, outbox) = makeStore()
        await store.hydrate(makeConv(version: 3))
        prefs.errorToThrow = MeeshyError.server(statusCode: 503, message: "down")

        // Transient → does NOT throw, optimistic stays, outbox retains.
        try await store.apply(.setPinned(true), for: "conv-1")
        let after = await store.conversation(id: "conv-1")!
        XCTAssertTrue(after.userState.isPinned, "Optimistic state must stay on transient failure")
        let pendingAfterTransient = await outbox.pendingCount(for: "conv-1")
        XCTAssertEqual(pendingAfterTransient, 1, "Task stays in outbox for retry")
        XCTAssertGreaterThan(after.userState.pendingMutationCount, 0)
    }

    // MARK: - Local-only mutation

    func test_apply_setLocked_bypassesOutboxAndDispatch() async throws {
        let (store, prefs, _, outbox) = makeStore()
        await store.hydrate(makeConv(version: 7))

        try await store.apply(.setLocked(true), for: "conv-1")

        let after = await store.conversation(id: "conv-1")!
        XCTAssertTrue(after.userState.isLocked)
        XCTAssertEqual(after.userState.version, 7, "Local-only must NOT bump version")
        let pendingAfterLocal = await outbox.pendingCount(for: "conv-1")
        XCTAssertEqual(pendingAfterLocal, 0, "Local-only must NOT enter outbox")
        XCTAssertEqual(prefs.calls.count, 0, "Local-only must NOT call the network")
    }

    // MARK: - Lifecycle endpoints

    func test_apply_markAsRead_callsConversationService() async throws {
        let (store, _, lifecycle, _) = makeStore()
        await store.hydrate(makeConv())

        try await store.apply(.markAsRead, for: "conv-1")
        XCTAssertEqual(lifecycle.markReadCount, 1)
    }

    func test_apply_deleteForUser_callsConversationService_andSetsDeletedAt() async throws {
        let (store, _, lifecycle, _) = makeStore()
        await store.hydrate(makeConv())

        try await store.apply(.deleteForUser, for: "conv-1")
        XCTAssertEqual(lifecycle.deleteForMeCount, 1)
        let after = await store.conversation(id: "conv-1")!
        XCTAssertNotNil(after.userState.deletedForUserAt)
    }

    // MARK: - applyRemote with version gating

    func test_applyRemote_acceptsHigherVersion_andUpdatesPrefs() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeConv(version: 4))

        let event = UserPreferencesUpdatedRemote(
            userId: "u1",
            conversationId: "conv-1",
            version: 7,
            reset: false,
            preferences: RemotePreferencesPayload(
                isPinned: true,
                isMuted: false,
                mentionsOnly: false,
                isArchived: false,
                tags: ["work"],
                categoryId: "cat-x",
                orderInCategory: 2,
                customName: nil,
                reaction: nil,
                deletedForUserAt: nil,
                clearHistoryBefore: nil
            )
        )
        await store.applyRemote(event)

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.version, 7)
        XCTAssertTrue(after.userState.isPinned)
        XCTAssertEqual(after.userState.tags, ["work"])
        XCTAssertEqual(after.userState.sectionId, "cat-x")
    }

    func test_applyRemote_dropsStaleVersion() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeConv(version: 10))

        let event = UserPreferencesUpdatedRemote(
            userId: "u1",
            conversationId: "conv-1",
            version: 5,
            reset: false,
            preferences: RemotePreferencesPayload(
                isPinned: true,
                isMuted: false,
                mentionsOnly: false,
                isArchived: false,
                tags: [],
                categoryId: nil,
                orderInCategory: nil,
                customName: nil,
                reaction: nil,
                deletedForUserAt: nil,
                clearHistoryBefore: nil
            )
        )
        await store.applyRemote(event)

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.version, 10, "Stale event must be dropped")
        XCTAssertFalse(after.userState.isPinned, "Stale event must NOT mutate prefs")
    }

    func test_applyRemote_resetTrueRestoresDefaults_andPreservesVersion() async {
        let (store, _, _, _) = makeStore()
        var conv = makeConv(version: 5)
        conv.userState.isPinned = true
        conv.userState.customName = "Pro"
        conv.userState.tags = ["a", "b"]
        await store.hydrate(conv)

        let event = UserPreferencesUpdatedRemote(
            userId: "u1",
            conversationId: "conv-1",
            version: 6,
            reset: true,
            preferences: nil
        )
        await store.applyRemote(event)

        let after = await store.conversation(id: "conv-1")!
        XCTAssertFalse(after.userState.isPinned)
        XCTAssertNil(after.userState.customName)
        XCTAssertEqual(after.userState.tags, [])
        XCTAssertEqual(after.userState.version, 6, "Reset event still bumps the version it carried")
    }

    func test_applyRemote_unknownConversation_noOps() async {
        let (store, _, _, _) = makeStore()
        let event = UserPreferencesUpdatedRemote(
            userId: "u1",
            conversationId: "never-hydrated",
            version: 3,
            reset: false,
            preferences: nil
        )
        await store.applyRemote(event)
        let none = await store.conversation(id: "never-hydrated")
        XCTAssertNil(none)
    }

    // MARK: - applyLocally pure function

    func test_applyLocally_addTag_isIdempotent() async {
        let (store, _, _, _) = makeStore()
        var state = ConversationUserState(tags: ["x"])
        state = await store.applyLocally(.addTag("x"), on: state)
        XCTAssertEqual(state.tags, ["x"])
        state = await store.applyLocally(.addTag("y"), on: state)
        XCTAssertEqual(state.tags, ["x", "y"])
    }

    func test_applyLocally_markAsRead_clearsUnreadAndStampsLastRead() async {
        let (store, _, _, _) = makeStore()
        var state = ConversationUserState(unreadCount: 12)
        state = await store.applyLocally(.markAsRead, on: state)
        XCTAssertEqual(state.unreadCount, 0)
        XCTAssertNotNil(state.lastReadAt)
    }

    // MARK: - Publisher emission

    func test_publisher_emitsSnapshotOnApply() async throws {
        let (store, prefs, _, _) = makeStore()
        await store.hydrate(makeConv(version: 1))
        prefs.stubbedResponse = APIConversationPreferences(version: 2)

        // Per Instant App Principles (CLAUDE.md → Optimistic Updates),
        // `apply` is expected to push at least two snapshots: the
        // optimistic in-flight update (still at the local version) and
        // the server-confirmed ACK (at the ACK version). We don't pin
        // the exact count — the store is free to coalesce or to emit
        // intermediate states for persistence — but the publisher MUST
        // reach the ACK version eventually.
        let exp = expectation(description: "publisher reaches ACK version")
        exp.assertForOverFulfill = false
        var received: [Bool] = []

        guard let pub = store.publisher(for: "conv-1") else {
            XCTFail("expected publisher for hydrated conv")
            return
        }
        pub.dropFirst()  // drop seeded value
            .sink { conv in
                received.append(conv.userState.isPinned)
                if conv.userState.version == 2 { exp.fulfill() }
            }
            .store(in: &cancellables)

        try await store.apply(.setPinned(true), for: "conv-1")
        await fulfillment(of: [exp], timeout: 2)
        XCTAssertTrue(received.contains(true), "publisher must surface the optimistic + final isPinned state")
    }

    // MARK: - applyReadReceipt (remote, monotone, no version bump)

    func test_applyReadReceipt_newerLastReadAt_appliesUnreadAndReadAt() async {
        let (store, _, _, _) = makeStore()
        var conv = makeConv(version: 5)
        conv.userState.unreadCount = 7
        conv.userState.lastReadAt = Date(timeIntervalSince1970: 1_000)
        await store.hydrate(conv)

        let newer = Date(timeIntervalSince1970: 2_000)
        await store.applyReadReceipt(ReadStatusEvent(conversationId: "conv-1", unreadCount: 0, lastReadAt: newer))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.unreadCount, 0)
        XCTAssertEqual(after.userState.lastReadAt, newer)
    }

    func test_applyReadReceipt_olderLastReadAt_ignored() async {
        let (store, _, _, _) = makeStore()
        var conv = makeConv()
        conv.userState.unreadCount = 3
        conv.userState.lastReadAt = Date(timeIntervalSince1970: 2_000)
        await store.hydrate(conv)

        await store.applyReadReceipt(ReadStatusEvent(conversationId: "conv-1", unreadCount: 0, lastReadAt: Date(timeIntervalSince1970: 1_000)))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.unreadCount, 3, "an older read receipt must be ignored (monotone)")
        XCTAssertEqual(after.userState.lastReadAt, Date(timeIntervalSince1970: 2_000))
    }

    func test_applyReadReceipt_doesNotBumpVersion() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeConv(version: 9))
        await store.applyReadReceipt(ReadStatusEvent(conversationId: "conv-1", unreadCount: 0, lastReadAt: Date(timeIntervalSince1970: 5_000)))
        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.version, 9, "read receipts must never touch the prefs version")
    }

    func test_applyReadReceipt_unknownConversation_noop() async {
        let (store, _, _, _) = makeStore()
        await store.applyReadReceipt(ReadStatusEvent(conversationId: "ghost", unreadCount: 0, lastReadAt: Date()))
        let after = await store.conversation(id: "ghost")
        XCTAssertNil(after)
    }

    // MARK: - applyConversationDeleted

    func test_applyConversationDeleted_removesFromStoreAndList() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeConv(id: "conv-1"))
        await store.hydrate(makeConv(id: "conv-2"))

        await store.applyConversationDeleted(ConversationDeletedEvent(conversationId: "conv-1"))

        let gone = await store.conversation(id: "conv-1")
        XCTAssertNil(gone)
        let list: [MeeshyConversation] = store.listPublisher().value() ?? []
        XCTAssertEqual(list.map(\.id), ["conv-2"])
    }

    func test_applyConversationDeleted_unknownConversation_noop() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeConv(id: "conv-1"))
        await store.applyConversationDeleted(ConversationDeletedEvent(conversationId: "ghost"))
        let list: [MeeshyConversation] = store.listPublisher().value() ?? []
        XCTAssertEqual(list.count, 1)
    }

    // MARK: - applyConversationUpdated

    func test_applyConversationUpdated_newerLastMessageAt_advances() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = t0
        await store.hydrate(conv)

        let t1 = Date(timeIntervalSince1970: 1_700_001_000)
        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: t1
        ))

        let updatedConv = await store.conversation(id: "conv-1")
        XCTAssertEqual(updatedConv?.lastMessageAt, t1)
    }

    func test_applyConversationUpdated_staleLastMessageAt_wholeMessageGroupSkipped() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = t0
        conv.lastMessageId = "msg-current"
        conv.lastMessagePreview = "current preview"
        await store.hydrate(conv)

        let older = Date(timeIntervalSince1970: 1_699_000_000)
        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: older,
            lastMessageId: "msg-stale",
            lastMessagePreview: "stale preview"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageAt, t0, "stale lastMessageAt must not overwrite")
        XCTAssertEqual(after.lastMessageId, "msg-current",
                       "a stale broadcast must not overwrite the id paired with the newer timestamp")
        XCTAssertEqual(after.lastMessagePreview, "current preview",
                       "a stale broadcast must not overwrite the preview paired with the newer timestamp")
    }

    func test_applyConversationUpdated_staleLastMessageAt_unrelatedFieldsStillApplied() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = t0
        await store.hydrate(conv)

        let older = Date(timeIntervalSince1970: 1_699_000_000)
        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: older,
            title: "Renamed Group"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageAt, t0, "stale lastMessageAt must not overwrite")
        XCTAssertEqual(after.title, "Renamed Group", "fields unrelated to message ordering still apply")
    }

    func test_applyConversationUpdated_lastMessageIdAndPreview_applied() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeConv(id: "conv-1"))

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageId: "msg-99",
            lastMessagePreview: "Hello world"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageId, "msg-99")
        XCTAssertEqual(after.lastMessagePreview, "Hello world")
    }

    func test_applyConversationUpdated_titleAndAvatar_applied() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeConv(id: "conv-1"))

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            title: "New Group Name",
            avatar: "https://cdn.meeshy.me/avatar.jpg"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.title, "New Group Name")
        XCTAssertEqual(after.avatar, "https://cdn.meeshy.me/avatar.jpg")
    }

    func test_applyConversationUpdated_unknownConversation_noop() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeConv(id: "conv-1"))

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "ghost",
            lastMessageAt: Date()
        ))

        let list: [MeeshyConversation] = store.listPublisher().value() ?? []
        XCTAssertEqual(list.count, 1, "unknown conversation must not be inserted or crash")
    }

    func test_applyConversationUpdated_allNilFields_doesNotMutateExistingState() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeConv(id: "conv-1"))
        // Establish a known title.
        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            title: "Known Title"
        ))

        // Fire an all-nil event — must not clear the title.
        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1"
        ))

        let convAfterNilEvent = await store.conversation(id: "conv-1")
        XCTAssertEqual(convAfterNilEvent?.title, "Known Title",
                       "all-nil event must not overwrite existing field values")
    }

    // MARK: - createSectionAndAssign (composite: create category + assign)

    private func makeStoreWithCategory(
        category: MockCategoryCreating,
        prefs: MockPreferenceWriter = MockPreferenceWriter()
    ) -> ConversationStore {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("store-outbox-\(UUID().uuidString).db").path
        return ConversationStore(
            preferenceService: prefs,
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: outboxPath),
            categoryService: category
        )
    }

    func test_createSectionAndAssign_createsCategoryThenAssignsSection() async throws {
        let category = MockCategoryCreating()
        category.stubbed = ConversationCategory(id: "cat-99", name: "Work", color: "#FF0000", icon: "star", order: 0, isExpanded: true)
        let prefs = MockPreferenceWriter()
        prefs.stubbedResponse = APIConversationPreferences(version: 6)
        let store = makeStoreWithCategory(category: category, prefs: prefs)
        await store.hydrate(makeConv(id: "conv-1"))

        try await store.createSectionAndAssign(name: "Work", color: "#FF0000", icon: "star", toConversation: "conv-1")

        XCTAssertEqual(category.createCalls.count, 1)
        XCTAssertEqual(category.createCalls.first?.name, "Work")
        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.sectionId, "cat-99", "the conversation must be assigned to the freshly created category")
    }

    func test_createSectionAndAssign_unknownConversation_throwsAndDoesNotCreate() async {
        let category = MockCategoryCreating()
        let store = makeStoreWithCategory(category: category)
        do {
            try await store.createSectionAndAssign(name: "X", color: nil, icon: nil, toConversation: "ghost")
            XCTFail("expected throw for unknown conversation")
        } catch {
            // expected
        }
        XCTAssertEqual(category.createCalls.count, 0, "must not create a category for an unknown conversation")
    }

    // MARK: - hydrateFromCache

    private func makeStoreWithCache(_ cache: MockCacheReading) -> ConversationStore {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("store-outbox-\(UUID().uuidString).db").path
        return ConversationStore(
            preferenceService: MockPreferenceWriter(),
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: outboxPath),
            cache: cache
        )
    }

    func test_hydrateFromCache_fresh_hydratesList() async {
        let cache = MockCacheReading()
        cache.stubbed = .fresh([makeConv(id: "c1"), makeConv(id: "c2")], age: 1)
        let store = makeStoreWithCache(cache)
        await store.hydrateFromCache()
        let list: [MeeshyConversation] = store.listPublisher().value() ?? []
        XCTAssertEqual(Set(list.map(\.id)), ["c1", "c2"])
    }

    func test_hydrateFromCache_stale_hydratesList() async {
        let cache = MockCacheReading()
        cache.stubbed = .stale([makeConv(id: "c1")], age: 99)
        let store = makeStoreWithCache(cache)
        await store.hydrateFromCache()
        let stored = await store.conversation(id: "c1")
        XCTAssertNotNil(stored, "stale cache must still hydrate the store (serve immediately)")
    }

    func test_hydrateFromCache_empty_noop() async {
        let cache = MockCacheReading()
        cache.stubbed = .empty
        let store = makeStoreWithCache(cache)
        await store.hydrateFromCache()
        let list: [MeeshyConversation] = store.listPublisher().value() ?? []
        XCTAssertTrue(list.isEmpty)
    }

    // MARK: - reorderConversations (optimistic + rollback)

    private func makeStoreWithPrefs(_ prefs: MockPreferenceWriter) -> ConversationStore {
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("store-outbox-\(UUID().uuidString).db").path
        return ConversationStore(
            preferenceService: prefs,
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: outboxPath)
        )
    }

    func test_reorderConversations_appliesOrderOptimisticallyAndCallsService() async throws {
        let prefs = MockPreferenceWriter()
        let store = makeStoreWithPrefs(prefs)
        await store.hydrate(makeConv(id: "c1"))
        await store.hydrate(makeConv(id: "c2"))

        try await store.reorderConversations([(convId: "c1", orderInCategory: 1), (convId: "c2", orderInCategory: 0)])

        let c1 = await store.conversation(id: "c1")!
        let c2 = await store.conversation(id: "c2")!
        XCTAssertEqual(c1.userState.orderInCategory, 1)
        XCTAssertEqual(c2.userState.orderInCategory, 0)
        XCTAssertEqual(prefs.reorderCalls.count, 1)
        XCTAssertEqual(prefs.reorderCalls.first?.count, 2)
    }

    func test_reorderConversations_serviceFailure_rollsBack() async {
        let prefs = MockPreferenceWriter()
        prefs.reorderError = MeeshyError.server(statusCode: 500, message: "boom")
        let store = makeStoreWithPrefs(prefs)
        var conv = makeConv(id: "c1")
        conv.userState.orderInCategory = 5
        await store.hydrate(conv)

        do {
            try await store.reorderConversations([(convId: "c1", orderInCategory: 9)])
            XCTFail("expected throw on service failure")
        } catch {
            // expected
        }

        let after = await store.conversation(id: "c1")!
        XCTAssertEqual(after.userState.orderInCategory, 5, "a failed reorder must roll back to the prior order")
    }

    func test_applyRemoteReorder_updatesLocalOrderWithoutCallingService() async {
        let prefs = MockPreferenceWriter()
        let store = makeStoreWithPrefs(prefs)
        await store.hydrate(makeConv(id: "c1"))
        await store.hydrate(makeConv(id: "c2"))

        await store.applyRemoteReorder([(convId: "c1", orderInCategory: 2), (convId: "c2", orderInCategory: 5)])

        let c1 = await store.conversation(id: "c1")!
        let c2 = await store.conversation(id: "c2")!
        XCTAssertEqual(c1.userState.orderInCategory, 2)
        XCTAssertEqual(c2.userState.orderInCategory, 5)
        XCTAssertEqual(prefs.reorderCalls.count, 0, "a remote reorder must NOT call the reorder service")
    }

    func test_applyRemoteReorder_unknownConversation_skipped() async {
        let store = makeStoreWithPrefs(MockPreferenceWriter())
        await store.hydrate(makeConv(id: "c1"))
        await store.applyRemoteReorder([(convId: "ghost", orderInCategory: 9), (convId: "c1", orderInCategory: 3)])
        let c1 = await store.conversation(id: "c1")!
        XCTAssertEqual(c1.userState.orderInCategory, 3)
        let ghost = await store.conversation(id: "ghost")
        XCTAssertNil(ghost)
    }
}

// MARK: - Tiny helper to read CurrentValueSubject from a publisher

private extension Publisher where Failure == Never {
    /// Synchronous read of a `CurrentValueSubject` via its erased
    /// publisher. Used in tests where we know the underlying type.
    func value<T>() -> T? where Output == T {
        var captured: T?
        let token = sink { captured = $0 }
        token.cancel()
        return captured
    }
}
