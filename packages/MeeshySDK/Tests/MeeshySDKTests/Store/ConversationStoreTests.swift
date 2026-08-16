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

    /// Jumeau RENOMMABLE de `makeConv`. Le type par défaut du fixture est
    /// `.direct` — choix hérité, sans rapport avec les tests qui l'utilisent —
    /// et le titre d'un DM n'est PAS celui de la base (`merging` l'ignore
    /// désormais, cf. `test_merging_directConversation_neverTakesTheRawTitle`).
    /// Tout test dont le sujet est « une métadonnée s'applique » doit donc
    /// partir d'ici, pas de `makeConv`.
    private func makeGroupConv(id: String = "conv-1", version: Int = 5) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: id,
            type: .group,
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

    // MARK: - hydrateMetadata : le non-lu échappe au garde-fou de version
    //
    // `applyReadReceipt` (et le zéro posé à l'ouverture d'une conversation) ne
    // bumpent JAMAIS `version` — le versionnement est réservé aux préférences.
    // Le garde-fou `existing.version > incoming.version` est donc faux à
    // l'égalité, et l'instantané entrant repassait tel quel : un cache en
    // retard d'une lecture locale ressuscitait la pastille DANS le store, qui
    // la regreffait ensuite sur la ligne à sa prochaine republication. C'est le
    // va-et-vient 0 ↔ 99 vu à l'ouverture d'une conversation.

    /// `unreadCount:` et `userState:` sont exclusifs sur l'init de
    /// `MeeshyConversation` (le second gagne) — ce constructeur ne pose donc
    /// le compteur QUE par `userState`, sans quoi les cas ci-dessous
    /// passeraient tous pour la mauvaise raison.
    private func makeUnreadConv(
        unread: Int,
        lastMessageAt: Date,
        lastReadAt: Date? = nil,
        version: Int = 5
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct,
            lastMessageAt: lastMessageAt,
            createdAt: lastMessageAt, updatedAt: lastMessageAt,
            userState: ConversationUserState(
                unreadCount: unread, lastReadAt: lastReadAt, version: version
            )
        )
    }

    func test_hydrateMetadata_doesNotResurrectAnUnreadClearedLocally() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        await store.hydrate(makeUnreadConv(unread: 99, lastMessageAt: t0))
        // La lecture locale : compteur à zéro, frontière posée APRÈS le dernier
        // message connu. Aucun bump de version — c'est tout le piège.
        await store.applyReadReceipt(ReadStatusEvent(
            conversationId: "conv-1", unreadCount: 0, lastReadAt: t0.addingTimeInterval(1)
        ))

        // Instantané de cache encore au compte d'avant, à la MÊME version.
        await store.hydrateMetadata([makeUnreadConv(unread: 99, lastMessageAt: t0)])

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.unreadCount, 0,
                       "la frontière locale est postérieure au dernier message : le compteur entrant est en retard, pas neuf")
    }

    func test_hydrateMetadata_takesTheIncomingUnread_whenANewerMessageArrived() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        await store.hydrate(makeUnreadConv(unread: 0, lastMessageAt: t0))
        await store.applyReadReceipt(ReadStatusEvent(
            conversationId: "conv-1", unreadCount: 0, lastReadAt: t0.addingTimeInterval(1)
        ))

        // Un message VRAIMENT plus récent que la frontière : la règle se répare
        // toute seule et ne peut pas masquer durablement un vrai non-lu.
        await store.hydrateMetadata([
            makeUnreadConv(unread: 3, lastMessageAt: t0.addingTimeInterval(60))
        ])

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.unreadCount, 3)
    }

    func test_hydrateMetadata_keepsTheNewerReadFrontier_fromEitherSide() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        await store.hydrate(makeUnreadConv(unread: 0, lastMessageAt: t0))
        await store.applyReadReceipt(ReadStatusEvent(
            conversationId: "conv-1", unreadCount: 0, lastReadAt: t0.addingTimeInterval(10)
        ))

        // Le cache porte une frontière PLUS RÉCENTE (une lecture faite depuis
        // une autre surface, déjà persistée). La reprendre du local sans
        // comparer la ferait reculer — une frontière de lecture est monotone.
        await store.hydrateMetadata([
            makeUnreadConv(unread: 0, lastMessageAt: t0, lastReadAt: t0.addingTimeInterval(30))
        ])

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.userState.lastReadAt, t0.addingTimeInterval(30))
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
            lastMessage: .replaced("msg-stale"),
            lastMessagePreview: "stale preview"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageAt, t0, "stale lastMessageAt must not overwrite")
        XCTAssertEqual(after.lastMessageId, "msg-current",
                       "a stale broadcast must not overwrite the id paired with the newer timestamp")
        XCTAssertEqual(after.lastMessagePreview, "current preview",
                       "a stale broadcast must not overwrite the preview paired with the newer timestamp")
    }

    // MARK: - Un aperçu RECALCULÉ a le droit de reculer
    //
    // La garde monotone ci-dessus lit tout recul comme la marque d'un message
    // périmé. C'en est une pour un événement message-driven ; c'en est une
    // FAUSSE pour un recalcul serveur, qui recule légitimement sur deux chemins
    // NOMINAUX : supprimer le dernier message pour tous (la ligne redescend sur
    // le message précédent) et masquer son propre dernier message visible (le
    // remplaçant est plus ancien par construction). Du seul contenu, les deux
    // sont indiscernables — c'est pourquoi le serveur le DÉCLARE.

    func test_applyConversationUpdated_recalculatedPreview_appliesEvenWhenItMovesBackwards() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = t0
        conv.lastMessageId = "msg-latest"
        conv.lastMessagePreview = "le dernier message"
        await store.hydrate(conv)

        // Le dernier message vient d'être supprimé pour tous : le serveur
        // recalcule et sert le PRÉCÉDENT, donc plus ancien.
        let previous = Date(timeIntervalSince1970: 1_699_000_000)
        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: previous,
            lastMessage: .replaced("msg-previous"),
            lastMessagePreview: "celui d avant",
            previewRecalculated: true
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageAt, previous,
                       "a declared recalculation must be allowed to move the row DOWN the list")
        XCTAssertEqual(after.lastMessageId, "msg-previous",
                       "the recalculated id must replace the deleted message's")
        XCTAssertEqual(after.lastMessagePreview, "celui d avant",
                       "the row must stop rendering the preview of a message that no longer exists")
    }

    /// La contre-épreuve, et elle porte la raison d'être du drapeau : le MÊME
    /// payload, au même recul, sans la déclaration du serveur, reste jeté. Sans
    /// ce témoin, un correctif qui aurait simplement supprimé la garde
    /// monotone passerait pour bon.
    func test_applyConversationUpdated_backwardsWithoutRecalcFlag_staysRejected() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = t0
        conv.lastMessageId = "msg-latest"
        conv.lastMessagePreview = "le dernier message"
        await store.hydrate(conv)

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: Date(timeIntervalSince1970: 1_699_000_000),
            lastMessage: .replaced("msg-previous"),
            lastMessagePreview: "celui d avant"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageAt, t0,
                       "an undeclared payload is still a stale broadcast — the guard must hold")
        XCTAssertEqual(after.lastMessageId, "msg-latest")
        XCTAssertEqual(after.lastMessagePreview, "le dernier message")
    }

    /// Le Prisme appartient au même groupe : un recalcul qui recule doit aussi
    /// périmer la carte de traductions, sans quoi la ligne rendrait le texte
    /// TRADUIT du message supprimé sous l'aperçu du message précédent — le
    /// résolveur préfère la traduction à l'aperçu brut.
    func test_applyConversationUpdated_recalculatedPreview_carriesThePrismBackwardsToo() async {
        let (store, _, _, _) = makeStore()
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = Date(timeIntervalSince1970: 1_700_000_000)
        conv.lastMessageId = "msg-latest"
        conv.lastMessagePreview = "le dernier message"
        conv.lastMessageTranslations = ["fr": "le dernier message"]
        conv.lastMessageOriginalLanguage = "en"
        await store.hydrate(conv)

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: Date(timeIntervalSince1970: 1_699_000_000),
            lastMessage: .replaced("msg-previous"),
            lastMessagePreview: "celui d avant",
            lastMessageTranslations: .replaced(["fr": "celui d avant"]),
            lastMessageOriginalLanguage: "en",
            previewRecalculated: true
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageTranslations, ["fr": "celui d avant"],
                       "the prism belongs to the same group — a recalculation must carry it too")
    }

    // MARK: - Prisme de la ligne de liste après une édition
    //
    // Le défaut fermé ici : après une ÉDITION, la ligne de liste affichait le
    // texte D'AVANT, indéfiniment. `resolvedLastMessagePreview` PRÉFÈRE la
    // traduction hydratée par `GET /conversations` à `lastMessagePreview` ; le
    // gateway périme `Message.translations` dans la même écriture que
    // l'édition, mais rien sur le fil ne le disait, et la carte de l'ANCIEN
    // texte restait la valeur rendue.

    func test_applyConversationUpdated_edit_sameTimestamp_appliesPreviewGroup() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = t0
        conv.lastMessageId = "msg-1"
        conv.lastMessagePreview = "Hello"
        await store.hydrate(conv)

        // Une édition ne crée pas un nouveau message : `createdAt` est INCHANGÉ.
        // Un `>` strict jetait donc tout le groupe sur le seul chemin qui en
        // avait besoin.
        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: t0,
            lastMessage: .replaced("msg-1"),
            lastMessagePreview: "Hello (edited)"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessagePreview, "Hello (edited)",
                       "an edit carries the SAME lastMessageAt — equal is not stale")
    }

    func test_applyConversationUpdated_replacedEmptyMap_expiresStaleTranslations() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = t0
        conv.lastMessagePreview = "Hello"
        conv.lastMessageTranslations = ["fr": "Bonjour"]
        conv.lastMessageOriginalLanguage = "en"
        await store.hydrate(conv)

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: t0,
            lastMessagePreview: "Hello (edited)",
            lastMessageTranslations: .replaced([:]),
            lastMessageOriginalLanguage: "en"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertNil(after.lastMessageTranslations,
                     "a received empty map expires the stale one — the row must fall back to the original")
        XCTAssertEqual(after.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Hello (edited)",
                       "the row must render the NEW text, not the pre-edit translation")
    }

    func test_applyConversationUpdated_replacedMap_installsReaderPrism() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = t0
        await store.hydrate(conv)

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: t0,
            lastMessagePreview: "Hello",
            lastMessageTranslations: .replaced(["fr": "Bonjour"]),
            lastMessageOriginalLanguage: "en"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageTranslations, ["fr": "Bonjour"])
        XCTAssertEqual(after.lastMessageOriginalLanguage, "en")
    }

    // Un renommage ne parle pas d'aperçu : la clé est absente du payload et la
    // carte ne doit PAS être touchée, sinon la ligne retomberait sur l'original
    // alors que rien du dernier message n'a changé.
    func test_applyConversationUpdated_unchangedTranslations_leavesPrismAlone() async {
        let (store, _, _, _) = makeStore()
        var conv = makeGroupConv(id: "conv-1")
        conv.lastMessageTranslations = ["fr": "Bonjour"]
        conv.lastMessageOriginalLanguage = "en"
        await store.hydrate(conv)

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            title: "Renamed"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.title, "Renamed")
        XCTAssertEqual(after.lastMessageTranslations, ["fr": "Bonjour"],
                       "a metadata-only update must not expire the prism")
    }

    func test_applyConversationUpdated_staleLastMessageAt_leavesPrismAlone() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = t0
        conv.lastMessageTranslations = ["fr": "Bonjour"]
        await store.hydrate(conv)

        let older = Date(timeIntervalSince1970: 1_699_000_000)
        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: older,
            lastMessagePreview: "stale",
            lastMessageTranslations: .replaced([:])
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageTranslations, ["fr": "Bonjour"],
                       "the prism belongs to the monotone group — a stale payload must not expire it")
    }

    func test_applyConversationUpdated_staleLastMessageAt_unrelatedFieldsStillApplied() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeGroupConv(id: "conv-1")
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
            lastMessage: .replaced("msg-99"),
            lastMessagePreview: "Hello world"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageId, "msg-99")
        XCTAssertEqual(after.lastMessagePreview, "Hello world")
    }

    // MARK: - « Ce lecteur n'a plus AUCUN message visible ici »
    //
    // Un cran au-delà du recul autorisé par `previewRecalculated` : le lecteur
    // masque POUR LUI (suppression pour soi, purge d'historique) le dernier
    // message qui lui restait. Le serveur n'a plus de remplaçant à servir et
    // envoie tout le groupe d'aperçu à `null`.
    //
    // Lu à travers des `Optional`, ce payload ne dit RIEN : chaque `if let` le
    // jette, et la ligne garde l'aperçu de ce qui vient de disparaître —
    // définitivement, puisque plus rien ne bougera dans cette conversation pour
    // le remplacer. D'où le tri-état `LastMessageIdentity`, seul champ du
    // groupe dont l'ABSENCE et la NULLITÉ se distinguent sur le fil.

    /// Le fond du sujet : le texte s'en va, et il s'en va ENTIÈREMENT.
    func test_applyConversationUpdated_clearedLastMessage_voidsTheWholePreviewGroup() async {
        let (store, _, _, _) = makeStore()
        var conv = makeConv(id: "conv-1")
        conv.lastMessageId = "msg-only"
        conv.lastMessagePreview = "le seul message"
        conv.lastMessageTranslations = ["fr": "le seul message"]
        conv.lastMessageOriginalLanguage = "en"
        conv.lastMessageSenderName = "Windie"
        conv.lastMessageAttachments = [MeeshyMessageAttachment(id: "att-1")]
        conv.lastMessageAttachmentCount = 1
        conv.lastMessageLocation = SharedPlace(latitude: 48.85, longitude: 2.29, name: "Tour Eiffel")
        conv.lastMessageIsBlurred = true
        conv.lastMessageIsViewOnce = true
        conv.lastMessageExpiresAt = Date(timeIntervalSince1970: 1_800_000_000)
        await store.hydrate(conv)

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: nil,
            lastMessage: .replaced(nil),
            lastMessagePreview: nil,
            lastMessageTranslations: .replaced([:]),
            previewRecalculated: true
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertNil(after.lastMessageId)
        XCTAssertNil(after.lastMessagePreview)
        XCTAssertNil(after.lastMessageTranslations)
        XCTAssertNil(after.lastMessageOriginalLanguage)
        XCTAssertNil(after.lastMessageSenderName)
        XCTAssertTrue(after.lastMessageAttachments.isEmpty)
        XCTAssertEqual(after.lastMessageAttachmentCount, 0)
        XCTAssertNil(after.lastMessageLocation)
        // Le libellé composé par `lastMessageSummaryKind` vit dans ces trois
        // drapeaux : les laisser ferait dire « Message expiré » à une ligne qui
        // n'a plus de message du tout.
        XCTAssertFalse(after.lastMessageIsBlurred)
        XCTAssertFalse(after.lastMessageIsViewOnce)
        XCTAssertNil(after.lastMessageExpiresAt)
        XCTAssertNil(after.resolvedLastMessagePreview(preferredLanguages: ["fr", "en"]),
                     "la ligne ne doit plus rien avoir à rendre, dans aucune langue du prisme")
    }

    // MARK: - L'épingle de position suit le message qu'elle décrit (cycle 50)
    //
    // Le store ignorait `location` de bout en bout : le champ n'existait pas
    // sur `ConversationUpdatedStoreEvent`. L'épingle posée par un
    // `GET /conversations` restait donc en place sous l'aperçu de TOUS les
    // messages suivants — et comme cette même fonction écrit le cache disque
    // (`ConversationSyncEngine`), elle survivait au redémarrage.

    /// Un message ordinaire succède à un partage de position : l'épingle
    /// s'éteint. C'est le cas que la clé omise laissait faux, et il se lit
    /// comme un bug — la ligne annonce un lieu que le message qu'elle décrit ne
    /// porte pas.
    func test_applyConversationUpdated_plainMessageAfterAPlace_extinguishesThePin() async {
        let (store, _, _, _) = makeStore()
        var conv = makeConv(id: "conv-1")
        conv.lastMessageId = "msg-place"
        conv.lastMessagePreview = ""
        conv.lastMessageLocation = SharedPlace(latitude: 48.85, longitude: 2.29, name: "Tour Eiffel")
        await store.hydrate(conv)

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_100),
            lastMessage: .replaced("msg-plain"),
            lastMessagePreview: "Je suis arrivé",
            location: nil
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageId, "msg-plain")
        XCTAssertEqual(after.lastMessagePreview, "Je suis arrivé")
        XCTAssertNil(after.lastMessageLocation,
                     "l'épingle du message précédent ne doit pas survivre à son remplacement")
    }

    /// Le versant qui ALLUME l'épingle : un partage de position arrivé en
    /// temps réel doit rendre sa ligne. Un message position-seule a un aperçu
    /// VIDE — sans ce champ, la ligne n'a strictement rien à afficher.
    func test_applyConversationUpdated_incomingPlace_lightsThePin() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeConv(id: "conv-1"))

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_100),
            lastMessage: .replaced("msg-place"),
            lastMessagePreview: "",
            location: SharedPlace(latitude: 48.85, longitude: 2.29, name: "Tour Eiffel")
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageLocation?.name, "Tour Eiffel")
    }

    /// La contre-épreuve, et le défaut SYMÉTRIQUE — bien plus visible que
    /// celui qu'on ferme. Un renommage ne parle pas du dernier message :
    /// `lastMessage` reste `.unchanged`, l'affectation n'est jamais atteinte,
    /// et l'épingle légitime reste en place. Sans cette garde, changer le titre
    /// d'une conversation effacerait l'épingle de sa ligne.
    /// Part de `makeGroupConv` et NON de `makeConv` : le fixture par défaut est
    /// `.direct`, dont `merging` ignore désormais le `title` (#3099 — le titre
    /// client d'un DM est le nom du participant, pas celui de la base). Sur une
    /// conversation directe, l'assertion de titre ci-dessous tomberait, et —
    /// bien pire — le témoin deviendrait VACUEUX : la ligne conserverait son
    /// épingle parce que l'événement entier n'aurait rien fait, et non parce
    /// que le vidage est correctement borné à la branche du dernier message.
    /// C'est le titre appliqué qui prouve que l'événement a bien traversé.
    func test_applyConversationUpdated_renameOnly_leavesThePinAlone() async {
        let (store, _, _, _) = makeStore()
        var conv = makeGroupConv(id: "conv-1")
        conv.lastMessageId = "msg-place"
        conv.lastMessageLocation = SharedPlace(latitude: 48.85, longitude: 2.29, name: "Tour Eiffel")
        await store.hydrate(conv)

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            title: "Nouveau nom"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.title, "Nouveau nom")
        XCTAssertEqual(after.lastMessageLocation?.name, "Tour Eiffel",
                       "un événement de métadonnées ne dit rien du dernier message")
    }

    /// Le rang de la ligne survit au vidage. `Conversation.lastMessageAt` est
    /// une donnée GLOBALE, non nullable en base, qu'un masquage PERSONNEL ne
    /// change pour personne : un `GET /conversations` juste après rendrait la
    /// valeur conservée ici. La reculer ferait plonger la ligne au fond de la
    /// liste jusqu'à la synchro suivante, qui la remonterait.
    func test_applyConversationUpdated_clearedLastMessage_keepsTheRowsRank() async {
        let (store, _, _, _) = makeStore()
        let t0 = Date(timeIntervalSince1970: 1_700_000_000)
        var conv = makeConv(id: "conv-1")
        conv.lastMessageAt = t0
        conv.lastMessageId = "msg-only"
        conv.lastMessagePreview = "le seul message"
        await store.hydrate(conv)

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessage: .replaced(nil),
            previewRecalculated: true
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.lastMessageAt, t0)
        XCTAssertNil(after.lastMessagePreview)
    }

    /// Contre-épreuve indispensable : un renommage n'emporte AUCUNE clé
    /// `lastMessage*`. Confondre son silence avec un vidage effacerait l'aperçu
    /// de toutes les lignes à chaque changement de titre ou d'avatar — le
    /// défaut symétrique, et bien plus visible que celui qu'on ferme ici.
    func test_applyConversationUpdated_metadataOnly_leavesThePreviewGroupAlone() async {
        let (store, _, _, _) = makeStore()
        var conv = makeGroupConv(id: "conv-1")
        conv.lastMessageId = "msg-only"
        conv.lastMessagePreview = "le seul message"
        conv.lastMessageTranslations = ["fr": "le seul message"]
        await store.hydrate(conv)

        await store.applyConversationUpdated(ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            title: "Renamed"
        ))

        let after = await store.conversation(id: "conv-1")!
        XCTAssertEqual(after.title, "Renamed")
        XCTAssertEqual(after.lastMessageId, "msg-only")
        XCTAssertEqual(after.lastMessagePreview, "le seul message")
        XCTAssertEqual(after.lastMessageTranslations, ["fr": "le seul message"])
    }

    /// Un doublon d'événement ne republie pas la ligne : `merging` rend `nil`
    /// quand il n'y avait déjà plus rien à vider. Sans cette borne, chaque
    /// re-livraison d'un vidage traverserait le store, le cache disque et le
    /// rendu pour n'y rien changer.
    func test_merging_clearedLastMessage_twice_secondIsANoop() {
        var conv = makeConv(id: "conv-1")
        conv.lastMessageId = "msg-only"
        conv.lastMessagePreview = "le seul message"

        let cleared = ConversationUpdatedStoreEvent(
            conversationId: "conv-1",
            lastMessage: .replaced(nil),
            previewRecalculated: true
        )

        let first = ConversationStore.merging(conv, with: cleared)
        XCTAssertNotNil(first, "le premier vidage change bien quelque chose")
        XCTAssertNil(ConversationStore.merging(first!, with: cleared),
                     "le second n'a plus rien à vider — il ne doit pas republier la ligne")
    }

    // MARK: - `title` sur un DM — le titre de la base n'est pas celui de la ligne

    /// Le titre client d'un DM est le nom du participant d'en face
    /// (`APIConversation.toConversation` écarte explicitement le titre de la
    /// base). Le payload socket porte le titre BRUT : le greffer remplace le nom
    /// affiché par un libellé que personne ne voit ailleurs.
    ///
    /// `ConversationListViewModel` garde ce cas depuis le 2026-07-04. Cette
    /// copie-ci ne le gardait pas — et c'est elle qui écrit le CACHE DISQUE via
    /// `ConversationSyncEngine.applyingConversationUpdate`, donc celle qui
    /// gagnait : le cache réécrit rediffuse la liste à l'écran, et le nom greffé
    /// survivait au redémarrage.
    func test_merging_directConversation_neverTakesTheRawTitle() {
        var conv = makeConv(id: "conv-1")
        conv.title = "Sandra Raveloson"

        let merged = ConversationStore.merging(
            conv,
            with: ConversationUpdatedStoreEvent(conversationId: "conv-1", title: "Sany")
        )

        XCTAssertNil(
            merged,
            "un renommage seul ne change RIEN sur un DM — la ligne ne doit même pas être republiée"
        )
    }

    /// Contre-épreuve indispensable : la garde vise le TITRE d'un DM, pas les
    /// métadonnées d'un DM en général. Un avatar de groupe partagé, un mode
    /// lent, une bannière continuent de s'appliquer — sinon on remplacerait un
    /// nom écrasé par un DM entièrement sourd aux métadonnées.
    func test_merging_directConversation_stillTakesEveryOtherMetadataField() throws {
        var conv = makeConv(id: "conv-1")
        conv.title = "Sandra Raveloson"

        let merged = try XCTUnwrap(ConversationStore.merging(
            conv,
            with: ConversationUpdatedStoreEvent(
                conversationId: "conv-1",
                title: "Sany",
                avatar: "https://cdn.meeshy.me/a.jpg",
                slowModeSeconds: 12
            )
        ))

        XCTAssertEqual(merged.title, "Sandra Raveloson", "le nom du participant survit au payload")
        XCTAssertEqual(merged.avatar, "https://cdn.meeshy.me/a.jpg")
        XCTAssertEqual(merged.slowModeSeconds, 12)
    }

    /// L'autre moitié de la garde : une conversation RENOMMABLE prend bien son
    /// titre. Sans ce témoin, poser `conv.type != .direct` à l'envers — ou
    /// supprimer la branche — passerait au vert.
    func test_merging_groupConversation_takesTheIncomingTitle() {
        let merged = ConversationStore.merging(
            makeGroupConv(id: "conv-1"),
            with: ConversationUpdatedStoreEvent(conversationId: "conv-1", title: "Équipe Produit")
        )

        XCTAssertEqual(merged?.title, "Équipe Produit")
    }

    func test_applyConversationUpdated_titleAndAvatar_applied() async {
        let (store, _, _, _) = makeStore()
        await store.hydrate(makeGroupConv(id: "conv-1"))

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
        await store.hydrate(makeGroupConv(id: "conv-1"))
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

/// P0 (fiche outbox-03) — `reset()` (cascade AuthManager.logout) doit purger
/// l'outbox INJECTÉ, pas seulement la mémoire du store.
extension ConversationStoreTests {

    func test_reset_purgesOutboxPending() async throws {
        let (store, _, _, outbox) = makeStore()
        _ = await outbox.enqueue(.setPinned(true), for: "conv-reset")
        let seeded = await outbox.allPending().count
        XCTAssertEqual(seeded, 1, "precondition: one pending outbox task")

        await store.reset()

        let pending = await outbox.allPending()
        XCTAssertTrue(pending.isEmpty, "reset() must purge the injected outbox — pending mutations would replay under the next account's token")
    }
}
