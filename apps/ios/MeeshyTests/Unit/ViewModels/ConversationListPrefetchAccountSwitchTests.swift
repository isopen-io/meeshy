import XCTest
import Combine
import GRDB
import MeeshySDK
@testable import Meeshy

/// #8651 — le préchargement des messages de la liste appartient au compte qui
/// l'a lancé.
///
/// Incident de production du 2026-09-29 : juste après un changement de compte,
/// une rafale de ~30 `GET /conversations/:id/messages` → 404 — les
/// conversations du compte QUITTÉ, demandées sous le jeton du compte suivant.
/// Le préchargement est une tâche détachée : elle survit à la vue et au modèle
/// qui l'ont lancée, et chaque requête lit le jeton COURANT, pas celui de son
/// lancement.
@MainActor
final class ConversationListPrefetchAccountSwitchTests: XCTestCase {

    private func makeSUT(
        authManager: MockAuthManager,
        messageService: MockMessageService,
        messageSocket: MockMessageSocket = MockMessageSocket(),
        store: MockConversationListPrefetchStore = MockConversationListPrefetchStore()
    ) -> ConversationListViewModel {
        let draftStore = DraftStore(userDefaults: UserDefaults(suiteName: "PrefetchSwitch-\(UUID().uuidString)")!)
        let sut = ConversationListViewModel(
            conversationService: MockConversationService(),
            preferenceService: MockPreferenceService(),
            messageSocket: messageSocket,
            messageService: messageService,
            authManager: authManager,
            storyService: MockStoryService(),
            syncEngine: MockConversationSyncEngine(),
            messageNotificationPublisher: PassthroughSubject<MessageActivitySignal, Never>().eraseToAnyPublisher(),
            draftStore: draftStore,
            store: ConversationListViewModelTests.makeTestStore(),
            categoryStore: UserCategoryStore(service: ConvListTestCategoryWriter())
        )
        sut.messagePrefetcher = ConversationListMessagePrefetcher(messageService: messageService, store: store)
        return sut
    }

    private func conversation(_ id: String) -> Conversation {
        Conversation(
            id: id,
            identifier: id,
            type: .direct,
            title: "Conv \(id)",
            isActive: true,
            lastMessageAt: Date(),
            createdAt: Date(),
            updatedAt: Date(),
            unreadCount: 0
        )
    }

    private func uniqueId() -> String {
        "switch-\(UUID().uuidString)"
    }

    private func waitForCalls(_ service: MockMessageService, atLeast count: Int) async {
        for _ in 0..<40 where service.listCallCount < count {
            try? await Task.sleep(for: .milliseconds(50))
        }
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<40 where !condition() {
            try? await Task.sleep(for: .milliseconds(50))
        }
    }

    func test_prefetch_whenTheAccountChangesRightAfterTheLoad_requestsNothingForThePreviousAccount() async throws {
        let authManager = MockAuthManager()
        authManager.currentUser = MeeshyUser(id: "user-A", username: "a")
        let messageService = MockMessageService()
        try await CacheCoordinator.shared.conversations.save([conversation(uniqueId())], for: "list")
        let sut = makeSUT(authManager: authManager, messageService: messageService)

        await sut.loadConversations()
        authManager.currentUser = MeeshyUser(id: "user-B", username: "b")
        try? await Task.sleep(for: .milliseconds(600))

        XCTAssertEqual(messageService.listCallCount, 0,
                       "aucune conversation du compte quitté ne se demande sous le compte suivant")
    }

    func test_prefetch_skipsAnEmptyConversationId_andStillPrefetchesTheOthers() async throws {
        let authManager = MockAuthManager()
        authManager.currentUser = MeeshyUser(id: "user-A", username: "a")
        let messageService = MockMessageService()
        let real = uniqueId()
        try await CacheCoordinator.shared.conversations.save([conversation(""), conversation(real)], for: "list")
        let sut = makeSUT(authManager: authManager, messageService: messageService)

        await sut.loadConversations()
        await waitForCalls(messageService, atLeast: 1)
        try? await Task.sleep(for: .milliseconds(200))

        XCTAssertEqual(messageService.listCallCount, 1, "l'identifiant vide ne part pas")
        XCTAssertEqual(messageService.lastListConversationId, real)
    }

    // MARK: - #10572 — le préchargement se rejoue

