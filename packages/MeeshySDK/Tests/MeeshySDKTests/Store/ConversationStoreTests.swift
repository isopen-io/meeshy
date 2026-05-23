import XCTest
import Combine
@testable import MeeshySDK

// MARK: - Test doubles

final class MockPreferenceWriter: ConversationPreferenceWriting, @unchecked Sendable {
    var stubbedResponse: APIConversationPreferences = APIConversationPreferences(version: 1)
    var errorToThrow: Error?
    private(set) var calls: [(String, UpdateConversationPreferencesRequest)] = []

    func updateConversationPreferences(
        conversationId: String,
        request: UpdateConversationPreferencesRequest
    ) async throws -> APIConversationPreferences {
        calls.append((conversationId, request))
        if let e = errorToThrow { throw e }
        return stubbedResponse
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
        XCTAssertEqual(await outbox.pendingCount(for: "conv-1"), 1, "Task stays in outbox for retry")
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
        XCTAssertEqual(await outbox.pendingCount(for: "conv-1"), 0, "Local-only must NOT enter outbox")
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

        let exp = expectation(description: "publisher receives optimistic + ACK")
        exp.expectedFulfillmentCount = 1
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
