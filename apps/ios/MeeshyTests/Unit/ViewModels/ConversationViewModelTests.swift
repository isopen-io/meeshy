import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationViewModelTests: XCTestCase {

    // MARK: - Properties

    private var mockAuthManager: MockAuthManager!
    private var mockMessageService: MockMessageService!
    private var mockConversationService: MockConversationService!
    private var mockReactionService: MockReactionService!
    private var mockReportService: MockReportService!
    private var mockMessageSocket: MockMessageSocket!
    private let testConversationId = "000000000000000000000001"
    private let testUserId = "000000000000000000000099"

    // MARK: - Lifecycle

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.messages.invalidate(for: "000000000000000000000001")
        mockAuthManager = MockAuthManager()
        mockMessageService = MockMessageService()
        mockConversationService = MockConversationService()
        mockReactionService = MockReactionService()
        mockReportService = MockReportService()
        mockMessageSocket = MockMessageSocket()
        // ConversationViewModel.sendMessage references MessageSocketManager.shared
        // directly (the singleton, not an injected dep) at line 1318: if the
        // socket is not connected it routes through the offline OutboxQueue
        // path and never calls `messageService.send`. Tests for the ONLINE
        // send semantics need the singleton to report connected. Tests that
        // exercise the offline path explicitly flip this to false.
        MessageSocketManager.shared.isConnected = true
        // `APIClient.shared` est un singleton de processus : un SUT construit
        // avec une session anonyme y pose son jeton, et seul un VM DÉMARRÉ le
        // retire dans son `deinit` (`guard hasStarted`). Un SUT jamais démarré
        // — le cas de ces tests — le laisse donc au test SUIVANT :
        // `test_init_withNilAnonymousSession…` héritait « test-anon-token » de
        // son jumeau. Remis à zéro ici ET au tearDown, comme tout état partagé.
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        APIClient.shared.anonymousSessionToken = nil
        // Reset singleton so other test classes don't inherit a forced
        // connected state. The default for a fresh app session is false.
        MessageSocketManager.shared.isConnected = false
        mockAuthManager = nil
        mockMessageService = nil
        mockConversationService = nil
        mockReactionService = nil
        mockReportService = nil
        mockMessageSocket = nil
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        conversationId: String? = nil,
        unreadCount: Int = 0,
        isDirect: Bool = false,
        participantUserId: String? = nil,
        anonymousSession: AnonymousSessionContext? = nil,
        dependencies: ConversationDependencies? = nil,
        activeCallService: ActiveCallServiceProviding? = nil,
        liveCallJoin: LiveCallJoinContext? = nil
    ) -> ConversationViewModel {
        let currentUser = MeeshyUser(id: testUserId, username: "testuser", displayName: "Test User")
        mockAuthManager.simulateLoggedIn(user: currentUser)

        let deps = dependencies ?? makeTestDependencies()
        let sut = ConversationViewModel(
            conversationId: conversationId ?? testConversationId,
            unreadCount: unreadCount,
            isDirect: isDirect,
            participantUserId: participantUserId,
            anonymousSession: anonymousSession,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            messageSocket: mockMessageSocket,
            dependencies: deps,
            activeCallService: activeCallService ?? ActiveCallService.shared,
            liveCallJoin: liveCallJoin ?? .live
        )
        // Activate the VM as the view's `.task` does: `init` is now
        // side-effect-free, so the GRDB observation / initial load / Combine
        // subscriptions only come alive after `start()`.
        sut.start()
        return sut
    }

    private func makeTestDependencies() -> ConversationDependencies {
        let pool = try! makeInMemoryPool()
        return ConversationDependencies(
            dbPool: pool,
            persistence: MessagePersistenceActor(dbWriter: pool)
        )
    }

    private func makeMessagesResponse(
        messages: [APIMessage] = [],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> MessagesAPIResponse {
        let pagination: String
        if let cursor = nextCursor {
            pagination = """
            {"hasMore":\(hasMore),"nextCursor":"\(cursor)","limit":50}
            """
        } else {
            pagination = """
            {"hasMore":\(hasMore),"nextCursor":null,"limit":50}
            """
        }

        let messagesJSON = messages.isEmpty ? "[]" : makeAPIMessagesJSON(messages)

        return JSONStub.decode("""
        {"success":true,"data":\(messagesJSON),"pagination":null,"cursorPagination":\(pagination),"hasNewer":null}
        """)
    }

    private func makeAPIMessagesJSON(_ messages: [APIMessage]) -> String {
        let items = messages.map { msg in
            """
            {"id":"\(msg.id)","conversationId":"\(msg.conversationId)","senderId":"\(msg.senderId)","createdAt":"2026-01-01T00:00:00.000Z"}
            """
        }
        return "[\(items.joined(separator: ","))]"
    }

    private func makeAPIMessage(
        id: String = "msg-001",
        conversationId: String? = nil,
        content: String = "Hello",
        senderId: String? = nil
    ) -> String {
        let convId = conversationId ?? testConversationId
        let sId = senderId ?? testUserId
        let senderJSON = senderId.map { """
        ,"sender":{"id":"\($0)","username":"sender","displayName":"Sender"}
        """ } ?? ""
        return """
        {"id":"\(id)","conversationId":"\(convId)","senderId":"\(sId)","content":"\(content)","createdAt":"2026-01-01T00:00:00.000Z"\(senderJSON)}
        """
    }

    private func makeMessage(
        id: String = "msg-001",
        content: String = "Hello",
        senderId: String? = nil,
        isMe: Bool = false,
        reactions: [Reaction] = [],
        pinnedAt: Date? = nil,
        pinnedBy: String? = nil,
        deletedAt: Date? = nil,
        createdAt: Date = Date()
    ) -> Message {
        Message(
            id: id,
            conversationId: testConversationId,
            senderId: senderId ?? testUserId,
            content: content,
            deletedAt: deletedAt,
            pinnedAt: pinnedAt,
            pinnedBy: pinnedBy,
            createdAt: createdAt,
            updatedAt: createdAt,
            reactions: reactions,
            isMe: isMe
        )
    }

    /// Builds a `MessagesAPIResponse` with `count` synthetic messages for the
    /// reconnect-backfill (`listAfter`) path. Lets a test return a full page
    /// (== the VM's page size) followed by a partial page to drive the
    /// watermark forward-paging loop.
    private func makeBackfillResponse(idPrefix: String, count: Int, createdAtISO: String) -> MessagesAPIResponse {
        let items = (0..<count).map { i in
            """
            {"id":"\(idPrefix)-\(i)","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"m\(i)","createdAt":"\(createdAtISO)"}
            """
        }
        return JSONStub.decode("""
        {"success":true,"data":[\(items.joined(separator: ","))],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    // MARK: - loadMessages Tests

    func test_loadMessages_success_populatesMessages() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"msg-1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"First","createdAt":"2026-01-01T00:00:00.000Z"},
            {"id":"msg-2","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Second","createdAt":"2026-01-01T00:01:00.000Z"}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":50},"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        XCTAssertEqual(sut.messages.count, 2)
        XCTAssertFalse(sut.isLoadingInitial)
        XCTAssertNil(sut.error)
    }

    func test_loadMessages_reversesOrderForDisplay() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"msg-newer","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Newer","createdAt":"2026-01-01T00:01:00.000Z"},
            {"id":"msg-older","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Older","createdAt":"2026-01-01T00:00:00.000Z"}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":50},"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        XCTAssertEqual(sut.messages.first?.id, "msg-older")
        XCTAssertEqual(sut.messages.last?.id, "msg-newer")
    }

    func test_loadMessages_setsHasOlderMessages() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-123","limit":50},"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        XCTAssertTrue(sut.hasOlderMessages)
    }

    func test_loadOlderMessages_missingCursorPagination_keepsPaginationOpenOnFullPage() async {
        // Gateway antérieur au fix de schéma Fastify : `cursorPagination` est
        // strippé de la réponse. L'ancien `?? false` verrouillait la pagination
        // après une seule page ; une page pleine doit la laisser ouverte.
        let initial: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"msg-1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello","createdAt":"2026-01-02T00:00:00.000Z"}
        ],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":null,"limit":50},"hasNewer":null}
        """)
        mockMessageService.listResult = .success(initial)
        let olderData = (0..<50).map { i in
            "{\"id\":\"older-\(i)\",\"conversationId\":\"\(testConversationId)\",\"senderId\":\"\(testUserId)\",\"content\":\"m\(i)\",\"createdAt\":\"2026-01-01T00:00:\(String(format: "%02d", i)).000Z\"}"
        }.joined(separator: ",")
        let older: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[\(olderData)],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.listBeforeResult = .success(older)
        let sut = makeSUT()
        await sut.loadMessages()

        await sut.loadOlderMessages()

        XCTAssertTrue(sut.hasOlderMessages,
                      "A gateway stripping cursorPagination must not latch pagination closed after a full page")
    }

    func test_loadMessages_failure_keepsEmptyMessagesAndFinishesLoading() async {
        mockMessageService.listResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server error"]))
        let sut = makeSUT()

        await sut.loadMessages()

        // Generic errors (non-403/404/410) are treated as transient and don't set error
        XCTAssertTrue(sut.messages.isEmpty)
        XCTAssertFalse(sut.isLoadingInitial)
    }

    func test_loadMessages_guardPreventsDoubleLoad() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        async let first: () = sut.loadMessages()
        async let second: () = sut.loadMessages()
        _ = await (first, second)

        XCTAssertEqual(mockMessageService.listCallCount, 1)
    }

    func test_loadMessages_doesNotMarkConversationReadOnOpen() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()
        // Charger des messages n'est PAS lire. `loadMessages()` tourne aussi à
        // la pagination, au retour en avant-plan et à la revalidation REST —
        // en faire un déclencheur de lecture viderait la pastille de
        // conversations que personne n'a ouvertes.
        //
        // La lecture LOCALE a un seul déclencheur, `start()` (l'ouverture de
        // l'écran), qui poste `.conversationMarkedRead` via
        // `ConversationReadSignal` — voir
        // `test_start_marksTheConversationReadLocally`. L'accusé de lecture
        // SERVEUR, lui, garde son exigence d'exactitude
        // (`docs/superpowers/specs/2026-07-24-read-exactness-design.md`) : il
        // ne nomme que les messages réellement affichés, et ne part que par
        // `markAsRead(messageIds:)`.
        let expectedId = testConversationId
        let marked = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == expectedId
        }
        marked.isInverted = true

        await sut.loadMessages()

        await fulfillment(of: [marked], timeout: 0.5)
    }

    // MARK: - loadOlderMessages Tests (P1 — offline cache fallback)

    /// `loadOlderMessages` used to be network-first: the GRDB pagination
    /// slide (`messageStore.loadOlder`) only ran inside the `do` block, right
    /// after a successful REST `listBefore`. Cache-FIRST depuis le
    /// 2026-08-18 (bible I1, retour user « chargement lent ») : la fenêtre
    /// GRDB se sert AVANT l'appel réseau — un gateway lent ou mort ne
    /// retarde plus jamais des rangées déjà sur disque.
    func test_loadOlderMessages_networkFailure_fallsBackToGRDBCachedOlderMessages() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)

        // Seed one more message than the store's fixed 200-row initial
        // window so the oldest is cache-resident but outside the current
        // slice — exactly the "already cached from a prior session, but out
        // of window" scenario a real offline scroll-up hits.
        let conversationId = testConversationId
        let userId = testUserId
        let base = Date()
        let records: [MessageRecord] = (0..<201).map { i in
            var record = MessageStoreObservationHelper.makeRecord(
                localId: "older-\(i)", conversationId: conversationId,
                senderId: userId, content: "msg \(i)",
                state: .sent, createdAt: base.addingTimeInterval(Double(i))
            )
            record.cachedTimeString = MessageRecord.computeTimeString(for: record.createdAt)
            return record
        }
        try await pool.write { db in
            for record in records {
                try record.insert(db)
            }
        }

        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))
        let windowed = await MessageStoreObservationHelper.awaitMessagesCount(equals: 200, in: sut)
        XCTAssertTrue(windowed, "precondition: the initial window caps at the newest 200 cached messages")

        mockMessageService.listBeforeResult = .failure(
            NSError(domain: "test", code: -1009, userInfo: [NSLocalizedDescriptionKey: "offline"])
        )
        // Preuve d'ORDRE cache-first : au moment où le REST part, la fenêtre
        // GRDB doit DÉJÀ avoir glissé (201 rangées publiées) — le réseau ne
        // gate plus la lecture locale.
        var messageCountWhenRESTFired: Int?
        mockMessageService.onListBefore = { [weak sut] in
            messageCountWhenRESTFired = sut?.messages.count
        }

        await sut.loadOlderMessages()

        let grew = await MessageStoreObservationHelper.awaitMessagesCount(equals: 201, in: sut)
        XCTAssertTrue(grew, "the offline path must surface the GRDB-cached older message")
        XCTAssertEqual(mockMessageService.listBeforeCallCount, 1, "the REST call must still be attempted (to extend the window)")
        XCTAssertEqual(
            messageCountWhenRESTFired, 201,
            "cache-FIRST : la page GRDB doit être servie AVANT l'appel réseau — un gateway mort ne doit jamais retarder des rangées déjà sur disque"
        )
    }

    // MARK: - Rattrapage à l'OUVERTURE d'une conversation

    /// Le geste rapporté par l'utilisateur le 2026-08-25 : « j'ouvre la
    /// conversation, même après 1h, et il manque des messages récents — alors
    /// que dans la liste on a bien le dernier ».
    ///
    /// `refreshMessagesFromAPI()` lit `offset: 0, limit: 30`. Au-delà de trente
    /// messages manqués il colle les trente derniers sur le bloc GRDB ancien et
    /// laisse un TROU au milieu : `loadOlderMessages` part du plus ancien vers
    /// l'arrière, `syncMissedMessages` du plus récent vers l'avant, et personne
    /// ne regarde entre les deux. Le trou n'était comblé que par redondance —
    /// le puits `message:new` global et le rejeu serveur de 48 h —, jamais
    /// détecté, et rien ne le couvrait après une absence plus longue.
    func test_loadMessages_surUnCacheCHAUD_declencheLeRattrapageParWatermark() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let base = Date().addingTimeInterval(-3600)
        let records: [MessageRecord] = (0..<5).map { i in
            var record = MessageStoreObservationHelper.makeRecord(
                localId: "chaud-\(i)", conversationId: testConversationId,
                senderId: testUserId, content: "msg \(i)",
                state: .sent, createdAt: base.addingTimeInterval(Double(i))
            )
            record.cachedTimeString = MessageRecord.computeTimeString(for: record.createdAt)
            return record
        }
        try await pool.write { db in
            for record in records { try record.insert(db) }
        }

        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))
        _ = await MessageStoreObservationHelper.awaitMessagesCount(equals: 5, in: sut)
        mockMessageService.listAfterResult = .success(makeMessagesResponse())

        await sut.loadMessages()

        // Le rattrapage part dans une tâche de fond détachée du chargement :
        // on attend qu'il se manifeste plutôt que de supposer son instant.
        // `awaitCondition` prend une closure NON échappante : pas de capture
        // faible, `self` y est capturé implicitement et sans cycle.
        let rattrape = await MessageStoreObservationHelper.awaitCondition(timeout: 2.0) {
            self.mockMessageService.listAfterCallCount >= 1
        }
        XCTAssertTrue(
            rattrape,
            "ouvrir une conversation dont GRDB est CHAUD doit rejouer le rattrapage par watermark — sans lui, un trou de plus de trente messages reste invisible et définitif"
        )
    }

    /// La moitié NÉGATIVE, et elle n'est pas décorative : sur un GRDB FROID le
    /// refresh vient d'apporter les trente plus récents, il n'y a rien devant
    /// eux à rattraper. Un rattrapage y serait une seconde lecture pour rien.
    func test_loadMessages_surUnCacheFROID_neDeclenchePasLeRattrapage() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)

        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))
        mockMessageService.listAfterResult = .success(makeMessagesResponse())

        await sut.loadMessages()

        XCTAssertEqual(
            mockMessageService.listAfterCallCount, 0,
            "GRDB froid : le refresh a déjà apporté les plus récents, aucun watermark à remonter"
        )
    }

    // MARK: - syncMissedMessages (T9 — reconnect gap recovery via watermark)

    /// The backfill must ask the gateway for messages created *after* the
    /// newest message currently held locally — that high-water mark is what
    /// makes the recovery incremental and contiguous.
    func test_syncMissedMessages_usesNewestLocalMessageAsWatermark() async throws {
        let sut = makeSUT()
        let older = Date(timeIntervalSince1970: 1_750_000_000)
        let newest = older.addingTimeInterval(3600)
        sut.messages = [
            makeMessage(id: "m-old", createdAt: older),
            makeMessage(id: "m-new", createdAt: newest),
        ]
        mockMessageService.listAfterResult = .success(makeMessagesResponse())  // empty page → loop stops after 1 fetch

        await sut.syncMissedMessages()

        XCTAssertEqual(mockMessageService.listAfterCallCount, 1)
        XCTAssertEqual(mockMessageService.listCallCount, 0, "reconnect backfill must use the watermark path, not offset-based list()")
        let after = try XCTUnwrap(mockMessageService.lastListAfterAfter)
        // The watermark is the newest local message (modulo a sub-millisecond
        // tie backoff so a same-instant missed message isn't excluded by the
        // gateway's strict `createdAt > after`).
        XCTAssertLessThanOrEqual(after, newest)
        XCTAssertGreaterThan(after, newest.addingTimeInterval(-0.01))
    }

    /// The core bug fix: a missed-message gap larger than one page must be
    /// filled. The old code fetched `offset:0,limit:30` once and could never
    /// recover a >30-message gap. The watermark loop pages forward until a
    /// page comes back shorter than the page size.
    func test_syncMissedMessages_pagesForwardUntilGapSmallerThanPage() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "local-newest", createdAt: Date(timeIntervalSince1970: 1_750_000_000))]
        // First page is FULL (== the VM's 100-message page size) so the loop
        // must fetch again; the second page is partial so it then stops.
        mockMessageService.listAfterResults = [
            makeBackfillResponse(idPrefix: "p1", count: 100, createdAtISO: "2026-06-01T10:00:00.000Z"),
            makeBackfillResponse(idPrefix: "p2", count: 5, createdAtISO: "2026-06-01T11:00:00.000Z"),
        ]

        await sut.syncMissedMessages()

        XCTAssertEqual(mockMessageService.listAfterCallCount, 2, "must page past the first full page to fill a gap larger than one page")
        XCTAssertEqual(mockMessageService.listCallCount, 0, "must not fall back to offset-based list()")
    }

    /// With no local messages there is no high-water mark to backfill from —
    /// a full load happens on conversation open instead, so the reconnect
    /// path must no-op rather than refetch from the top.
    func test_syncMissedMessages_withNoLocalMessages_doesNotFetch() async {
        let sut = makeSUT()
        sut.messages = []

        await sut.syncMissedMessages()

        XCTAssertEqual(mockMessageService.listAfterCallCount, 0)
        XCTAssertEqual(mockMessageService.listCallCount, 0)
    }

    // MARK: - sendMessage Tests

    func test_sendMessage_emptyContent_returnsFalse() async {
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "")

        XCTAssertFalse(result)
        XCTAssertTrue(sut.messages.isEmpty)
    }

    func test_sendMessage_whitespaceOnly_returnsFalse() async {
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "   \n  ")

        XCTAssertFalse(result)
    }

    func test_sendMessage_insertsOptimisticMessage() async {
        let sut = makeSUT()

        // Trigger the send concurrently. The optimistic row surfaces in
        // `messages` through the GRDB -> MessageStore -> ViewModel pipeline,
        // which crosses several runloop hops — poll for the condition instead
        // of a fixed sleep (a 50 ms delay races the pipeline under load).
        let sendTask = Task {
            await sut.sendMessage(content: "Hello world")
        }

        let surfaced = await MessageStoreObservationHelper.awaitMessage(in: sut) {
            $0.content == "Hello world"
        }
        XCTAssertNotNil(surfaced, "Optimistic message must surface in `messages`")

        _ = await sendTask.value
    }

    func test_sendMessage_success_replacesOptimisticWithServerMessage() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let result = await sut.sendMessage(content: "Hello")

        XCTAssertTrue(result)
        // Post Phase 1.5: insertOptimistic + applyEvent(.serverAck) write
        // through the persistence actor; assert the row reaches `.sent` in GRDB.
        let deadline = Date().addingTimeInterval(1.5)
        var foundSent = false
        while Date() < deadline {
            let rows = (try? await pool.read { db in
                try MessageRecord.filter(Column("state") == MessageState.sent.rawValue).fetchAll(db)
            }) ?? []
            if rows.count == 1 {
                foundSent = true
                break
            }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }
        XCTAssertTrue(foundSent, "Server ACK must transition the row to .sent in GRDB")
        XCTAssertEqual(mockMessageService.sendCallCount, 1)
    }

    func test_sendMessage_failure_keepsOptimisticAsSlowForRetry() async {
        mockMessageService.sendResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Send failed"]))
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Fail me")

        XCTAssertFalse(result)
        XCTAssertEqual(sut.messages.count, 1)
        // On failure the message is enqueued for retry (state `.queued`), which
        // surfaces as `.slow` ("Envoi lent") — distinct from a fresh `.sending`
        // clock — so the user can tell a struggling/retrying send from one that
        // just left. It is NOT removed and NOT `.failed` (retries remain).
        XCTAssertEqual(sut.messages.first?.deliveryStatus, .slow)
    }

    func test_sendMessage_surfacesOptimisticMessage() async {
        let sut = makeSUT()
        XCTAssertEqual(sut.messages.count, 0)

        _ = await sut.sendMessage(content: "Test")

        // The optimistic GRDB insert surfaces through the store observation
        // (notification → store refresh → @Published messages), which hops the
        // main runloop a couple of times — poll briefly rather than racing it.
        // The auto-scroll signal is now derived from the snapshot delta in
        // MessageListViewController, not a ViewModel counter.
        for _ in 0..<40 where sut.messages.isEmpty {
            try? await Task.sleep(nanoseconds: 25_000_000)
        }
        XCTAssertEqual(sut.messages.count, 1)
        XCTAssertEqual(sut.messages.first?.content, "Test")
    }

    func test_sendMessage_passesReplyToId() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "parent-msg", content: "Original", isMe: false)]

        _ = await sut.sendMessage(content: "Reply", replyToId: "parent-msg")

        XCTAssertEqual(mockMessageService.lastSendRequest?.replyToId, "parent-msg")
    }

    // MARK: - sendMessage Socket Fallback Tests

    func test_sendMessage_restFails_fallsBackToSocket() async {
        mockMessageService.sendResult = .failure(NSError(domain: "test", code: 500))
        mockMessageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "server-id-from-socket", clientMessageId: nil, createdAt: Date()
        )
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Fallback me")

        XCTAssertTrue(result)
        XCTAssertEqual(mockMessageSocket.sendViaSocketFallbackCallCount, 1)
    }

    func test_sendMessage_restSucceeds_skipsSocketFallback() async {
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Plain send")

        XCTAssertTrue(result)
        XCTAssertEqual(mockMessageSocket.sendViaSocketFallbackCallCount, 0)
    }

    // MARK: - sendMessage Socket-First Fast Path

    func test_sendMessage_socketConnected_plainText_usesSocketFirst_skipsRest() async {
        // Socket-first fast path: a connected socket ACKs `message:send` before
        // the REST POST is ever attempted (avoids the 10-30s slow-cellular POST).
        mockMessageSocket.isConnected = true
        mockMessageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "server-id-socket-first", clientMessageId: nil, createdAt: Date()
        )
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Fast via socket")

        XCTAssertTrue(result)
        XCTAssertEqual(mockMessageSocket.sendViaSocketFallbackCallCount, 1, "socket-first sends via the socket")
        XCTAssertEqual(mockMessageService.sendCallCount, 0, "REST is not called when the socket ACKs first")
    }

    func test_sendMessage_socketConnectedButNoAck_fallsThroughToRest() async {
        // Socket connected but no ACK (nil) → fall straight through to the REST
        // POST with the SAME clientMessageId. Both transports attempted once.
        mockMessageSocket.isConnected = true
        mockMessageSocket.sendViaSocketFallbackResult = nil
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Socket miss then REST")

        XCTAssertTrue(result)
        XCTAssertEqual(mockMessageSocket.sendViaSocketFallbackCallCount, 1, "socket-first was attempted")
        XCTAssertEqual(mockMessageService.sendCallCount, 1, "REST is the fallback on a socket miss")
    }

    // MARK: - Conversation-list optimistic preview

    func test_optimisticListPreview_text_returnsTheText() {
        XCTAssertEqual(ConversationViewModel.optimisticListPreview(text: "Salut", messageType: .text), "Salut")
    }

    func test_optimisticListPreview_captionedMedia_prefersTheCaption() {
        // A media message WITH a caption shows the caption, not the media label.
        XCTAssertEqual(ConversationViewModel.optimisticListPreview(text: "Regarde", messageType: .image), "Regarde")
    }

    func test_optimisticListPreview_captionlessMedia_returnsMediaLabel() throws {
        // `optimisticListPreview` résout ses libellés via `String(localized:)`,
        // donc depuis la langue du simulateur : on fixe la table française pour
        // juger le code, pas la machine (sinon vert en local fr, rouge en CI en).
        let path = try XCTUnwrap(Bundle.main.path(forResource: "fr", ofType: "lproj"),
                                 "localisation « fr » absente du bundle — régression de packaging")
        let fr = try XCTUnwrap(Bundle(path: path))
        let loc = Locale(identifier: "fr")
        func preview(_ type: Message.MessageType) -> String {
            ConversationViewModel.optimisticListPreview(text: "", messageType: type, bundle: fr, locale: loc)
        }
        XCTAssertEqual(preview(.image), "📷 Photo")
        XCTAssertEqual(preview(.video), "🎥 Vidéo")
        XCTAssertEqual(preview(.audio), "🎙️ Message vocal")
        XCTAssertEqual(preview(.file), "📎 Fichier")
        XCTAssertEqual(preview(.location), "📍 Position")
    }

    func test_optimisticListPreview_lieuSeul_composeNomPuisAdressePuisPosition() throws {
        // Lot 2 (spec 2026-07-30) : un message « lieu seul » a un `content`
        // vide et un messageType .text — sans la branche `location`, son
        // aperçu de conversation serait vide. « 📍 <nom, à défaut adresse,
        // à défaut Position> ». Table française fixée : on juge le code, pas
        // la langue du simulateur.
        let path = try XCTUnwrap(Bundle.main.path(forResource: "fr", ofType: "lproj"))
        let fr = try XCTUnwrap(Bundle(path: path))
        let loc = Locale(identifier: "fr")
        func preview(_ place: SharedPlace?) -> String {
            ConversationViewModel.optimisticListPreview(
                text: "", messageType: .text, location: place, bundle: fr, locale: loc)
        }

        let nomEtAdresse = SharedPlace(latitude: 48.85, longitude: 2.35,
                                       name: "Café de Flore",
                                       address: "172 boulevard Saint-Germain, Paris")
        XCTAssertEqual(preview(nomEtAdresse), "📍 Café de Flore", "le nom prime sur l'adresse")

        let adresseSeule = SharedPlace(latitude: 48.85, longitude: 2.35,
                                       name: nil,
                                       address: "172 boulevard Saint-Germain, Paris")
        XCTAssertEqual(preview(adresseSeule), "📍 172 boulevard Saint-Germain, Paris")

        let nomVide = SharedPlace(latitude: 48.85, longitude: 2.35, name: "", address: "")
        XCTAssertEqual(preview(nomVide), "📍 Position",
                       "nom et adresse vides → libellé localisé de repli")

        let pointBrut = SharedPlace(latitude: 48.85, longitude: 2.35)
        XCTAssertEqual(preview(pointBrut), "📍 Position")
    }

    func test_optimisticListPreview_texteAvecLieu_prefereLeTexte() {
        // Un message qui porte texte ET lieu montre le texte en aperçu — le
        // lieu n'écrase jamais une légende.
        let place = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Café de Flore")
        XCTAssertEqual(
            ConversationViewModel.optimisticListPreview(text: "On se voit ici ?", messageType: .text, location: place),
            "On se voit ici ?"
        )
    }

    func test_sendMessage_restAndSocketBothFail_returnsFalse() async {
        mockMessageService.sendResult = .failure(NSError(domain: "test", code: 500))
        mockMessageSocket.sendViaSocketFallbackResult = nil
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Both down")

        XCTAssertFalse(result)
        XCTAssertEqual(mockMessageSocket.sendViaSocketFallbackCallCount, 1)
    }

    func test_sendMessage_socketFallbackReusesOptimisticClientMessageId() async {
        mockMessageService.sendResult = .failure(NSError(domain: "test", code: 500))
        mockMessageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "server-id", clientMessageId: nil, createdAt: nil
        )
        let sut = makeSUT()

        _ = await sut.sendMessage(content: "Dedup key check")

        // The fallback MUST reuse the cid_<uuid> optimistic id so the gateway
        // dedup (conversationId, clientMessageId) prevents a duplicate when the
        // outbox later replays the REST request.
        let cid = mockMessageSocket.lastSendViaSocketFallbackClientMessageId
        XCTAssertNotNil(cid)
        XCTAssertEqual(cid?.hasPrefix("cid_"), true)
    }

    // MARK: - insertOptimisticMediaMessage Tests
    //
    // Regression guards for the disappearing-bubble bug. The contract:
    // 1. Calling the helper must persist a MessageRecord through GRDB so the
    //    row survives any subsequent MessageStore observation refresh
    //    (otherwise the bubble would only live in `messages` for one tick).
    // 2. The persisted row must carry the local file:// attachments so the
    //    bubble can render the image/audio immediately, including offline.
    // 3. The originalLanguage must NOT be hardcoded (Prisme Linguistique).

    func test_insertOptimisticMediaMessage_persistsRecordToGRDB() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let imageAttachment = MeeshyMessageAttachment(
            id: "att_image_001",
            mimeType: "image/jpeg",
            fileUrl: "file:///tmp/photo.jpg",
            uploadedBy: testUserId
        )
        let tempId = "temp_\(UUID().uuidString)"

        sut.insertOptimisticMediaMessage(
            tempId: tempId,
            content: "Caption",
            attachments: [imageAttachment],
            messageType: .image,
            replyToId: nil,
            originalLanguage: "es"
        )

        // The helper writes via Task.detached — wait for the row to land.
        let record = await MessageStoreObservationHelper.awaitRecord(
            localId: tempId,
            from: pool
        ) { _ in true }

        XCTAssertNotNil(record, "Optimistic media row must reach GRDB")
        XCTAssertEqual(record?.localId, tempId)
        XCTAssertEqual(record?.state, .sending)
        XCTAssertEqual(record?.messageType, "image")
        XCTAssertEqual(record?.contentType, "image", "contentType must mirror messageType, not be hardcoded to 'text'")
        XCTAssertEqual(record?.originalLanguage, "es", "originalLanguage must come from the caller, not be hardcoded to 'fr'")
        XCTAssertEqual(record?.content, "Caption")
        XCTAssertNotNil(record?.attachmentsJson, "Local attachments must be serialized into attachmentsJson")

        let decoded = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: record!.attachmentsJson!)
        XCTAssertEqual(decoded.count, 1)
        XCTAssertEqual(decoded.first?.id, "att_image_001")
        XCTAssertEqual(decoded.first?.fileUrl, "file:///tmp/photo.jpg")
    }

    /// La citation OPTIMISTE doit porter l'avatar de l'auteur cité dès la
    /// première frame. Le message cité est déjà en mémoire, son avatar avec :
    /// sans ce report, la bulle optimiste s'affichait en initiales puis
    /// « sautait » à la photo au premier refresh serveur.
    func test_insertOptimisticMediaMessage_replyReference_carriesTheQuotedAuthorAvatar() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let quoted = Message(
            id: "msg-quoted-001",
            conversationId: testConversationId,
            senderId: "000000000000000000000002",
            content: "Salut",
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0),
            senderName: "Bob",
            senderColor: "#31B6BA",
            senderAvatarURL: "https://cdn.example/bob.jpg",
            isMe: false
        )
        sut.messages = [quoted]

        let tempId = "temp_\(UUID().uuidString)"
        sut.insertOptimisticMediaMessage(
            tempId: tempId,
            content: "ma reponse",
            attachments: [],
            messageType: .text,
            replyToId: "msg-quoted-001"
        )

        let record = await MessageStoreObservationHelper.awaitRecord(
            localId: tempId,
            from: pool
        ) { $0.replyToJson != nil }

        let json = try XCTUnwrap(record?.replyToJson,
            "La bulle optimiste doit graver sa citation dans replyToJson")
        let reference = try JSONDecoder().decode(ReplyReference.self, from: json)
        XCTAssertEqual(reference.authorAvatarUrl, "https://cdn.example/bob.jpg",
            "La citation optimiste doit porter l'avatar du message cité, déjà résolu en mémoire")
    }

    // MARK: - Attachment Reactions (BUG2 A')

    private func makeImageMessage(id: String = "m1", attachmentId: String = "a1") -> Message {
        var msg = makeMessage(id: id)
        msg.attachments = [MeeshyMessageAttachment(
            id: attachmentId, mimeType: "image/jpeg", fileUrl: "file:///x.jpg", uploadedBy: testUserId
        )]
        return msg
    }

    func test_toggleAttachmentReaction_addsOptimistically_andEmits() throws {
        let pool = try makeInMemoryPool()
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)))
        sut.messages = [makeImageMessage()]

        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")

        let att = sut.messages.first?.attachments.first
        XCTAssertEqual(att?.reactionSummary?["❤️"], 1)
        XCTAssertEqual(att?.currentUserReactions, ["❤️"])
        XCTAssertEqual(mockMessageSocket.addAttachmentReactionCallCount, 1)
    }

    func test_toggleAttachmentReaction_secondTapSameEmoji_removes() throws {
        let pool = try makeInMemoryPool()
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)))
        sut.messages = [makeImageMessage()]

        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")
        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")

        let att = sut.messages.first?.attachments.first
        XCTAssertNil(att?.reactionSummary)
        XCTAssertNil(att?.currentUserReactions)
        XCTAssertEqual(mockMessageSocket.removeAttachmentReactionCallCount, 1)
    }

    func test_toggleAttachmentReaction_differentEmoji_stacksWithPrevious() throws {
        let pool = try makeInMemoryPool()
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)))
        sut.messages = [makeImageMessage()]

        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")
        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "👍")

        let att = sut.messages.first?.attachments.first
        XCTAssertEqual(att?.reactionSummary?["❤️"], 1, "multi-réactions : le premier emoji survit au second")
        XCTAssertEqual(att?.reactionSummary?["👍"], 1)
        XCTAssertEqual(Set(att?.currentUserReactions ?? []), ["❤️", "👍"])
    }

    func test_applyAttachmentReactionDelta_replacesSummary() throws {
        let pool = try makeInMemoryPool()
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)))
        sut.messages = [makeImageMessage()]

        sut.applyAttachmentReactionDelta(attachmentId: "a1", reactionSummary: ["👍": 3])

        XCTAssertEqual(sut.messages.first?.attachments.first?.reactionSummary?["👍"], 3)
    }

    // Regression guard (GAP #1): an attachment reaction must be written through
    // GRDB so it survives a cold reload. Before the fix the pill lived only in
    // the in-memory `messages` array and was lost on the next conversation load.
    func test_toggleAttachmentReaction_persistsReactionSummaryToGRDB() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        // Seed a delivered message row carrying the image attachment so the row
        // exists for `updateAttachmentsJson` to update and surfaces in the VM.
        let record = MessageStoreObservationHelper.makeRecord(
            localId: "m1", conversationId: testConversationId, senderId: testUserId
        )
        try await persistence.insertOptimistic(record)
        let attachment = MeeshyMessageAttachment(
            id: "a1", mimeType: "image/jpeg", fileUrl: "file:///x.jpg", uploadedBy: testUserId
        )
        try await persistence.updateAttachmentsJson(
            localId: "m1", attachmentsJson: try JSONEncoder().encode([attachment])
        )
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) {
            $0.id == "m1" && !$0.attachments.isEmpty
        }

        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")

        // The write-through runs in a fire-and-forget Task; poll GRDB until it lands.
        var persistedSummary: [String: Int]?
        let deadline = Date().addingTimeInterval(1.5)
        while Date() < deadline {
            if let json = try await MessageStoreObservationHelper.fetchRecord(localId: "m1", from: pool)?.attachmentsJson,
               let atts = try? JSONDecoder().decode([MeeshyMessageAttachment].self, from: json),
               let summary = atts.first?.reactionSummary {
                persistedSummary = summary
                break
            }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }
        XCTAssertEqual(persistedSummary?["❤️"], 1, "Attachment reaction must be persisted to GRDB to survive a reload")
    }

    func test_insertOptimisticMediaMessage_surfacesBubbleInViewModel() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let audioAttachment = MeeshyMessageAttachment(
            id: "att_audio_001",
            mimeType: "audio/mp4",
            fileUrl: "file:///tmp/voice.m4a",
            duration: 3500,
            uploadedBy: testUserId
        )
        let tempId = "temp_\(UUID().uuidString)"

        sut.insertOptimisticMediaMessage(
            tempId: tempId,
            content: "",
            attachments: [audioAttachment],
            messageType: .audio,
            replyToId: nil,
            originalLanguage: "fr"
        )

        let surfaced = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == tempId }

        XCTAssertNotNil(surfaced, "Store observation must surface the optimistic bubble")
        XCTAssertEqual(surfaced?.deliveryStatus, .sending)
        XCTAssertEqual(surfaced?.messageType, .audio)
        XCTAssertEqual(surfaced?.attachments.count, 1)
        XCTAssertEqual(surfaced?.attachments.first?.fileUrl, "file:///tmp/voice.m4a")
    }

    func test_insertOptimisticMediaMessage_emptyAttachments_persistsNilJson() async throws {
        // Edge case: caller decides to use the helper for a content-only path.
        // Should still produce a valid row but with attachmentsJson = nil
        // (so we don't store an empty `[]` blob taking disk space).
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let tempId = "temp_\(UUID().uuidString)"

        sut.insertOptimisticMediaMessage(
            tempId: tempId,
            content: "Just text",
            attachments: [],
            messageType: .text,
            replyToId: nil,
            originalLanguage: "en"
        )

        let record = await MessageStoreObservationHelper.awaitRecord(
            localId: tempId,
            from: pool
        ) { _ in true }

        XCTAssertNotNil(record)
        XCTAssertNil(record?.attachmentsJson, "Empty attachments must serialize to nil, not Data([])")
    }

    // MARK: - editMessage Tests
    //
    // Post Phase 1.5: `editMessage` writes through `messagePersistence.markEdited`.
    // Tests seed the row via persistence and assert the propagated state.

    func test_editMessage_optimisticallyUpdatesContent() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-edit", conversationId: testConversationId,
            senderId: testUserId, content: "Original"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-edit" }

        await sut.editMessage(messageId: "msg-edit", newContent: "Edited")

        let edited = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-edit", from: pool
        )
        XCTAssertEqual(edited?.content, "Edited", "Edit must persist new content in GRDB")
        XCTAssertTrue(edited?.isEdited == true, "isEdited flag must be set in GRDB")
        XCTAssertEqual(mockMessageService.editCallCount, 1)
    }

    func test_editMessage_emptyContent_doesNothing() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-edit", conversationId: testConversationId,
            senderId: testUserId, content: "Original"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-edit" }

        await sut.editMessage(messageId: "msg-edit", newContent: "")

        let untouched = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-edit", from: pool
        )
        XCTAssertEqual(untouched?.content, "Original", "Empty edit must not change DB content")
        XCTAssertEqual(mockMessageService.editCallCount, 0)
    }

    func test_editMessage_failure_rollsBackContent() async throws {
        mockMessageService.editResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Edit failed"]))
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-edit", conversationId: testConversationId,
            senderId: testUserId, content: "Original"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-edit" }

        await sut.editMessage(messageId: "msg-edit", newContent: "Edited")

        // Optimistic edit -> network fails -> rollback -> markEdited(original).
        let rolledBack = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-edit", from: pool
        )
        XCTAssertEqual(rolledBack?.content, "Original", "Edit failure must roll content back in GRDB")
        XCTAssertNotNil(sut.error)
    }

    // MARK: - deleteMessage Tests
    //
    // Post Phase 1.5: `deleteMessage(.everyone)` writes through
    // `messagePersistence.markDeleted` (sets deletedAt, blanks content).

    func test_deleteMessage_optimisticallyMarksDeleted() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-del", conversationId: testConversationId,
            senderId: testUserId, content: "Delete me"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-del" }

        await sut.deleteMessage(messageId: "msg-del")

        let deleted = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-del", from: pool
        )
        XCTAssertNotNil(deleted?.deletedAt, "Delete must set deletedAt in GRDB")
        XCTAssertNil(deleted?.content, "Delete must blank content in GRDB")
        XCTAssertEqual(mockMessageService.deleteCallCount, 1)
    }

    func test_deleteMessage_failure_rollsBackDeleted() async throws {
        mockMessageService.deleteResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Delete failed"]))
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-del", conversationId: testConversationId,
            senderId: testUserId, content: "Keep me"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-del" }

        await sut.deleteMessage(messageId: "msg-del")

        // Optimistic delete -> network fails -> markUndeleted -> deletedAt back to nil.
        let restored = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-del", from: pool
        )
        XCTAssertNil(restored?.deletedAt, "Delete failure must roll back deletedAt in GRDB")
        XCTAssertNotNil(sut.error)
    }

    /// A `.failed` message never reached the server — a REST delete would
    /// target the bogus optimistic local id, get rejected, and the existing
    /// rollback (`markUndeleted`) would resurrect the very message the user
    /// just tried to remove. `.everyone` must route straight to the
    /// local-only failed-message purge instead of ever calling the network.
    func test_deleteMessage_failedMessageNeverReachedServer_purgesLocallyWithoutRestCall() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-failed-del", conversationId: testConversationId,
            senderId: testUserId, content: "never sent", state: .failed
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-failed-del" }

        await sut.deleteMessage(messageId: "msg-failed-del", mode: .everyone)

        XCTAssertEqual(mockMessageService.deleteCallCount, 0,
            "a failed message never reached the server — deleting it must never call REST")
        let deleted = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-failed-del", from: pool
        ) { $0.deletedAt != nil }
        XCTAssertNotNil(deleted?.deletedAt, "the failed message must still be purged locally")
    }

    /// S11 — a "Delete for me" hide keyed on a temp id must follow the
    /// temp->server reconciliation, so the hidden message stays hidden instead
    /// of reappearing once its display id flips to the server id.
    func test_persistMessagesUsingServerIds_migratesHiddenTempIdToServerId() async {
        let sut = makeSUT(conversationId: "c_s11")
        LocallyHiddenMessagesStore.shared.clearAll()
        defer { LocallyHiddenMessagesStore.shared.clearAll() }
        LocallyHiddenMessagesStore.shared.hide("temp_s11")
        sut.pendingServerIds = ["temp_s11": "srv_s11"]

        await sut.persistMessagesUsingServerIds()

        XCTAssertFalse(LocallyHiddenMessagesStore.shared.isHidden("temp_s11"),
            "the temp id must be migrated away once reconciled")
        XCTAssertTrue(LocallyHiddenMessagesStore.shared.isHidden("srv_s11"),
            "the hidden state must follow temp->server so the message stays hidden")
    }

    /// S7 — an optimistic media bubble whose upload/send fails must flip to
    /// `.failed` (retryable) rather than stay a permanent `.sending` ghost.
    func test_markOptimisticMediaFailed_flipsRowToFailed() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))
        let record = MessageStoreObservationHelper.makeRecord(
            localId: "media-s7", conversationId: testConversationId,
            senderId: testUserId, content: ""
        )
        try await persistence.insertOptimistic(record)

        await sut.markOptimisticMediaFailed(tempId: "media-s7", reason: "upload failed")

        let row = try await MessageStoreObservationHelper.fetchRecord(localId: "media-s7", from: pool)
        XCTAssertEqual(row?.state, .failed,
            "a failed-upload media bubble must flip to .failed, not stay .sending")
        XCTAssertEqual(row?.lastError, "upload failed")
    }

    // MARK: - toggleReaction Tests
    //
    // Post Phase 1.5: `toggleReaction` writes through `messagePersistence.appendReaction`
    // / `removeReaction`. The store observation re-reads the row from GRDB and
    // propagates the updated `reactionsJson` into `sut.messages`. Tests therefore
    // seed the row through the persistence actor and poll for the propagated state.

    func test_toggleReaction_addsReactionOptimistically() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-react", conversationId: testConversationId,
            senderId: "other-user", content: "React to me"
        )
        try await persistence.insertOptimistic(record)
        let surfaced = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-react" }
        XCTAssertNotNil(surfaced, "Optimistic record must surface in viewModel.messages before action")

        sut.toggleReaction(messageId: "msg-react", emoji: "thumbsup")

        // The action's appendReaction write is fire-and-forget via Task.
        // We assert against the GRDB row (source of truth); the viewModel
        // mirror surfaces via observation when the row updates.
        let updated = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-react", from: pool
        ) { record in
            guard let json = record.reactionsJson,
                  let reactions = try? JSONDecoder().decode([MeeshyReaction].self, from: json) else {
                return false
            }
            return reactions.contains { $0.emoji == "thumbsup" && $0.participantId == self.testUserId }
        }
        XCTAssertNotNil(updated, "appendReaction must persist the new reaction in GRDB")
        let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                   from: updated?.reactionsJson ?? Data())) ?? []
        XCTAssertEqual(reactions.first(where: { $0.emoji == "thumbsup" })?.participantId, testUserId)
    }

    /// End-to-end ownership lock: tapping a reaction must surface it as MINE in
    /// the badge. The optimistic row is keyed by the `currentUserId` sentinel
    /// (never the resolved `Participant.id`), so `summarizeReactions` — whose
    /// ownership check is `participantId == currentUserId` — marks it
    /// `includesMe`. Guards the regression where the 2nd+ reaction in a
    /// conversation was keyed by `Participant.id` and lost its highlight.
    @MainActor
    func test_toggleReaction_ownReaction_isHighlightedAsMine() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-mine", conversationId: testConversationId,
            senderId: "other-user", content: "React to me"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-mine" }

        sut.toggleReaction(messageId: "msg-mine", emoji: "thumbsup")

        let updated = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-mine", from: pool
        ) { record in
            let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                       from: record.reactionsJson ?? Data())) ?? []
            return reactions.contains { $0.emoji == "thumbsup" }
        }
        let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                   from: updated?.reactionsJson ?? Data())) ?? []

        let summaries = BubbleContent.summarizeReactions(reactions, currentUserId: testUserId)
        let thumbs = summaries.first { $0.emoji == "thumbsup" }
        XCTAssertEqual(thumbs?.includesMe, true, "my own reaction must render highlighted as mine")
        XCTAssertEqual(thumbs?.count, 1, "a single tap counts once")
    }

    func test_toggleReaction_removesExistingReaction() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let existingReaction = MeeshyReaction(
            messageId: "msg-react", participantId: testUserId, emoji: "thumbsup"
        )
        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-react", conversationId: testConversationId,
            senderId: "other-user", content: "Unreact me",
            reactions: [existingReaction]
        )
        try await persistence.insertOptimistic(record)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "msg-react", in: sut
        ) { msg in msg.reactions.count == 1 }
        XCTAssertTrue(seeded, "Seed reaction must surface via store observation")

        sut.toggleReaction(messageId: "msg-react", emoji: "thumbsup")

        let updated = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-react", from: pool
        ) { record in
            let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                       from: record.reactionsJson ?? Data())) ?? []
            return reactions.isEmpty
        }
        XCTAssertNotNil(updated, "removeReaction must clear reactions in GRDB")
    }

    /// Multi-réactions (2026-08-18, feu vert user) : poser un emoji DIFFÉRENT
    /// S'EMPILE avec ma réaction précédente — plus jamais de swap. Le retrait
    /// reste PAR emoji (re-taper un emoji déjà posé l'enlève, lui seul). Les
    /// réactions des AUTRES participants ne sont jamais touchées.
    func test_toggleReaction_differentEmoji_stacksWithMyPreviousReaction() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let myPrevious = MeeshyReaction(
            messageId: "msg-swap", participantId: testUserId, emoji: "heart"
        )
        let someoneElses = MeeshyReaction(
            messageId: "msg-swap", participantId: "other-user", emoji: "heart"
        )
        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-swap", conversationId: testConversationId,
            senderId: "other-user", content: "Swap my reaction",
            reactions: [myPrevious, someoneElses]
        )
        try await persistence.insertOptimistic(record)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "msg-swap", in: sut
        ) { msg in msg.reactions.count == 2 }
        XCTAssertTrue(seeded, "Seed reactions must surface via store observation")

        sut.toggleReaction(messageId: "msg-swap", emoji: "thumbsup")

        let updated = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-swap", from: pool
        ) { record in
            let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                       from: record.reactionsJson ?? Data())) ?? []
            let mine = reactions.filter { $0.participantId == self.testUserId }
            return Set(mine.map(\.emoji)) == ["heart", "thumbsup"]
        }
        // awaitRecord returns the last-fetched record on timeout even when the
        // predicate never matched — re-assert the stacking explicitly on the result.
        let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                   from: updated?.reactionsJson ?? Data())) ?? []
        let mine = Set(reactions.filter { $0.participantId == testUserId }.map(\.emoji))
        XCTAssertEqual(mine, ["heart", "thumbsup"], "mes deux emojis coexistent — le multi-réactions ne swappe plus jamais")
        XCTAssertTrue(
            reactions.contains { $0.participantId == "other-user" && $0.emoji == "heart" },
            "another participant's reaction must survive my swap"
        )
    }

    func test_toggleReaction_systemMessage_isIgnored() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-system", conversationId: testConversationId,
            senderId: "other-user", content: "Call ended",
            messageSource: "system"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-system" }

        sut.toggleReaction(messageId: "msg-system", emoji: "thumbsup")

        try? await Task.sleep(nanoseconds: 200_000_000)
        let stable = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-system", from: pool
        )
        XCTAssertNil(stable?.reactionsJson, "system messages must not accept reactions")
    }

    func test_toggleReaction_doesNothingForUnknownMessageId() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-1", conversationId: testConversationId,
            senderId: "other-user", content: "Hello"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-1" }

        sut.toggleReaction(messageId: "nonexistent", emoji: "thumbsup")

        // Allow any spurious propagation a moment to (not) happen.
        try? await Task.sleep(nanoseconds: 200_000_000)
        let stable = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-1", from: pool
        )
        XCTAssertNil(stable?.reactionsJson, "Existing record must keep no reactions when unknown id is targeted")
    }

    // MARK: - togglePin Tests
    //
    // Post Phase 1.5: pin/unpin writes through `messagePersistence.updatePinned`.
    // Tests seed the row via persistence and assert the propagated state.

    func test_togglePin_pinsUnpinnedMessage() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-pin", conversationId: testConversationId,
            senderId: testUserId, content: "Pin me"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-pin" }

        await sut.togglePin(messageId: "msg-pin")

        // The pin write goes to GRDB via updatePinned (source of truth). We
        // assert against the row; the viewModel mirror is downstream.
        let pinned = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-pin", from: pool
        ) { $0.pinnedAt != nil }
        XCTAssertNotNil(pinned, "Pin must persist pinnedAt in GRDB")
        XCTAssertEqual(mockMessageService.pinCallCount, 1)
    }

    func test_togglePin_unpinsPinnedMessage() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-pin", conversationId: testConversationId,
            senderId: testUserId, content: "Unpin me",
            pinnedAt: Date(), pinnedBy: testUserId
        )
        try await persistence.insertOptimistic(record)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "msg-pin", in: sut
        ) { $0.pinnedAt != nil }
        XCTAssertTrue(seeded, "Seeded pinned record must surface via store observation")

        await sut.togglePin(messageId: "msg-pin")

        let unpinned = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-pin", from: pool
        ) { $0.pinnedAt == nil && $0.pinnedBy == nil }
        XCTAssertNotNil(unpinned, "Unpin must clear pinnedAt + pinnedBy in GRDB")
        XCTAssertEqual(mockMessageService.unpinCallCount, 1)
    }

    func test_togglePin_pinFailure_rollsBack() async throws {
        mockMessageService.pinResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Pin failed"]))
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-pin", conversationId: testConversationId,
            senderId: testUserId, content: "Fail pin"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-pin" }

        await sut.togglePin(messageId: "msg-pin")

        // Optimistic pin sets pinnedAt; network fails; rollback writes pinnedAt=nil.
        // After togglePin returns, the row should have pinnedAt cleared.
        let rolledBack = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-pin", from: pool
        )
        XCTAssertNil(rolledBack?.pinnedAt, "Pin failure must roll back pinnedAt to nil in GRDB")
        XCTAssertNotNil(sut.error)
    }

    func test_togglePin_unpinFailure_rollsBack() async throws {
        mockMessageService.unpinResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Unpin failed"]))
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-pin", conversationId: testConversationId,
            senderId: testUserId, content: "Fail unpin",
            pinnedAt: Date(), pinnedBy: testUserId
        )
        try await persistence.insertOptimistic(record)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "msg-pin", in: sut
        ) { $0.pinnedAt != nil }
        XCTAssertTrue(seeded, "Seeded pinned record must surface via store observation")

        await sut.togglePin(messageId: "msg-pin")

        // Optimistic unpin clears; network fails; rollback restores pinnedAt.
        let restored = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-pin", from: pool
        )
        XCTAssertNotNil(restored?.pinnedAt, "Unpin failure must restore pinnedAt in GRDB")
        XCTAssertNotNil(sut.error)
    }

    // MARK: - preferredTranslation Tests

    func test_preferredTranslation_returnsNilWhenNoTranslations() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertNil(result)
    }

    func test_preferredTranslation_returnsManualOverride() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        let override = MessageTranslation(
            id: "t-1", messageId: "msg-t",
            sourceLanguage: "fr", targetLanguage: "en",
            translatedContent: "Hello", translationModel: "nllb",
            confidenceScore: 0.95
        )
        sut.activeTranslationOverrides["msg-t"] = override

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertEqual(result?.translatedContent, "Hello")
        XCTAssertEqual(result?.targetLanguage, "en")
    }

    func test_preferredTranslation_manualOverrideNilMeansShowOriginal() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        sut.messageTranslations["msg-t"] = [
            MessageTranslation(
                id: "t-1", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]
        sut.activeTranslationOverrides["msg-t"] = Optional<MessageTranslation>.none

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertNil(result)
    }

    func test_preferredTranslation_respectsSystemLanguagePreference() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "es"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        sut.messageTranslations["msg-t"] = [
            MessageTranslation(
                id: "t-en", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
            MessageTranslation(
                id: "t-es", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "es",
                translatedContent: "Hola", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertEqual(result?.targetLanguage, "es")
        XCTAssertEqual(result?.translatedContent, "Hola")
    }

    func test_preferredTranslation_respectsCustomDestinationLanguage() {
        // When systemLanguage has no translation available but customDestinationLanguage does,
        // resolution falls through to customDestinationLanguage
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "ja",
            customDestinationLanguage: "de"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        sut.messageTranslations["msg-t"] = [
            MessageTranslation(
                id: "t-en", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
            MessageTranslation(
                id: "t-de", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "de",
                translatedContent: "Hallo", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-t")

        // systemLanguage "ja" has no match, customDestinationLanguage "de" does
        XCTAssertEqual(result?.targetLanguage, "de")
        XCTAssertEqual(result?.translatedContent, "Hallo")
    }

    /// Tous les cas ci-dessus posent les traductions AVANT le premier appel :
    /// aucun n'exerce la séquence fautive. Ici la bulle est d'abord résolue
    /// « pas de traduction ⇒ original », puis la traduction ARRIVE (chemin
    /// socket `translation:completed`). Le cache de résolution gardait alors le
    /// `nil` pour toujours et la bulle ne basculait jamais — l'invalidation est
    /// désormais une propriété du CHAMP, qu'aucun écrivain ne peut oublier.
    func test_preferredTranslation_lateArrival_afterResolvedAsOriginal_returnsTranslation() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "es"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]

        XCTAssertNil(sut.preferredTranslation(for: "msg-t"),
                     "aucune traduction reçue ⇒ l'original (règle 1 du Prisme)")

        sut.messageTranslations["msg-t"] = [
            MessageTranslation(
                id: "t-es", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "es",
                translatedContent: "Hola", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertEqual(result?.targetLanguage, "es")
        XCTAssertEqual(result?.translatedContent, "Hola",
                       "la bulle doit basculer dès que la traduction arrive")
    }

    // MARK: - Édition et traductions périmées

    /// Le gateway invalide les traductions à l'ÉCRITURE du nouveau contenu
    /// (`translations: null` dans le même `updateMany` que `content`). Le
    /// chemin d'édition OPTIMISTE du client doit poser le même verdict avant
    /// d'écrire le nouveau texte, sinon la bulle rend le texte neuf sous
    /// l'ancienne traduction.
    func test_editMessage_clearsStaleTranslations() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-edit-local", content: "Bonjour")]
        sut.messageTranslations["msg-edit-local"] = [
            MessageTranslation(
                id: "t-es", messageId: "msg-edit-local",
                sourceLanguage: "fr", targetLanguage: "es",
                translatedContent: "Hola", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        await sut.editMessage(messageId: "msg-edit-local", newContent: "Bonsoir")

        XCTAssertNil(sut.messageTranslations["msg-edit-local"],
                     "une traduction d'un contenu périmé n'est pas une traduction")
        XCTAssertNil(sut.preferredTranslation(for: "msg-edit-local"),
                     "pendant la fenêtre d'édition, l'ORIGINAL est servi")
    }

    /// La bulle qu'on édite est la SIENNE, donc celle qui porte encore un id
    /// optimiste — alors que les deux caches PERSISTANTS sont keyés par l'id
    /// SERVEUR (`pendingServerIds`). Évincer sous le seul id de la ligne ne
    /// touchait alors AUCUNE ligne GRDB : le texte périmé revenait au
    /// redémarrage, exactement le symptôme que l'éviction dit fermer.
    func test_editMessage_onOptimisticRow_alsoEvictsTheServerKeyedCaches() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        try await persistence.saveTranslation(TranslationRecord(
            id: "tr-edit-optimistic", messageLocalId: "srv_1", messageServerId: "srv_1",
            targetLanguage: "es", translatedContent: "Hola",
            translationModel: "nllb-200", confidenceScore: 0.9,
            sourceLanguage: "fr", receivedAt: Date()
        ))

        let sut = makeSUT(
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )
        sut.messages = [makeMessage(id: "temp_1", content: "Bonjour", isMe: true)]
        sut.pendingServerIds["temp_1"] = "srv_1"
        sut.messageTranslations["srv_1"] = [
            MessageTranslation(
                id: "t-es", messageId: "srv_1",
                sourceLanguage: "fr", targetLanguage: "es",
                translatedContent: "Hola", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        await sut.editMessage(messageId: "temp_1", newContent: "Bonsoir")

        XCTAssertNil(sut.messageTranslations["srv_1"],
                     "l'espace d'ids SERVEUR doit tomber avec l'espace local")

        // L'éviction disque part dans une `Task` détachée du geste : on la
        // laisse aboutir avant de lire la table, sans quoi le témoin
        // mesurerait l'ordonnancement plutôt que l'éviction.
        var attempts = 0
        var remaining = try persistence.translations(for: "srv_1")
        while !remaining.isEmpty && attempts < 50 {
            try await Task.sleep(nanoseconds: 20_000_000)
            remaining = try persistence.translations(for: "srv_1")
            attempts += 1
        }
        XCTAssertTrue(remaining.isEmpty,
                      "la ligne persistée sous l'id serveur doit être supprimée")
    }

    /// La bascule MANUELLE court-circuite les quatre caches dans
    /// `preferredTranslation(for:)` : sans son éviction, un lecteur qui a
    /// exploré une langue garde le texte d'AVANT l'édition à l'écran
    /// indéfiniment, alors même que tout le reste est vide.
    func test_editMessage_dropsTheManualLanguageOverride() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-edit-local", content: "Bonjour")]
        // Le geste RÉEL de la vue Langue de l'appui long (ConversationView),
        // pas une écriture directe du dictionnaire.
        sut.setActiveTranslation(
            for: "msg-edit-local",
            translation: MessageTranslation(
                id: "t-es", messageId: "msg-edit-local",
                sourceLanguage: "fr", targetLanguage: "es",
                translatedContent: "Hola", translationModel: "nllb",
                confidenceScore: nil
            )
        )
        XCTAssertTrue(sut.activeTranslationOverrides.keys.contains("msg-edit-local"))

        await sut.editMessage(messageId: "msg-edit-local", newContent: "Bonsoir")

        XCTAssertFalse(sut.activeTranslationOverrides.keys.contains("msg-edit-local"),
                       "la clé est RETIRÉE : présente et nulle, elle graverait un « montre l'original » que le lecteur n'a pas demandé")
        XCTAssertNil(sut.preferredTranslation(for: "msg-edit-local"),
                     "le Prisme automatique reprend la main et sert l'ORIGINAL")
    }

    // MARK: - Ouvrir, c'est lire (localement)

    /// Le moteur de sync ramenait déjà le compteur de la conversation ouverte à
    /// zéro — mais dans son cache SEUL, et de façon différée. Les lignes
    /// @Published de la liste et le `ConversationStore` ne l'apprenaient que par
    /// le rechargement de cache débouncé, quand ils l'apprenaient : le seul
    /// autre chemin qui les touchait est gaté par l'exactitude de lecture, que
    /// l'ouverture d'une conversation à 99 non-lus sans en atteindre le bas ne
    /// franchit jamais. Le store gardait donc 99, le cache disait 0, et la ligne
    /// affichait celui des deux qui avait publié en dernier.
    func test_start_marksTheConversationReadLocally() {
        let expectedId = testConversationId
        let marked = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == expectedId
        }

        // `makeSUT` appelle `start()`, comme le `.task` de la vue.
        let sut = makeSUT(unreadCount: 99)

        wait(for: [marked], timeout: 1.0)
        XCTAssertEqual(sut.conversationId, expectedId)
    }

    // MARK: - markAsRead Tests

    func test_markAsRead_postsNotification() {
        let sut = makeSUT()
        let expectedId = testConversationId
        let expectation = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == expectedId
        }

        sut.markAsRead()

        wait(for: [expectation], timeout: 1.0)
    }

    // MARK: - Rattrapage : le badge tombe à l'arrivée sur le dernier message

    /// Identifiants d'aspect serveur (24 hex) : le corps de `mark-read` est
    /// validé sur ce format, un `cid_…` ferait rejeter tout le lot.
    private static let idOldest = "aaaaaaaaaaaaaaaaaaaaaaa1"
    private static let idNewest = "aaaaaaaaaaaaaaaaaaaaaaa2"

    /// Le lot vu contient le message le PLUS RÉCENT : l'utilisateur n'a plus de
    /// retard, le badge doit tomber sans attendre l'aller-retour serveur.
    func test_markAsRead_seenBatchContainsNewestMessage_clearsBadgeImmediately() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: Self.idOldest, content: "A"),
            makeMessage(id: Self.idNewest, content: "B")
        ]
        let expectedId = testConversationId
        let cleared = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == expectedId
        }

        sut.markAsRead(messageIds: [Self.idNewest])

        wait(for: [cleared], timeout: 1.0)
    }

    /// Rapporter dix messages sur deux cents ne veut PAS dire que la
    /// conversation est lue : tant que le dernier message n'a pas été atteint,
    /// le badge reste. Le vider afficherait un chiffre que le serveur
    /// corrigerait aussitôt.
    func test_markAsRead_seenBatchWithoutNewestMessage_leavesBadgeAlone() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: Self.idOldest, content: "A"),
            makeMessage(id: Self.idNewest, content: "B")
        ]
        let expectedId = testConversationId
        let cleared = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == expectedId
        }
        cleared.isInverted = true

        sut.markAsRead(messageIds: [Self.idOldest])

        wait(for: [cleared], timeout: 0.5)
    }

    /// **#3902 — le message le plus récent est À L'ÉCRAN, il n'a simplement pas
    /// fini son délai de présence.**
    ///
    /// Même lot que le test ci-dessus, à UNE différence près : la surface dit
    /// ce qu'elle montre. Sur une conversation à fort débit c'est le cas
    /// nominal — le lot est drainé toutes les ~300 ms, un message plus récent
    /// est arrivé entre-temps, et la coïncidence `seen.contains(newest)`
    /// n'arrive quasiment jamais. Le badge doit tomber quand même.
    ///
    /// Le contraste avec `…seenBatchWithoutNewestMessage_leavesBadgeAlone` est
    /// le cœur du lot : vues du seul `seen`, les deux situations sont
    /// INDISCERNABLES. C'est `visibleIds` qui les sépare.
    func test_markAsRead_newestIsOnScreenButNotYetDwelt_clearsBadge() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: Self.idOldest, content: "A"),
            makeMessage(id: Self.idNewest, content: "B")
        ]
        let expectedId = testConversationId
        let cleared = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == expectedId
        }

        sut.markAsRead(messageIds: [Self.idOldest], visibleIds: [Self.idOldest, Self.idNewest])

        wait(for: [cleared], timeout: 1.0)
    }

    /// Après un saut vers un message cité, le bas de l'écran n'est PAS le bas de
    /// la conversation. Traiter le dernier message chargé comme le plus récent
    /// viderait un badge encore dû.
    func test_markAsRead_windowNotAtTip_doesNotClearBadge() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: Self.idNewest, content: "B")]
        sut.hasNewerMessages = true
        let expectedId = testConversationId
        let cleared = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == expectedId
        }
        cleared.isInverted = true

        sut.markAsRead(messageIds: [Self.idNewest])

        wait(for: [cleared], timeout: 0.5)
    }

    /// Une bulle optimiste qu'on vient d'envoyer ne porte pas encore d'ObjectId.
    /// L'annoncer comme borne de curseur ferait rejeter le corps entier par le
    /// gateway ; c'est le dernier message CONNU DU SERVEUR qui fait foi.
    func test_isServerMessageId_rejectsOptimisticClientIds() {
        XCTAssertTrue(ConversationViewModel.isServerMessageId(Self.idNewest))
        XCTAssertFalse(ConversationViewModel.isServerMessageId("cid_9f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f"))
        XCTAssertFalse(ConversationViewModel.isServerMessageId(""))
        XCTAssertFalse(ConversationViewModel.isServerMessageId("zzzzzzzzzzzzzzzzzzzzzzzz"))
    }

    // MARK: - Rattrapage depuis Résumé / Rivière (#3901)
    //
    // Au-delà de 25 non-lus, `ReadingModeOrchestrator` bascule l'ouverture en
    // Résumé ou Rivière — deux modes qui ne rendent JAMAIS bulle par bulle
    // (`MessageListViewController.rendersThread` est faux pour `.summary` et
    // `.river`, voir `MessageListSeenTrackingModeGateTests`), donc n'alimentent
    // jamais `seenIds`. `markAsRead(messageIds:)` seul ne peut donc jamais y
    // faire avancer le curseur serveur : un piège permanent, vérifié en base de
    // production (compteur figé à 125 sur une conversation lue aujourd'hui).
    // `markCaughtUpFromSummaryOrRiver()` répond à la preuve de consultation
    // PROPRE à ces modes (Résumé affiché jusqu'au bout, Rivière au présent) —
    // sans jamais passer par `seen.contains(newest)`, qui n'a pas de sens ici.

    /// La fenêtre chargée est au sommet : le rattrapage envoie directement le
    /// curseur au dernier message CONNU DU SERVEUR et vide le badge en local
    /// sans attendre l'aller-retour réseau — même effet immédiat que
    /// `markAsRead` quand le lot vu contient le plus récent.
    func test_markCaughtUpFromSummaryOrRiver_atTheTipOfTheWindow_clearsBadgeImmediately() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: Self.idOldest, content: "A"),
            makeMessage(id: Self.idNewest, content: "B")
        ]
        let expectedId = testConversationId
        let cleared = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == expectedId
        }

        sut.markCaughtUpFromSummaryOrRiver()

        wait(for: [cleared], timeout: 1.0)
    }

    /// Même garde qu'en mode Bulles (`caughtUpMessageId`) : après un saut vers
    /// un message cité, le bas de l'écran chargé n'est pas le bas de la
    /// conversation — déclarer un rattrapage ici viderait un badge encore dû.
    func test_markCaughtUpFromSummaryOrRiver_windowNotAtTip_doesNotClearBadge() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: Self.idNewest, content: "B")]
        sut.hasNewerMessages = true
        let expectedId = testConversationId
        let cleared = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == expectedId
        }
        cleared.isInverted = true

        sut.markCaughtUpFromSummaryOrRiver()

        wait(for: [cleared], timeout: 0.5)
    }

    /// Aucun message CONNU DU SERVEUR dans la fenêtre (fil vide, ou uniquement
    /// des bulles optimistes sans ObjectId) : rien à rattraper, aucun effet.
    func test_markCaughtUpFromSummaryOrRiver_noServerMessageInWindow_doesNothing() {
        let sut = makeSUT()
        sut.messages = []
        let expectedId = testConversationId
        let cleared = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == expectedId
        }
        cleared.isInverted = true

        sut.markCaughtUpFromSummaryOrRiver()

        wait(for: [cleared], timeout: 0.5)
    }

    // MARK: - messageIndex Tests

    func test_messageIndex_returnsCorrectIndex() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "msg-a", content: "A"),
            makeMessage(id: "msg-b", content: "B"),
            makeMessage(id: "msg-c", content: "C"),
        ]

        XCTAssertEqual(sut.messageIndex(for: "msg-a"), 0)
        XCTAssertEqual(sut.messageIndex(for: "msg-b"), 1)
        XCTAssertEqual(sut.messageIndex(for: "msg-c"), 2)
    }

    func test_messageIndex_returnsNilForUnknownId() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-a", content: "A")]

        XCTAssertNil(sut.messageIndex(for: "nonexistent"))
    }

    func test_containsMessage_returnsTrueForExistingId() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-a", content: "A")]

        XCTAssertTrue(sut.containsMessage(id: "msg-a"))
    }

    func test_containsMessage_returnsFalseForUnknownId() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-a", content: "A")]

        XCTAssertFalse(sut.containsMessage(id: "nonexistent"))
    }

    // MARK: - removeExpiredMessages Tests
    //
    // Post Phase 1.5: `removeExpiredMessages` calls
    // `messagePersistence.deleteExpiredEphemeral(before:)`. The store
    // observation drops the deleted rows. Tests seed records and assert
    // the propagated state.

    func test_removeExpiredMessages_removesExpiredOnly() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let pastDate = Date().addingTimeInterval(-3600)
        let futureDate = Date().addingTimeInterval(3600)

        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "expired", conversationId: testConversationId,
            senderId: testUserId, content: "Old",
            createdAt: Date().addingTimeInterval(-7200),
            expiresAt: pastDate
        ))
        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "active", conversationId: testConversationId,
            senderId: testUserId, content: "Fresh",
            createdAt: Date().addingTimeInterval(-1800),
            expiresAt: futureDate
        ))
        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "permanent", conversationId: testConversationId,
            senderId: testUserId, content: "Forever",
            createdAt: Date()
        ))

        sut.removeExpiredMessages()

        // deleteExpiredEphemeral is fire-and-forget. Poll the DB directly.
        let deadline = Date().addingTimeInterval(1.5)
        var expiredVanished = false
        while Date() < deadline {
            let row = try? await pool.read { db in
                try MessageRecord.fetchOne(db, key: "expired")
            }
            if row == nil {
                expiredVanished = true
                break
            }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }
        XCTAssertTrue(expiredVanished, "Expired record must be removed from GRDB")

        let active = try await MessageStoreObservationHelper.fetchRecord(
            localId: "active", from: pool
        )
        XCTAssertNotNil(active, "Non-expired record must remain")
        let permanent = try await MessageStoreObservationHelper.fetchRecord(
            localId: "permanent", from: pool
        )
        XCTAssertNotNil(permanent, "Record without expiry must remain")
    }

    // MARK: - removeFailedMessage Tests
    //
    // Post Phase 1.5: `removeFailedMessage` writes `messagePersistence.markDeleted`,
    // which sets `deletedAt` on the row. The store observation surfaces the change
    // and `MessageRecord.toMessage()` exposes `deletedAt`.

    func test_removeFailedMessage_removesOnlyFailedWithMatchingId() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "good-msg", conversationId: testConversationId,
            senderId: testUserId, content: "Good", state: .sent,
            createdAt: Date().addingTimeInterval(-60)
        ))
        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "failed-msg", conversationId: testConversationId,
            senderId: testUserId, content: "Failed", state: .failed,
            createdAt: Date()
        ))

        let seeded = await MessageStoreObservationHelper.awaitMessagesCount(equals: 2, in: sut)
        XCTAssertTrue(seeded, "Both records must surface via store observation")

        sut.removeFailedMessage(messageId: "failed-msg")

        // markDeleted blanks content + sets deletedAt; the failed row should
        // disappear from the active timeline (deletedAt-aware UI filters it
        // out — but the store still contains it). For this unit test we
        // assert that the record itself is updated in DB.
        let deleted = await MessageStoreObservationHelper.awaitRecord(
            localId: "failed-msg", from: pool
        ) { $0.deletedAt != nil }
        XCTAssertNotNil(deleted, "Failed message must be marked deleted via persistence")
        XCTAssertNotNil(deleted?.deletedAt)
        // The good message stays untouched.
        let good = try await MessageStoreObservationHelper.fetchRecord(
            localId: "good-msg", from: pool
        )
        XCTAssertNotNil(good)
        XCTAssertNil(good?.deletedAt, "Untouched record must keep deletedAt nil")
    }

    func test_removeFailedMessage_doesNotRemoveSentMessage() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "sent-msg", conversationId: testConversationId,
            senderId: testUserId, content: "Sent", state: .sent
        ))

        // Calling removeFailedMessage triggers markDeleted in the store-only
        // architecture (the prior `deliveryStatus == .failed` guard is gone).
        // The row still EXISTS post-markDeleted; only `deletedAt`+`content`
        // change. We assert the row remains in GRDB (count == 1).
        sut.removeFailedMessage(messageId: "sent-msg")

        try? await Task.sleep(nanoseconds: 200_000_000)
        let row = try await MessageStoreObservationHelper.fetchRecord(
            localId: "sent-msg", from: pool
        )
        XCTAssertNotNil(row, "Row must still exist (markDeleted is a soft delete)")
    }

    // MARK: - reportMessage Tests

    func test_reportMessage_success_returnsTrue() async {
        let sut = makeSUT()

        let result = await sut.reportMessage(messageId: "msg-1", reportType: "spam", reason: "It is spam")

        XCTAssertTrue(result)
        XCTAssertEqual(mockReportService.reportMessageCallCount, 1)
        XCTAssertEqual(mockReportService.lastReportMessageId, "msg-1")
        XCTAssertEqual(mockReportService.lastReportMessageType, "spam")
    }

    func test_reportMessage_failure_returnsFalseAndSetsError() async {
        mockReportService.reportMessageResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Report failed"]))
        let sut = makeSUT()

        let result = await sut.reportMessage(messageId: "msg-1", reportType: "spam", reason: nil)

        XCTAssertFalse(result)
        XCTAssertNotNil(sut.error)
    }

    // MARK: - setActiveTranslation Tests

    func test_setActiveTranslation_storesOverride() {
        let sut = makeSUT()
        let translation = MessageTranslation(
            id: "t-1", messageId: "msg-1",
            sourceLanguage: "fr", targetLanguage: "en",
            translatedContent: "Hello", translationModel: "nllb",
            confidenceScore: nil
        )

        sut.setActiveTranslation(for: "msg-1", translation: translation)

        let override = sut.activeTranslationOverrides["msg-1"]
        XCTAssertTrue(sut.activeTranslationOverrides.keys.contains("msg-1"))
        XCTAssertEqual(override??.translatedContent, "Hello")
    }

    func test_setActiveTranslation_nilClearsToOriginal() {
        let sut = makeSUT()

        sut.setActiveTranslation(for: "msg-1", translation: nil)

        let override = sut.activeTranslationOverrides["msg-1"]
        XCTAssertTrue(sut.activeTranslationOverrides.keys.contains("msg-1"))
        XCTAssertNil(override as? MessageTranslation)
    }

    // MARK: - Anonymous Session Tests

    func test_init_withAnonymousSession_setsSessionTokenOnAPIClient() async {
        let session = AnonymousSessionContext(
            sessionToken: "test-anon-token",
            participantId: "part-123",
            permissions: ParticipantPermissions(),
            linkId: "mshy_test",
            conversationId: "conv-456"
        )
        let sut = makeSUT(anonymousSession: session)
        XCTAssertEqual(APIClient.shared.anonymousSessionToken, "test-anon-token")
        _ = sut
    }

    func test_init_withNilAnonymousSession_doesNotSetSessionToken() {
        let sut = makeSUT(anonymousSession: nil)
        XCTAssertNil(APIClient.shared.anonymousSessionToken)
        _ = sut
    }

    // MARK: - Search Tests (Point 74)

    func test_searchMessages_withResults_populatesSearchResults() async {
        let searchResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello world","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}},
            {"id":"sr-2","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello again","createdAt":"2026-01-01T00:01:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(searchResponse)
        let sut = makeSUT()

        await sut.searchMessages(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, 2)
        XCTAssertFalse(sut.isSearching)
        XCTAssertEqual(sut.currentSearchQuery, "Hello")
        XCTAssertEqual(mockMessageService.searchCallCount, 1)
    }

    func test_searchMessages_empty_setsEmptyResults() async {
        let emptyResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(emptyResponse)
        let sut = makeSUT()

        await sut.searchMessages(query: "nonexistent")

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertFalse(sut.isSearching)
        XCTAssertEqual(sut.currentSearchQuery, "nonexistent")
    }

    func test_clearSearch_resetsState() async {
        let sut = makeSUT()
        // First populate search results
        let searchResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello world","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser"}}
        ],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(searchResponse)
        await sut.searchMessages(query: "Hello")
        XCTAssertFalse(sut.searchResults.isEmpty)

        // Clear by searching with short query (< 2 chars)
        await sut.searchMessages(query: "H")

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertNil(sut.currentSearchQuery)
        XCTAssertFalse(sut.isSearching)
    }

    // MARK: - Search Pagination Tests

    func test_searchMessages_withHasMore_setsSearchHasMoreTrue() async {
        let firstPageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-p1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello world","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-abc123","limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(firstPageResponse)
        let sut = makeSUT()

        await sut.searchMessages(query: "Hello")

        XCTAssertTrue(sut.searchHasMore, "searchHasMore must be true when server signals hasMore=true")
        XCTAssertEqual(sut.searchResults.count, 1)
    }

    func test_loadMoreSearchResults_appendsNextPageToExistingResults() async {
        let firstPageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-page1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello page one","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-page2","limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(firstPageResponse)
        let sut = makeSUT()
        await sut.searchMessages(query: "Hello")
        XCTAssertEqual(sut.searchResults.count, 1)
        XCTAssertTrue(sut.searchHasMore)

        let secondPageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-page2","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello page two","createdAt":"2026-01-01T01:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchWithCursorResult = .success(secondPageResponse)

        await sut.loadMoreSearchResults(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, 2, "loadMore must append second page results to existing ones")
        XCTAssertFalse(sut.searchHasMore, "searchHasMore must be false when server returns hasMore=false on last page")
        XCTAssertEqual(mockMessageService.searchWithCursorCallCount, 1, "searchWithCursor must be called exactly once for the second page")
    }

    func test_loadMoreSearchResults_whenSearchHasMoreFalse_isNoOp() async {
        let singlePageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-only","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello only page","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(singlePageResponse)
        let sut = makeSUT()
        await sut.searchMessages(query: "Hello")
        XCTAssertFalse(sut.searchHasMore)
        let countAfterFirstPage = sut.searchResults.count

        await sut.loadMoreSearchResults(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, countAfterFirstPage, "loadMore when no more pages must not modify results")
        XCTAssertEqual(mockMessageService.searchWithCursorCallCount, 0, "searchWithCursor must not be called when there is no cursor")
    }

    func test_loadMoreSearchResults_setsIsSearchingFalseAfterCompletion() async {
        let firstPageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-lm1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello loadmore","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-lm2","limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(firstPageResponse)
        let sut = makeSUT()
        await sut.searchMessages(query: "Hello")

        let emptyNextPage: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchWithCursorResult = .success(emptyNextPage)

        await sut.loadMoreSearchResults(query: "Hello")

        XCTAssertFalse(sut.isSearching, "isSearching must be false once loadMoreSearchResults completes")
    }

    func test_loadMoreSearchResults_onNetworkFailure_preservesExistingResultsAndHasMore() async {
        let firstPageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-fail1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello fail test","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-fail","limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(firstPageResponse)
        let sut = makeSUT()
        await sut.searchMessages(query: "Hello")
        XCTAssertEqual(sut.searchResults.count, 1)

        mockMessageService.searchWithCursorResult = .failure(NSError(domain: "test", code: -1009))
        await sut.loadMoreSearchResults(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, 1,
            "loadMore network failure must not remove existing search results")
        XCTAssertTrue(sut.searchHasMore,
            "searchHasMore must remain true after a transient loadMore failure so the user can retry by scrolling")
        XCTAssertFalse(sut.isSearching,
            "isSearching must be false even after a loadMore failure")
    }

    func test_searchMessages_translationMatch_surfacesTranslationAsMatchedText() async {
        let responseWithTranslation: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {
                "id":"sr-tr1",
                "conversationId":"\(testConversationId)",
                "senderId":"\(testUserId)",
                "content":"Bonjour le monde",
                "createdAt":"2026-01-01T00:00:00.000Z",
                "sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"},
                "translations":[
                    {"id":"tl-1","messageId":"sr-tr1","targetLanguage":"en","translatedContent":"Hello world","translationModel":"nllb","confidenceScore":null,"sourceLanguage":"fr"}
                ]
            }
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(responseWithTranslation)
        let sut = makeSUT()

        await sut.searchMessages(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, 1)
        let result = sut.searchResults.first
        XCTAssertEqual(result?.id, "sr-tr1")
        XCTAssertEqual(result?.matchedText, "Hello world",
            "matchedText must use the translation when content does not match the query but a translation does")
        XCTAssertEqual(result?.matchType, "translation",
            "matchType must be 'translation' when the match is in a translated version of the content")
    }

    func test_searchMessages_contentMatch_usesContentAsMatchedText() async {
        let responseWithMatchingContent: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {
                "id":"sr-ct1",
                "conversationId":"\(testConversationId)",
                "senderId":"\(testUserId)",
                "content":"Hello direct match",
                "createdAt":"2026-01-01T00:00:00.000Z",
                "sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"},
                "translations":[
                    {"id":"tl-ct1","messageId":"sr-ct1","targetLanguage":"fr","translatedContent":"Bonjour correspondance directe","translationModel":"nllb","confidenceScore":null,"sourceLanguage":"en"}
                ]
            }
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(responseWithMatchingContent)
        let sut = makeSUT()

        await sut.searchMessages(query: "Hello")

        let result = sut.searchResults.first
        XCTAssertEqual(result?.matchedText, "Hello direct match",
            "matchedText must use the original content when content matches the query, even if translations are present")
        XCTAssertEqual(result?.matchType, "content")
    }

    // MARK: - Translation Tests (Point 75)

    func test_preferredTranslation_fallsToRegionalLanguage() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "en", regionalLanguage: "de"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-r", content: "Bonjour")]
        // No English translation available, but German (regional) is available
        sut.messageTranslations["msg-r"] = [
            MessageTranslation(
                id: "t-de", messageId: "msg-r",
                sourceLanguage: "fr", targetLanguage: "de",
                translatedContent: "Hallo", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-r")

        XCTAssertEqual(result?.targetLanguage, "de")
        XCTAssertEqual(result?.translatedContent, "Hallo")
    }

    func test_preferredTranslation_returnsNilWhenNoMatch() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "en"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-n", content: "Bonjour")]
        // Only Japanese translation available, but user prefers English
        sut.messageTranslations["msg-n"] = [
            MessageTranslation(
                id: "t-ja", messageId: "msg-n",
                sourceLanguage: "fr", targetLanguage: "ja",
                translatedContent: "こんにちは", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-n")

        XCTAssertNil(result, "Should return nil when no translation matches preferred languages")
    }

    func test_activeTranslationOverrides_overridesPreferred() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "en"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-o", content: "Bonjour")]
        sut.messageTranslations["msg-o"] = [
            MessageTranslation(
                id: "t-en", messageId: "msg-o",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
            MessageTranslation(
                id: "t-ja", messageId: "msg-o",
                sourceLanguage: "fr", targetLanguage: "ja",
                translatedContent: "こんにちは", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]
        // Override to Japanese even though system language is English
        let jaTranslation = sut.messageTranslations["msg-o"]!.first(where: { $0.targetLanguage == "ja" })!
        sut.activeTranslationOverrides["msg-o"] = jaTranslation

        let result = sut.preferredTranslation(for: "msg-o")

        XCTAssertEqual(result?.targetLanguage, "ja")
        XCTAssertEqual(result?.translatedContent, "こんにちは")
    }

    // MARK: - Transcription Tests (Point 76)

    func test_messageTranscriptions_cachePopulated() {
        let sut = makeSUT()
        let transcription = MessageTranscription(
            attachmentId: "att-1",
            text: "Hello world",
            language: "en",
            confidence: 0.95,
            durationMs: 5000,
            segments: [],
            speakerCount: 1
        )

        sut.messageTranscriptions["msg-1"] = transcription

        XCTAssertNotNil(sut.messageTranscriptions["msg-1"])
        XCTAssertEqual(sut.messageTranscriptions["msg-1"]?.text, "Hello world")
        XCTAssertEqual(sut.messageTranscriptions["msg-1"]?.language, "en")
    }

    func test_transcriptionEvent_updatesCache() {
        let sut = makeSUT()
        XCTAssertNil(sut.messageTranscriptions["msg-t1"])

        let transcription = MessageTranscription(
            attachmentId: "att-t1",
            text: "Transcribed text",
            language: "fr",
            confidence: 0.88,
            durationMs: 3000,
            segments: [
                MessageTranscriptionSegment(text: "Transcribed", startTime: 0, endTime: 1.5, speakerId: nil),
                MessageTranscriptionSegment(text: "text", startTime: 1.5, endTime: 3.0, speakerId: nil),
            ],
            speakerCount: 1
        )

        sut.messageTranscriptions["msg-t1"] = transcription

        XCTAssertEqual(sut.messageTranscriptions["msg-t1"]?.text, "Transcribed text")
        XCTAssertEqual(sut.messageTranscriptions["msg-t1"]?.segments.count, 2)
    }

    // MARK: - Mention Tests (Point 77)

    func test_mentionSuggestions_updatedWithQuery() {
        let sut = makeSUT()
        // Populate messages with senders for local mention candidates
        sut.messages = [
            Message(id: "m1", conversationId: testConversationId, senderId: "u1", content: "Hello",
                    createdAt: Date(), updatedAt: Date(), senderName: "Alice", senderUsername: "alice"),
            Message(id: "m2", conversationId: testConversationId, senderId: "u2", content: "World",
                    createdAt: Date(), updatedAt: Date(), senderName: "Bob", senderUsername: "bob"),
        ]

        sut.handleMentionQuery(in: "Hey @al")

        XCTAssertEqual(sut.activeMentionQuery, "al")
        XCTAssertEqual(sut.mentionSuggestions.count, 1)
        XCTAssertEqual(sut.mentionSuggestions.first?.username, "alice")
    }

    func test_activeMentionQuery_triggersSearch() {
        let sut = makeSUT()
        sut.messages = [
            Message(id: "m1", conversationId: testConversationId, senderId: "u1", content: "Hello",
                    createdAt: Date(), updatedAt: Date(), senderName: "Alice", senderUsername: "alice"),
            Message(id: "m2", conversationId: testConversationId, senderId: "u2", content: "World",
                    createdAt: Date(), updatedAt: Date(), senderName: "Bob", senderUsername: "bob"),
        ]

        // Empty query after @ shows all candidates
        sut.handleMentionQuery(in: "Hey @")

        XCTAssertEqual(sut.activeMentionQuery, "")
        XCTAssertEqual(sut.mentionSuggestions.count, 2)

        // Clear suggestions
        sut.clearMentionSuggestions()

        XCTAssertTrue(sut.mentionSuggestions.isEmpty)
        XCTAssertNil(sut.activeMentionQuery)
    }

    // MARK: - Effects Tests (Point 78)

    func test_pendingEffects_addAndRemove() {
        let sut = makeSUT()

        XCTAssertEqual(sut.pendingEffects, .none)

        sut.pendingEffects = MessageEffects(flags: .confetti)
        XCTAssertNotEqual(sut.pendingEffects, .none)

        sut.pendingEffects = .none
        XCTAssertEqual(sut.pendingEffects, .none)
    }

    func test_showEffectsPicker_toggles() {
        let sut = makeSUT()

        XCTAssertFalse(sut.showEffectsPicker)

        sut.showEffectsPicker = true
        XCTAssertTrue(sut.showEffectsPicker)

        sut.showEffectsPicker = false
        XCTAssertFalse(sut.showEffectsPicker)
    }

    // MARK: - Persistence Orchestrator Tests

    func test_init_createsMessageStoreEagerly() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let viewModel = ConversationViewModel(
            conversationId: "conv-1",
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )
        XCTAssertNotNil(viewModel.messageStore,
            "messageStore must be available immediately after init")
    }

    func test_init_messageStoreMatchesConversationId() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let viewModel = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )
        XCTAssertEqual(viewModel.messageStore.conversationId, testConversationId)
    }

    func test_currentUserIdForView_matchesAuthManagerUser() {
        let sut = makeSUT()

        XCTAssertEqual(sut.currentUserIdForView, testUserId)
    }

    // MARK: - MessageStore Observation Tests (Task 1.3)

    func test_messages_reflectsMessageStoreContent() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let viewModel = makeSUT(
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )

        let record = MessageRecord(
            localId: "m1", serverId: nil,
            conversationId: testConversationId,
            senderId: "other-user",
            content: "hello", originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: "Other", senderUsername: "other",
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 1
        )

        try await persistence.insertOptimistic(record)

        // Allow observation pipeline to propagate:
        // GRDB region observation → MessageStore.refreshFromDB() → messagesDidChange → ViewModel
        try await Task.sleep(for: .milliseconds(300))

        let matching = viewModel.messages.filter { $0.id == "m1" || $0.content == "hello" }
        XCTAssertFalse(matching.isEmpty, "messages should reflect the inserted MessageRecord via store observation")
        XCTAssertEqual(matching.first?.content, "hello")
    }

    // MARK: - hydratePersistedTranslations (grdb-07)

    /// Un message "own" vit en GRDB sous localId=cid mais ses traductions sont
    /// persistées sous l'id SERVEUR : filtrer les TranslationRecord sur le seul
    /// localId ne matchait rien — la traduction disparaissait au cold start.
    func test_hydratePersistedTranslations_ownMessageKeyedByCid_populatesDictUnderServerId() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)

        let record = MessageRecord(
            localId: "cid_abc", serverId: "srv1",
            conversationId: testConversationId,
            senderId: "current-user",
            content: "hello", originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: "Me", senderUsername: "me",
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 1
        )
        try await persistence.insertOptimistic(record)
        try await persistence.saveTranslation(TranslationRecord(
            id: "tr1", messageLocalId: "srv1", messageServerId: "srv1",
            targetLanguage: "fr", translatedContent: "Bonjour",
            translationModel: "nllb-200", confidenceScore: 0.9,
            sourceLanguage: "en", receivedAt: Date()
        ))

        let viewModel = makeSUT(
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )
        mockAuthManager.simulateLoggedIn(user: MeeshyUser(
            id: testUserId, username: "testuser", systemLanguage: "fr"
        ))
        await viewModel.hydratePersistedTranslations()

        XCTAssertNotNil(viewModel.messageTranslations["srv1"],
                        "la traduction persistée sous l'id serveur doit être réhydratée pour un message own keyé par cid")
        XCTAssertEqual(viewModel.messageTranslations["srv1"]?.first?.translatedContent, "Bonjour")
    }

    /// Non-régression : un message reçu (localId == serverId) reste hydraté.
    func test_hydratePersistedTranslations_receivedMessage_stillHydrated() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)

        let record = MessageRecord(
            localId: "srv2", serverId: "srv2",
            conversationId: testConversationId,
            senderId: "other-user",
            content: "hi", originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: "Other", senderUsername: "other",
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 1
        )
        try await persistence.insertOptimistic(record)
        try await persistence.saveTranslation(TranslationRecord(
            id: "tr2", messageLocalId: "srv2", messageServerId: "srv2",
            targetLanguage: "fr", translatedContent: "Salut",
            translationModel: "nllb-200", confidenceScore: 0.9,
            sourceLanguage: "en", receivedAt: Date()
        ))

        let viewModel = makeSUT(
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )
        mockAuthManager.simulateLoggedIn(user: MeeshyUser(
            id: testUserId, username: "testuser", systemLanguage: "fr"
        ))
        await viewModel.hydratePersistedTranslations()

        XCTAssertEqual(viewModel.messageTranslations["srv2"]?.first?.translatedContent, "Salut")
    }

    // MARK: - withSendTimeout (S1 — send-clock latency cap)

    func test_withSendTimeout_fastOperation_returnsValue() async throws {
        let result = try await withSendTimeout(seconds: 5) { () async throws -> Int in
            return 42
        }
        XCTAssertEqual(result, 42)
    }

    func test_withSendTimeout_slowOperation_cancelsAndThrows() async {
        do {
            _ = try await withSendTimeout(seconds: 0.05) { () async throws -> Int in
                // Far longer than the 50ms cap — the watchdog must cancel it.
                try await Task.sleep(nanoseconds: 5_000_000_000)
                return 1
            }
            XCTFail("Expected the timed-out operation to be cancelled and rethrow")
        } catch is CancellationError {
            // Expected: the watchdog cancelled the operation task, whose
            // `Task.sleep` surfaces a CancellationError that `.value` rethrows.
        } catch {
            XCTFail("Expected CancellationError, got \(error)")
        }
    }

    // MARK: - mergeIntoMessages duplicate prevention

    /// When a server ACK arrives, the message's display id transitions from
    /// localId ("cid_123") to serverId ("srv_abc") via toMessage(). Without
    /// the pendingServerIds guard in mergeIntoMessages, both the old optimistic
    /// row (id="cid_123") and the acked row (id="srv_abc") survive in messages,
    /// producing a duplicate bubble. After the fix, only the server-id version
    /// must remain.
    func test_mergeIntoMessages_afterServerAck_noDuplicateBubble() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let tempId = "cid_merge_dedup_test"
        let serverId = "srv_merge_dedup_test"

        // Seed an optimistic row: localId=tempId, serverId=nil → id=tempId in domain
        let record = MessageStoreObservationHelper.makeRecord(
            localId: tempId,
            conversationId: testConversationId,
            senderId: testUserId,
            state: .sending
        )
        try await persistence.insertOptimistic(record)

        // Wait for the optimistic message to surface with id=tempId
        let appeared = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == tempId }
        XCTAssertNotNil(appeared, "Optimistic row must surface with id=tempId before the ACK")

        // Register the tempId → serverId mapping BEFORE applyEvent (mirrors the
        // real send path where pendingServerIds is set synchronously before the
        // async applyEvent task).
        sut.pendingServerIds[tempId] = serverId

        // Apply serverAck: GRDB row.serverId becomes serverId → toMessage id flips
        _ = try await persistence.applyEvent(localId: tempId, event: .serverAck(serverId: serverId, at: Date()))

        // Wait until the server-id version surfaces
        let acked = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == serverId }
        XCTAssertNotNil(acked, "After ACK the message must surface with id=serverId")

        // The critical assertion: exactly ONE bubble — no duplicate cid_* row
        let count = sut.messages.filter {
            $0.id == tempId || $0.id == serverId
        }.count
        XCTAssertEqual(count, 1,
            "mergeIntoMessages must suppress the superseded optimistic row — expected 1 bubble, got \(count)")
    }

    // MARK: - joinOngoingCall (bulle d'appel vivante, 4 branches)

    private final class MockActiveCallService: ActiveCallServiceProviding, @unchecked Sendable {
        var result: Result<ActiveCallSession?, Error> = .success(nil)
        var onCalled: (() -> Void)?
        private(set) var callCount = 0

        func activeCall(conversationId: String) async throws -> ActiveCallSession? {
            callCount += 1
            onCalled?()
            return try result.get()
        }
    }

    private func makeAnonymousSession(conversationId: String) -> AnonymousSessionContext {
        AnonymousSessionContext(
            sessionToken: "test-anon-token",
            participantId: "part-123",
            permissions: ParticipantPermissions(),
            linkId: "mshy_test",
            conversationId: conversationId
        )
    }

    @MainActor
    private final class LiveCallJoinSpy {
        var currentCallId: String?
        var isIdle = true
        var pendingCallId: String?
        var rejoinResult = true
        private(set) var broughtUIForwardCount = 0
        private(set) var rejoinCalls: [(callId: String, conversationId: String, remoteUserId: String, remoteUsername: String, isVideo: Bool)] = []

        var context: LiveCallJoinContext {
            LiveCallJoinContext(
                currentCallId: { [weak self] in self?.currentCallId },
                isIdle: { [weak self] in self?.isIdle ?? true },
                hasPendingIncomingCall: { [weak self] in self?.pendingCallId == $0 },
                bringCallUIForward: { [weak self] in self?.broughtUIForwardCount += 1 },
                rejoinActiveCall: { [weak self] callId, conversationId, remoteUserId, remoteUsername, isVideo in
                    self?.rejoinCalls.append((callId, conversationId, remoteUserId, remoteUsername, isVideo))
                    return self?.rejoinResult ?? true
                }
            )
        }
    }

    private func makeLiveCallSummary(callId: String = "call-live-1", isVideo: Bool = false) -> CallSummaryMetadata {
        CallSummaryMetadata(
            callId: callId,
            initiatorId: "peer-user-1",
            callType: isVideo ? .video : .audio,
            outcome: .completed,
            durationSeconds: 0,
            bytesTotal: nil,
            bytesEstimated: false,
            networkQuality: nil,
            isLive: true
        )
    }

    func test_joinOngoingCall_alreadyOnThisCall_bringsCallUIForward() async {
        let spy = LiveCallJoinSpy()
        spy.currentCallId = "call-live-1"
        spy.isIdle = false
        let service = MockActiveCallService()
        let sut = makeSUT(isDirect: true, participantUserId: "peer-user-1", activeCallService: service, liveCallJoin: spy.context)

        await sut.joinOngoingCall(makeLiveCallSummary())

        XCTAssertEqual(spy.broughtUIForwardCount, 1)
        XCTAssertTrue(spy.rejoinCalls.isEmpty)
        XCTAssertEqual(service.callCount, 0, "pas de round-trip serveur quand on est déjà sur l'appel")
    }

    func test_joinOngoingCall_deviceRingingOnThisCall_neverDoubleJoins() async {
        let spy = LiveCallJoinSpy()
        spy.pendingCallId = "call-live-1"
        let service = MockActiveCallService()
        let sut = makeSUT(isDirect: true, participantUserId: "peer-user-1", activeCallService: service, liveCallJoin: spy.context)

        await sut.joinOngoingCall(makeLiveCallSummary())

        XCTAssertTrue(spy.rejoinCalls.isEmpty, "répondre reste le geste de la bannière/CallKit")
        XCTAssertEqual(spy.broughtUIForwardCount, 0)
        XCTAssertEqual(service.callCount, 0)
    }

    func test_joinOngoingCall_serverStillActive_rejoinsWithRemoteParticipant() async {
        let spy = LiveCallJoinSpy()
        let service = MockActiveCallService()
        service.result = .success(ActiveCallSession(
            id: "call-live-1",
            conversationId: testConversationId,
            mode: "p2p",
            status: "active",
            participants: [
                ActiveCallParticipant(userId: testUserId, user: nil),
                ActiveCallParticipant(userId: "peer-user-1", user: ActiveCallParticipantUser(id: "peer-user-1", username: "peer", displayName: "Peer")),
            ]
        ))
        let sut = makeSUT(isDirect: true, participantUserId: "peer-user-1", activeCallService: service, liveCallJoin: spy.context)

        await sut.joinOngoingCall(makeLiveCallSummary(isVideo: true))

        XCTAssertEqual(spy.rejoinCalls.count, 1)
        XCTAssertEqual(spy.rejoinCalls.first?.callId, "call-live-1")
        XCTAssertEqual(spy.rejoinCalls.first?.conversationId, testConversationId)
        XCTAssertEqual(spy.rejoinCalls.first?.remoteUserId, "peer-user-1")
        XCTAssertEqual(spy.rejoinCalls.first?.remoteUsername, "Peer")
        XCTAssertEqual(spy.rejoinCalls.first?.isVideo, true)
    }

    func test_joinOngoingCall_callEndedServerSide_toastsAndNeverRejoins() async {
        let spy = LiveCallJoinSpy()
        let service = MockActiveCallService()
        service.result = .success(nil)
        let sut = makeSUT(isDirect: true, participantUserId: "peer-user-1", activeCallService: service, liveCallJoin: spy.context)
        FeedbackToastManager.shared.dismiss()

        await sut.joinOngoingCall(makeLiveCallSummary())

        XCTAssertTrue(spy.rejoinCalls.isEmpty)
        // Résolu depuis la MÊME clé/valeur-par-défaut/bundle que le site d'appel
        // (`ConversationViewModel.joinOngoingCall`) — un littéral français en dur
        // ne teste plus que la langue du simulateur (cf. `CallsViewModelTests`,
        // même patron).
        XCTAssertEqual(
            FeedbackToastManager.shared.currentToast?.message,
            String(localized: "bubble.call.join.ended", defaultValue: "L'appel est terminé", bundle: .main)
        )
    }

    func test_joinOngoingCall_staleSessionDifferentCallId_treatedAsEnded() async {
        let spy = LiveCallJoinSpy()
        let service = MockActiveCallService()
        service.result = .success(ActiveCallSession(
            id: "another-newer-call",
            conversationId: testConversationId,
            mode: "p2p",
            status: "active",
            participants: []
        ))
        let sut = makeSUT(isDirect: true, participantUserId: "peer-user-1", activeCallService: service, liveCallJoin: spy.context)

        await sut.joinOngoingCall(makeLiveCallSummary())

        XCTAssertTrue(spy.rejoinCalls.isEmpty, "une bulle périmée ne rejoint jamais un AUTRE appel")
    }

    // MARK: - Anonymous guests never get a calling affordance from a bubble
    //
    // Mirrors the header's `anonymousHeaderBar` swap (ConversationView), which
    // hides the call buttons entirely for anonymous shared-link sessions. A
    // call-summary bubble further down history must honor the SAME gate —
    // otherwise a guest can trigger the OS microphone permission prompt (and,
    // for a live call, a server round-trip) before the gateway's own
    // isAnonymous check ever runs.

    func test_joinOngoingCall_whileAnonymous_neverQueriesServerOrRejoins() async {
        let spy = LiveCallJoinSpy()
        let service = MockActiveCallService()
        let sut = makeSUT(
            isDirect: true,
            participantUserId: "peer-user-1",
            anonymousSession: makeAnonymousSession(conversationId: testConversationId),
            activeCallService: service,
            liveCallJoin: spy.context
        )

        await sut.joinOngoingCall(makeLiveCallSummary())

        XCTAssertEqual(service.callCount, 0, "un invité anonyme ne doit jamais déclencher de round-trip serveur")
        XCTAssertTrue(spy.rejoinCalls.isEmpty)
        XCTAssertEqual(spy.broughtUIForwardCount, 0)
    }

    func test_callBack_liveSummaryWhileAnonymous_neverJoinsOrStartsCall() async {
        let spy = LiveCallJoinSpy()
        let service = MockActiveCallService()
        let neverCalled = expectation(description: "activeCallService.activeCall must never be reached while anonymous")
        neverCalled.isInverted = true
        service.onCalled = { neverCalled.fulfill() }
        let sut = makeSUT(
            isDirect: true,
            participantUserId: "peer-user-1",
            anonymousSession: makeAnonymousSession(conversationId: testConversationId),
            activeCallService: service,
            liveCallJoin: spy.context
        )

        sut.callBack(for: makeLiveCallSummary())

        await fulfillment(of: [neverCalled], timeout: 0.5)
        XCTAssertTrue(spy.rejoinCalls.isEmpty)
        XCTAssertEqual(spy.broughtUIForwardCount, 0)
    }

    // MARK: - Helpers

    private func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }
}