    func test_foregroundReactivation_replaysThePrefetch() async throws {
        let authManager = MockAuthManager()
        authManager.currentUser = MeeshyUser(id: "user-A", username: "a")
        let store = MockConversationListPrefetchStore()
        let id = uniqueId()
        try await CacheCoordinator.shared.conversations.save([conversation(id)], for: "list")
        let sut = makeSUT(authManager: authManager, messageService: MockMessageService(), store: store)
        sut.conversations = [conversation(id)]

        sut.handleForegroundReactivation()
        await waitUntil { store.probedConversationIds.contains(id) }

        XCTAssertTrue(store.probedConversationIds.contains(id),
                      "revenir au premier plan rejoue le préchargement des premières conversations")
    }

    func test_reconnect_replaysThePrefetch() async throws {
        let authManager = MockAuthManager()
        authManager.currentUser = MeeshyUser(id: "user-A", username: "a")
        let store = MockConversationListPrefetchStore()
        let socket = MockMessageSocket()
        let id = uniqueId()
        let sut = makeSUT(authManager: authManager, messageService: MockMessageService(), messageSocket: socket, store: store)
        sut.conversations = [conversation(id)]

        socket.didReconnect.send(())
        await waitUntil { store.probedConversationIds.contains(id) }

        XCTAssertTrue(store.probedConversationIds.contains(id),
                      "une reconnexion rejoue le préchargement — ce qui a échoué hors ligne se retente")
    }
}

// MARK: - #10572 — la passe de préchargement

@MainActor
final class ConversationListMessagePrefetcherTests: XCTestCase {

    private let owner = ConversationPrefetchOwner(userId: "user-A", username: "a")

    private func candidate(_ id: String, lastMessageId: String? = nil, lastMessageAt: Date = Date(timeIntervalSince1970: 2_000)) -> ConversationPrefetchCandidate {
        ConversationPrefetchCandidate(conversationId: id, lastMessageId: lastMessageId ?? "last-\(id)", lastMessageAt: lastMessageAt)
    }

    private func request(_ ids: [String], stillOwner: @escaping @MainActor @Sendable () -> Bool = { true }) -> ConversationListPrefetchRequest {
        ConversationListPrefetchRequest(candidates: ids.map { candidate($0) }, owner: owner, stillOwner: stillOwner)
    }

    private func window(count: Int, holding ids: Set<String> = [], newest: Date? = nil) -> HeldMessageWindow {
        HeldMessageWindow(count: count, serverIds: ids, newestServerCreatedAt: newest)
    }

    private func page(_ ids: [String], conversationId: String) -> MessagesAPIResponse {
        let items = ids.map {
            """
            {"id":"\($0)","conversationId":"\(conversationId)","senderId":"sender","content":"m","createdAt":"2026-06-01T10:00:00.000Z"}
            """
        }
        return JSONStub.decode("""
        {"success":true,"data":[\(items.joined(separator: ","))],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    // MARK: Ce qui se saute

    func test_needsPrefetch_whenTheWindowLacksTheLatestMessage_returnsTrue() {
        let held = window(count: 25, holding: ["older"], newest: Date(timeIntervalSince1970: 1_000))

        XCTAssertTrue(ConversationListMessagePrefetcher.needsPrefetch(candidate("a"), held: held, prefetchedMark: nil))
    }

    func test_needsPrefetch_whenTheWindowHoldsTheLatestAndAScreenful_returnsFalse() {
        let held = window(count: ConversationListMessagePrefetcher.minimumHeldWindow, holding: ["last-a"])

        XCTAssertFalse(ConversationListMessagePrefetcher.needsPrefetch(candidate("a"), held: held, prefetchedMark: nil))
    }

    /// Le défaut B de #10572 : un seul message reçu par socket suffisait à
    /// condamner la conversation — le fil s'ouvrait sur ce message seul.
    func test_needsPrefetch_whenTheWindowHoldsOnlyTheLatestSocketMessage_returnsTrue() {
        let held = window(count: 1, holding: ["last-a"])

        XCTAssertTrue(ConversationListMessagePrefetcher.needsPrefetch(candidate("a"), held: held, prefetchedMark: nil))
    }

    func test_needsPrefetch_whenAPassAlreadyBroughtThisLatestMessage_returnsFalse() {
        let held = window(count: 3, holding: ["last-a"])

        XCTAssertFalse(ConversationListMessagePrefetcher.needsPrefetch(candidate("a"), held: held, prefetchedMark: "last-a"))
    }

    func test_needsPrefetch_withoutALastMessageId_comparesTheNewestServerInstant() {
        let at = Date(timeIntervalSince1970: 5_000)
        let row = ConversationPrefetchCandidate(conversationId: "a", lastMessageId: nil, lastMessageAt: at)

        XCTAssertFalse(ConversationListMessagePrefetcher.needsPrefetch(row, held: window(count: 30, newest: at), prefetchedMark: nil))
        XCTAssertTrue(ConversationListMessagePrefetcher.needsPrefetch(row, held: window(count: 30, newest: at.addingTimeInterval(-1)), prefetchedMark: nil))
    }

    func test_heldWindow_optimisticRowsCountButNeverSetTheNewestInstant() {
        var served = MessageStoreObservationHelper.makeRecord(localId: "s", conversationId: "c", createdAt: Date(timeIntervalSince1970: 1_000))
        served.serverId = "s"
        var optimistic = MessageStoreObservationHelper.makeRecord(localId: "o", conversationId: "c", createdAt: Date(timeIntervalSince1970: 9_000))
        optimistic.serverId = nil

        let held = HeldMessageWindow(records: [optimistic, served])

        XCTAssertEqual(held, window(count: 2, holding: ["s"], newest: Date(timeIntervalSince1970: 1_000)))
    }

    // MARK: La passe

    func test_schedule_fetchesThePageAndGravesItForTheConversation() async {
        let store = MockConversationListPrefetchStore()
        let service = MockMessageService()
        service.listResult = .success(page(["m1", "m2"], conversationId: "a"))
        let sut = ConversationListMessagePrefetcher(messageService: service, store: store)

        sut.schedule(request(["a"]))
        await sut.waitUntilIdle()

        XCTAssertEqual(service.lastListLimit, ConversationListMessagePrefetcher.pageLimit)
        XCTAssertEqual(store.persistedPageSizes, ["a": 2], "la page servie est gravée là où le fil la peint")
    }

    func test_schedule_whenGRDBAlreadyHoldsTheLatestAndAScreenful_requestsNothing() async {
        let store = MockConversationListPrefetchStore(windows: ["a": window(count: 30, holding: ["last-a"])])
        let service = MockMessageService()
        let sut = ConversationListMessagePrefetcher(messageService: service, store: store)

        sut.schedule(request(["a"]))
        await sut.waitUntilIdle()

        XCTAssertEqual(service.listCallCount, 0)
    }

    func test_schedule_afterAGravedPass_doesNotRefetchTheSameLatestMessage() async {
        let store = MockConversationListPrefetchStore(windows: ["a": window(count: 3, holding: ["last-a"])])
        let service = MockMessageService()
        let sut = ConversationListMessagePrefetcher(messageService: service, store: store)

        sut.schedule(request(["a"]))
        await sut.waitUntilIdle()
        sut.schedule(request(["a"]))
        await sut.waitUntilIdle()

        XCTAssertEqual(service.listCallCount, 1, "une conversation plus courte qu'un écran ne se redemande pas à chaque retour")
    }

    func test_schedule_afterAFailedFetch_retriesOnTheNextPass() async {
        let store = MockConversationListPrefetchStore()
        let service = MockMessageService()
        service.listResult = .failure(URLError(.notConnectedToInternet))
        let sut = ConversationListMessagePrefetcher(messageService: service, store: store)

        sut.schedule(request(["a"]))
        await sut.waitUntilIdle()
        sut.schedule(request(["a"]))
        await sut.waitUntilIdle()

        XCTAssertEqual(service.listCallCount, 2, "un échec hors ligne se retente à la passe suivante")
    }

    func test_schedule_whenThePageCannotBeGraved_retriesOnTheNextPass() async {
        let store = MockConversationListPrefetchStore(persistResult: false)
        let service = MockMessageService()
        let sut = ConversationListMessagePrefetcher(messageService: service, store: store)

        sut.schedule(request(["a"]))
        await sut.waitUntilIdle()
        sut.schedule(request(["a"]))
        await sut.waitUntilIdle()

        XCTAssertEqual(service.listCallCount, 2)
    }

    func test_schedule_whileAPassRuns_coalescesIntoOneFollowUpWithTheLatestRequest() async {
        let store = MockConversationListPrefetchStore()
        let sut = ConversationListMessagePrefetcher(messageService: MockMessageService(), store: store)

        sut.schedule(request(["first"]))
        sut.schedule(request(["dropped"]))
        sut.schedule(request(["latest"]))
        await sut.waitUntilIdle()

        XCTAssertEqual(store.probedConversationIds, ["first", "latest"],
                       "une passe à la fois ; la demande la plus récente remplace celle qui attendait")
    }

    func test_schedule_whenTheAccountIsNoLongerActive_requestsNothing() async {
        let store = MockConversationListPrefetchStore()
        let service = MockMessageService()
        let sut = ConversationListMessagePrefetcher(messageService: service, store: store)

        sut.schedule(request(["a", "b"], stillOwner: { false }))
        await sut.waitUntilIdle()

        XCTAssertEqual(service.listCallCount, 0)
        XCTAssertTrue(store.probedConversationIds.isEmpty)
    }

    func test_schedule_boundsTheTargetsToTheFirstConversations() async {
        let store = MockConversationListPrefetchStore()
        let sut = ConversationListMessagePrefetcher(messageService: MockMessageService(), store: store)
        let rows = (0..<30).map { i in
            Conversation(
                id: "c\(i)", identifier: "c\(i)", type: .direct, title: "C\(i)", isActive: true,
                lastMessageAt: Date(), createdAt: Date(), updatedAt: Date(), unreadCount: 0
            )
        }

        sut.schedule(ConversationListPrefetchRequest(
            candidates: ConversationListMessagePrefetcher.targets(rows), owner: owner, stillOwner: { true }
        ))
        await sut.waitUntilIdle()

        XCTAssertEqual(Set(store.probedConversationIds), Set((0..<ConversationListMessagePrefetcher.maxConversations).map { "c\($0)" }))
    }

    // MARK: La base locale — GRDB, la table que le fil peint

    func test_store_persist_gravesThePageInGRDB_andTheWindowThenHoldsIt() async throws {
        let conversationId = "prefetch-\(UUID().uuidString)"
        let persistence = MessagePersistenceActor(dbWriter: try MessageStoreObservationHelper.makeInMemoryDatabase())
        let store = ConversationListPrefetchStore(persistenceOwnedBy: { _ in persistence }, readerPrism: { [] })
        let served = page(["m1", "m2", "m3"], conversationId: conversationId).data

        let graved = await store.persist(served, conversationId: conversationId, owner: owner)
        let held = await store.heldWindow(conversationId: conversationId, ownerId: owner.userId, limit: 30)

        XCTAssertTrue(graved)
        XCTAssertEqual(held?.count, 3)
        XCTAssertEqual(held?.serverIds, ["m1", "m2", "m3"])
        XCTAssertEqual(try persistence.messages(for: conversationId).count, 3, "le fil peint depuis cette table")
    }

    func test_store_whenTheOwnerDatabaseIsNoLongerActive_neitherReadsNorWrites() async {
        let store = ConversationListPrefetchStore(persistenceOwnedBy: { _ in nil }, readerPrism: { [] })

        let held = await store.heldWindow(conversationId: "a", ownerId: "user-A", limit: 30)
        let graved = await store.persist(page(["m1"], conversationId: "a").data, conversationId: "a", owner: owner)

        XCTAssertNil(held)
        XCTAssertFalse(graved)
    }
}

// MARK: - Doublure

final class MockConversationListPrefetchStore: ConversationListPrefetchStoreProviding, @unchecked Sendable {
    private let lock = NSLock()
    private let windows: [String: HeldMessageWindow]
    private let fallbackWindow: HeldMessageWindow?
    private let persistResult: Bool
    private var probed: [String] = []
    private var persisted: [String: Int] = [:]

    init(
        windows: [String: HeldMessageWindow] = [:],
        fallbackWindow: HeldMessageWindow? = HeldMessageWindow.empty,
        persistResult: Bool = true
    ) {
        self.windows = windows
        self.fallbackWindow = fallbackWindow
        self.persistResult = persistResult
    }

    var probedConversationIds: [String] { lock.withLock { probed } }
    var persistedPageSizes: [String: Int] { lock.withLock { persisted } }

    @concurrent
    func heldWindow(conversationId: String, ownerId: String, limit: Int) async -> HeldMessageWindow? {
        lock.withLock {
            probed.append(conversationId)
            return windows[conversationId] ?? fallbackWindow
        }
    }

    @concurrent
    func persist(_ page: [APIMessage], conversationId: String, owner: ConversationPrefetchOwner) async -> Bool {
        lock.withLock {
            persisted[conversationId] = page.count
            return persistResult
        }
    }
}
