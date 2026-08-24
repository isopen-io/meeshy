import XCTest
import Combine
import GRDB
@testable import MeeshySDK

final class ConversationSyncEngineTests: XCTestCase {

    private var mockAPI: MockAPIClient!
    private var mockConvService: MockConversationService!
    private var mockMsgService: MockMessageService!
    private var mockMessageSocket: MockMessageSocket!
    private var mockSocialSocket: MockSocialSocket!
    private var engine: ConversationSyncEngine!
    private var cancellables = Set<AnyCancellable>()

    override func setUp() {
        super.setUp()
        mockAPI = MockAPIClient()
        mockConvService = MockConversationService()
        mockMsgService = MockMessageService()
        mockMessageSocket = MockMessageSocket()
        mockSocialSocket = MockSocialSocket()

        engine = ConversationSyncEngine(
            cache: .shared,
            conversationService: mockConvService,
            messageService: mockMsgService,
            messageSocket: mockMessageSocket,
            socialSocket: mockSocialSocket,
            api: mockAPI
        )
    }

    override func tearDown() {
        cancellables.removeAll()
        mockAPI.reset()
        mockConvService.reset()
        mockMsgService.reset()
        super.tearDown()
    }

    // MARK: - T12: full-sync interior-gap recovery

    /// An interior page that fails the whole fan-out (all 3 retries) while a
    /// later page succeeds used to be swallowed: the partial list was cached and
    /// the sequential tail started at `merged.count`, beyond the hole. fullSync
    /// must re-fetch the dropped page so the cached list is provably complete.
    func test_fullSync_refetchesDroppedInteriorPage_fillsTheGap() async throws {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let testCache = CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)

        let gap = GapMockConversationService()
        gap.pagesByOffset = [
            0: (0..<100).map { TestFactories.makeAPIConversation(id: "p0-\($0)") },
            100: (0..<100).map { TestFactories.makeAPIConversation(id: "p1-\($0)") },
            200: (0..<50).map { TestFactories.makeAPIConversation(id: "p2-\($0)") }
        ]
        gap.advertisedTotal = 250
        // Page 1 (offset 100) fails all three fan-out attempts, then recovers on
        // the targeted re-fetch — exactly the transient-window scenario.
        gap.failTimesRemaining = [100: 3]

        let engine = ConversationSyncEngine(
            cache: testCache,
            conversationService: gap,
            messageService: MockMessageService(),
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            api: MockAPIClient()
        )

        let ok = await engine.fullSync()

        let cached = await testCache.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.count, 250,
                       "fullSync must re-fetch the dropped interior page so the cached list is complete")
        let ids = Set(cached.map(\.id))
        XCTAssertTrue(ids.contains("p1-0") && ids.contains("p1-99"),
                      "the dropped page's conversations must be present after recovery")
        XCTAssertTrue(ok, "fullSync should report success once the targeted re-fetch recovers the dropped page")
    }

    // MARK: - fullSync

    func test_fullSync_callsConversationServiceList() async {
        let apiConv = TestFactories.makeAPIConversation(id: "conv-1")
        let pagination = OffsetPagination(total: 1, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [apiConv], pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        await engine.fullSync()

        XCTAssertGreaterThanOrEqual(mockConvService.listCallCount, 1)
    }

    func test_fullSync_emitsConversationsDidChange() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        let expectation = expectation(description: "conversationsDidChange emitted")
        engine.conversationsDidChange
            .first()
            .sink { expectation.fulfill() }
            .store(in: &cancellables)

        await engine.fullSync()

        await fulfillment(of: [expectation], timeout: 2.0)
    }

    func test_fullSync_whenError_doesNotCrash() async {
        mockConvService.listResult = .failure(MeeshyError.network(.timeout))

        await engine.fullSync()

        // fetchPageWithRetry retries up to 3 times (attempt 0, 1, 2) on
        // transient errors, so the service is called 3 times before giving up.
        XCTAssertEqual(mockConvService.listCallCount, 3)
    }

    func test_fullSync_onSuccess_returnsTrue() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        let ok = await engine.fullSync()

        XCTAssertTrue(ok)
    }

    func test_fullSync_onError_returnsFalse() async {
        mockConvService.listResult = .failure(MeeshyError.network(.timeout))

        let ok = await engine.fullSync()

        XCTAssertFalse(ok, "Callers must be able to distinguish a failed cold sync so the UI can offer a retry")
    }

    // MARK: - syncSinceLastCheckpoint

    func test_syncSinceLastCheckpoint_callsAPIRequest() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockAPI.stub("/conversations", result: response)

        await engine.syncSinceLastCheckpoint()

        XCTAssertEqual(mockAPI.requestCount, 1)
        XCTAssertEqual(mockAPI.lastRequest?.endpoint, "/conversations")
    }

    func test_syncSinceLastCheckpoint_emitsConversationsDidChange() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockAPI.stub("/conversations", result: response)

        let expectation = expectation(description: "conversationsDidChange emitted")
        engine.conversationsDidChange
            .first()
            .sink { expectation.fulfill() }
            .store(in: &cancellables)

        await engine.syncSinceLastCheckpoint()

        await fulfillment(of: [expectation], timeout: 2.0)
    }

    // MARK: - Le delta sync ne ré-inflate pas un non-lu déjà lu localement

    /// « La pastille part puis revient » : l'utilisateur ouvre la conversation
    /// (compteur à 0 + frontière de lecture posée), puis un retour en
    /// avant-plan ou une reconnexion socket déclenche un delta sync. Le serveur,
    /// qui n'a pas encore traité l'accusé de lecture (outbox), renvoie encore
    /// `unreadCount: 4` — et l'écriture cache brute rallumait la pastille.
    func test_syncSinceLastCheckpoint_doesNotReviveUnread_afterLocalRead() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")

        let lastMessageAt = Date().addingTimeInterval(-60)
        var read = MeeshyConversation(
            id: "c-read", identifier: "test-c-read", type: .direct,
            lastMessageAt: lastMessageAt, unreadCount: 0
        )
        read.userState.lastReadAt = Date()  // frontière postérieure au dernier message
        try? await CacheCoordinator.shared.conversations.save([read], for: "list")

        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true,
            data: [TestFactories.makeAPIConversation(
                id: "c-read", lastMessageAt: lastMessageAt, unreadCount: 4
            )],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 500, offset: 0),
            error: nil
        ))

        await engine.syncSinceLastCheckpoint()

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first(where: { $0.id == "c-read" })?.userState.unreadCount, 0,
            "un instantané serveur en retard sur la lecture locale ne doit pas rallumer la pastille")
    }

    /// Le pendant : un message VRAIMENT plus récent que la frontière doit
    /// repasser la conversation en non-lu. La règle se répare toute seule et ne
    /// peut pas masquer durablement un vrai non-lu.
    func test_syncSinceLastCheckpoint_keepsUnread_whenMessageIsNewerThanLocalRead() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")

        let readAt = Date().addingTimeInterval(-120)
        var read = MeeshyConversation(
            id: "c-fresh", identifier: "test-c-fresh", type: .direct,
            lastMessageAt: readAt, unreadCount: 0
        )
        read.userState.lastReadAt = readAt
        try? await CacheCoordinator.shared.conversations.save([read], for: "list")

        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true,
            data: [TestFactories.makeAPIConversation(
                id: "c-fresh", lastMessageAt: Date(), unreadCount: 2
            )],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 500, offset: 0),
            error: nil
        ))

        await engine.syncSinceLastCheckpoint()

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first(where: { $0.id == "c-fresh" })?.userState.unreadCount, 2,
            "un message postérieur à la frontière de lecture doit rendre la conversation non lue")
    }

    /// La conversation OUVERTE était protégée des broadcasts socket
    /// (`handleUnreadUpdated`) mais pas des syncs REST.
    func test_syncSinceLastCheckpoint_forcesOpenConversationToZero() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")
        try? await CacheCoordinator.shared.conversations.save(
            [MeeshyConversation(id: "c-open", identifier: "test-c-open", type: .direct)], for: "list"
        )
        engine.setCurrentlyOpenConversation("c-open")

        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true,
            data: [TestFactories.makeAPIConversation(
                id: "c-open", lastMessageAt: Date(), unreadCount: 75
            )],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 500, offset: 0),
            error: nil
        ))

        await engine.syncSinceLastCheckpoint()

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first(where: { $0.id == "c-open" })?.userState.unreadCount, 0,
            "l'utilisateur regarde cette conversation — aucun sync ne doit y remettre un compteur")
        engine.setCurrentlyOpenConversation(nil)
    }

    /// `fullSync` persiste sa PREMIÈRE page avant d'avoir les suivantes : le
    /// cache est alors réduit à la page 1. Sans baseline figée avant la sync,
    /// la deuxième écriture confronterait les conversations des pages 2+ à ce
    /// cache tronqué, n'y trouverait aucun homologue local, et perdrait
    /// silencieusement leur frontière de lecture — la pastille revenait donc
    /// pour toute conversation lue au-delà de la première page.
    func test_fullSync_preservesReadFrontier_forConversationsBeyondFirstPage() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")

        let lastMessageAt = Date().addingTimeInterval(-300)
        // 3 conversations en cache, toutes lues localement.
        var cached: [MeeshyConversation] = (0..<3).map { i in
            MeeshyConversation(
                id: "c-page\(i)", identifier: "test-c-page\(i)", type: .direct,
                lastMessageAt: lastMessageAt, unreadCount: 0
            )
        }
        for i in cached.indices { cached[i].userState.lastReadAt = Date() }
        try? await CacheCoordinator.shared.conversations.save(cached, for: "list")

        // Le serveur les renvoie toutes non lues (accusés de lecture pas encore
        // traités), sur DEUX pages : `c-page0` seule en page 1, les deux autres
        // au fan-out. La première écriture réduit le cache à `c-page0` — sans
        // baseline figée, la seconde ne retrouvait plus la frontière de
        // `c-page1` / `c-page2` et laissait passer le compteur serveur.
        func page(_ ids: [Int], total: Int) -> Result<OffsetPaginatedAPIResponse<[APIConversation]>, Error> {
            .success(OffsetPaginatedAPIResponse(
                success: true,
                data: ids.map {
                    TestFactories.makeAPIConversation(
                        id: "c-page\($0)", lastMessageAt: lastMessageAt, unreadCount: 6
                    )
                },
                pagination: OffsetPagination(total: total, hasMore: false, limit: 100, offset: 0),
                error: nil
            ))
        }
        mockConvService.listResultsByOffset = [0: page([0], total: 3), 1: page([1, 2], total: 3)]
        mockConvService.listResult = page([], total: 3)

        await engine.fullSync()

        let result = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        for i in 0..<3 {
            XCTAssertEqual(result.first(where: { $0.id == "c-page\(i)" })?.userState.unreadCount, 0,
                "c-page\(i) était lue localement — aucune écriture de fullSync ne doit rallumer sa pastille")
        }
    }

    // MARK: - P7-10: réconciliation complète périodique (ghost pruning)

    /// Une conversation HARD-supprimée côté serveur n'est JAMAIS renvoyée par
    /// le delta `?updatedSince=` (contrairement aux `isActive:false` que
    /// `mergeDeltaConversations` retire déjà) → elle survit à vie dans le
    /// cache, inouvrable (fantôme observé E2E : « Test Conv » épinglée,
    /// absente du serveur sous tous les filtres, tuée uniquement par un
    /// pull-to-refresh manuel). Le delta doit chaîner une réconciliation
    /// COMPLÈTE (fullSync = replace de la liste) quand la dernière date de
    /// plus de `fullReconcileInterval`.
    func test_syncSinceLastCheckpoint_prunesServerHardDeletedConversation_whenFullReconcileDue() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.removeObject(forKey: "me.meeshy.lastFullReconcileAt")

        let kept = MeeshyConversation(id: "c-kept", identifier: "test-c-kept", type: .direct)
        let ghost = MeeshyConversation(id: "c-ghost", identifier: "test-c-ghost", type: .direct)
        try? await CacheCoordinator.shared.conversations.save([kept, ghost], for: "list")

        // Delta : rien de nouveau (le fantôme n'est jamais renvoyé).
        let emptyDelta = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [],
            pagination: OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0),
            error: nil
        )
        mockAPI.stub("/conversations", result: emptyDelta)

        // Vérité serveur complète : seule c-kept existe encore.
        mockConvService.listResult = .success(OffsetPaginatedAPIResponse(
            success: true,
            data: [TestFactories.makeAPIConversation(id: "c-kept")],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 100, offset: 0),
            error: nil
        ))

        await engine.syncSinceLastCheckpoint()

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let ids = Set(cached.map(\.id))
        XCTAssertFalse(ids.contains("c-ghost"),
            "a server-hard-deleted conversation must be pruned by the periodic full reconcile")
        XCTAssertTrue(ids.contains("c-kept"),
            "conversations still on the server must survive the reconcile")
    }

    /// Garde-fou « données jamais rapatriées inutilement » : la réconciliation
    /// complète est bornée — si elle a couru récemment, le delta ne re-fetch
    /// PAS la liste complète (aucun appel service.list) et le cache est
    /// laissé tel quel.
    func test_syncSinceLastCheckpoint_skipsFullReconcile_whenRecentlyReconciled() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")

        let ghost = MeeshyConversation(id: "c-ghost2", identifier: "test-c-ghost2", type: .direct)
        try? await CacheCoordinator.shared.conversations.save([ghost], for: "list")

        let emptyDelta = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [],
            pagination: OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0),
            error: nil
        )
        mockAPI.stub("/conversations", result: emptyDelta)

        await engine.syncSinceLastCheckpoint()

        XCTAssertEqual(mockConvService.listCallCount, 0,
            "no full-list refetch when the reconcile ran recently (delta stays cheap)")
        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertTrue(Set(cached.map(\.id)).contains("c-ghost2"),
            "without a due reconcile the delta must not touch rows it did not receive")
    }

    // MARK: - Cycle 114 : les SORTIES de vue annoncées par `meta.deletedConversationIds`

    /// Le delta est UPSERT-ONLY : une conversation quittée, fermée, bannie ou
    /// supprimée-pour-moi depuis un AUTRE appareil ne revient dans aucune page
    /// (la clause serveur l'exclut, et un leave n'écrit même pas
    /// `Conversation.updatedAt`). Le gateway l'annonce donc hors-page, et iOS
    /// jetait ce bloc au décodage : la ligne survivait dans la liste jusqu'à la
    /// réconciliation complète — 24 h.
    func test_syncSinceLastCheckpoint_appliesConversationTombstones_fromDeltaMeta() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")

        let kept = MeeshyConversation(id: "c-kept-ts", identifier: "test-c-kept-ts", type: .direct)
        let departed = MeeshyConversation(id: "c-left-ts", identifier: "test-c-left-ts", type: .direct)
        try? await CacheCoordinator.shared.conversations.save([kept, departed], for: "list")

        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [],
            pagination: OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0),
            error: nil,
            meta: APIResponseMeta(deletedConversationIds: ["c-left-ts"])
        ))

        await engine.syncSinceLastCheckpoint()

        let ids = Set((await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []).map(\.id))
        XCTAssertFalse(ids.contains("c-left-ts"),
            "a conversation the server says left the view must disappear on this device too")
        XCTAssertTrue(ids.contains("c-kept-ts"),
            "the tombstone stream must not touch conversations it did not name")
        XCTAssertEqual(mockConvService.listCallCount, 0,
            "a complete page with tombstones needs no escalation — the delta stays the cheap nominal path")
    }

    /// Les tombstones ont leur propre plafond serveur (500 par stream) et AUCUN
    /// curseur de reprise : il n'existe pas de « page suivante » de disparitions.
    /// Leur troncature est donc une preuve d'incomplétude comme une autre, et
    /// elle se règle par le même geste — l'escalade vers la vérité serveur.
    func test_syncSinceLastCheckpoint_truncatedTombstones_escalateToFullSync() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")

        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [],
            pagination: OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0),
            error: nil,
            meta: APIResponseMeta(deletedConversationIds: [], deletedConversationIdsTruncated: true)
        ))
        mockConvService.listResult = .success(OffsetPaginatedAPIResponse(
            success: true,
            data: [TestFactories.makeAPIConversation(id: "server-truth-ts")],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 100, offset: 0),
            error: nil
        ))

        await engine.syncSinceLastCheckpoint()

        XCTAssertGreaterThan(mockConvService.listCallCount, 0,
            "tombstones have no resume cursor — a truncated list is only recoverable by replacing the whole list")
    }

    /// Et le curseur ne bouge pas tant que ces disparitions n'ont pas été
    /// rattrapées : la borne serveur des tombstones est `> since`, exactement
    /// comme celle de la page. Un curseur avancé au-dessus d'une escalade
    /// échouée rendrait les sorties coupées irréclamables.
    func test_syncSinceLastCheckpoint_truncatedTombstones_leaveCursorInPlace_whenEscalationFails() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")
        let seededCursor = Date(timeIntervalSince1970: 1_700_000_000)
        UserDefaults.standard.set(seededCursor, forKey: "me.meeshy.lastSyncTimestamp")

        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true,
            data: [TestFactories.makeAPIConversation(
                id: "delta-ts", updatedAt: Date(timeIntervalSince1970: 1_800_000_000))],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 100, offset: 0),
            error: nil,
            meta: APIResponseMeta(deletedConversationIds: [], deletedConversationIdsTruncated: true)
        ))
        mockConvService.listResult = .failure(MeeshyError.network(.timeout))

        await engine.syncSinceLastCheckpoint()

        let cursor = UserDefaults.standard.object(forKey: "me.meeshy.lastSyncTimestamp") as? Date
        XCTAssertEqual(cursor?.timeIntervalSince1970 ?? 0, seededCursor.timeIntervalSince1970, accuracy: 1,
            "only a `since` that stays put will re-request the tombstones the server had to cut")
    }

    /// Rétro-compatibilité : un gateway antérieur au bloc `meta` n'en envoie
    /// aucun. L'absence doit se lire « pas de sortie, pas de troncature » — pas
    /// déclencher une réconciliation complète à chaque delta.
    func test_syncSinceLastCheckpoint_withoutDeltaMeta_doesNotEscalate() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")

        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [],
            pagination: OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0),
            error: nil
        ))

        await engine.syncSinceLastCheckpoint()

        XCTAssertEqual(mockConvService.listCallCount, 0,
            "a missing meta block is the OLD behaviour, not a reason to refetch the whole list every delta")
    }

    // MARK: - Cycle 79 : une page delta qui laisse du reste ne prouve pas sa complétude

    /// `deltaSyncCore` demandait `limit=500` à une route qui plafonne à 100 :
    /// le `limit` annoncé dans la réponse était un mensonge, et le repli
    /// heuristique `count >= limit` (quand la pagination manque) n'aurait jamais
    /// pu déclencher. Demander le plafond réel ne change pas le nombre de lignes
    /// rendues — il rend la coupure lisible.
    func test_syncSinceLastCheckpoint_asksForTheServerPageCap() async {
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")
        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [],
            pagination: OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0),
            error: nil
        ))

        await engine.syncSinceLastCheckpoint()

        let limit = mockAPI.lastRequest?.queryItems?.first(where: { $0.name == "limit" })?.value
        XCTAssertEqual(limit, "100",
            "asking for more than the server cap makes a truncated page indistinguishable from a complete one")
    }

    /// Le résidu que l'ordre `updatedAt` croissant ne rattrape pas : plus de 100
    /// conversations portant la MÊME milliseconde débordent d'une page que la
    /// borne stricte `gt` ne peut pas reprendre. Une page dont le serveur annonce
    /// du RESTE doit donc escalader vers la vérité serveur complète — même si la
    /// réconciliation périodique vient de courir (elle n'a rien à voir avec
    /// cette preuve-là).
    func test_syncSinceLastCheckpoint_truncatedDeltaPage_escalatesToFullSync_evenWhenReconcileIsRecent() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")

        let truncatedPage = (0..<ConversationSyncEngine.deltaPageLimit).map {
            TestFactories.makeAPIConversation(id: "delta-\($0)")
        }
        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: truncatedPage,
            pagination: OffsetPagination(total: truncatedPage.count + 40, hasMore: true, limit: 100, offset: 0),
            error: nil
        ))
        mockConvService.listResult = .success(OffsetPaginatedAPIResponse(
            success: true,
            data: [TestFactories.makeAPIConversation(id: "server-truth")],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 100, offset: 0),
            error: nil
        ))

        await engine.syncSinceLastCheckpoint()

        XCTAssertGreaterThan(mockConvService.listCallCount, 0,
            "a page the server says left rows behind proves nothing about coverage — it must escalate to the full truth")
    }

    /// L'ORDRE DES GESTES EST LE CORRECTIF : le curseur ne bouge pas AVANT
    /// l'escalade, sinon une escalade échouée (offline, panne gateway) laisse un
    /// watermark déjà passé par-dessus les lignes coupées — définitivement, le
    /// delta suivant repartant d'après elles.
    func test_syncSinceLastCheckpoint_truncatedDeltaPage_leavesCursorInPlace_whenEscalationFails() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")
        let seededCursor = Date(timeIntervalSince1970: 1_700_000_000)
        UserDefaults.standard.set(seededCursor, forKey: "me.meeshy.lastSyncTimestamp")

        let pageUpdatedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let truncatedPage = (0..<ConversationSyncEngine.deltaPageLimit).map {
            TestFactories.makeAPIConversation(id: "cut-\($0)", updatedAt: pageUpdatedAt)
        }
        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: truncatedPage,
            pagination: OffsetPagination(total: truncatedPage.count + 40, hasMore: true, limit: 100, offset: 0),
            error: nil
        ))
        // L'escalade échoue : c'est précisément le cas où un curseur déjà avancé
        // aurait rendu la perte irréversible.
        mockConvService.listResult = .failure(MeeshyError.network(.timeout))

        await engine.syncSinceLastCheckpoint()

        let cursor = UserDefaults.standard.object(forKey: "me.meeshy.lastSyncTimestamp") as? Date
        XCTAssertEqual(cursor?.timeIntervalSince1970 ?? 0, seededCursor.timeIntervalSince1970, accuracy: 1,
            "a truncated page must leave the window replayable — advancing the cursor here loses the cut rows for good")
    }

    /// Le pendant, pour que la garde ne devienne pas un « on ne converge
    /// jamais » : une page sans reste a rendu toute la fenêtre. Le curseur
    /// avance, et rien n'escalade.
    func test_syncSinceLastCheckpoint_completeDeltaPage_advancesCursor_andSkipsEscalation() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")
        let seededCursor = Date(timeIntervalSince1970: 1_700_000_000)
        UserDefaults.standard.set(seededCursor, forKey: "me.meeshy.lastSyncTimestamp")

        let serverMax = Date(timeIntervalSince1970: 1_800_000_000)
        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true,
            data: [TestFactories.makeAPIConversation(id: "delta-partial", updatedAt: serverMax)],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 100, offset: 0),
            error: nil
        ))

        await engine.syncSinceLastCheckpoint()

        let cursor = UserDefaults.standard.object(forKey: "me.meeshy.lastSyncTimestamp") as? Date
        XCTAssertEqual(cursor?.timeIntervalSince1970 ?? 0, serverMax.timeIntervalSince1970, accuracy: 1,
            "a page the server says is complete IS proof of coverage — the cursor must advance to the newest server updatedAt")
        XCTAssertEqual(mockConvService.listCallCount, 0,
            "a complete page needs no escalation — the delta stays the cheap nominal path")
    }

    /// `hasMore` est AUTORITAIRE sur une page delta (`offset=0` ⇒ le serveur
    /// compte la MÊME clause `updatedAt > since`), et c'est pour ça qu'on ne se
    /// contente pas de « la page est pleine » : une fenêtre de très exactement
    /// `deltaPageLimit` conversations est COMPLÈTE. L'heuristique du compte
    /// imposerait ici une relecture de toute la liste pour rien.
    func test_syncSinceLastCheckpoint_exactlyFullButCompletePage_doesNotEscalate() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")

        let exactPage = (0..<ConversationSyncEngine.deltaPageLimit).map {
            TestFactories.makeAPIConversation(id: "exact-\($0)")
        }
        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: exactPage,
            pagination: OffsetPagination(total: exactPage.count, hasMore: false, limit: 100, offset: 0),
            error: nil
        ))

        await engine.syncSinceLastCheckpoint()

        XCTAssertEqual(mockConvService.listCallCount, 0,
            "the server counted the same window and said it was complete — escalating would refetch everything for nothing")
    }

    // MARK: - ensureMessages

    func test_ensureMessages_callsMessageServiceList() async {
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-1")
        let response = MessagesAPIResponse(
            success: true, data: [apiMsg], pagination: nil,
            cursorPagination: nil, hasNewer: nil, meta: nil
        )
        mockMsgService.listResult = .success(response)

        // Invalidate cache first to force a fetch
        await CacheCoordinator.shared.messages.invalidate(for: "conv-1")

        await engine.ensureMessages(for: "conv-1")

        XCTAssertGreaterThanOrEqual(mockMsgService.listCallCount, 1)
    }

    func test_ensureMessages_emitsMessagesDidChange() async {
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-1")
        let response = MessagesAPIResponse(
            success: true, data: [apiMsg], pagination: nil,
            cursorPagination: nil, hasNewer: nil, meta: nil
        )
        mockMsgService.listResult = .success(response)

        await CacheCoordinator.shared.messages.invalidate(for: "conv-1")

        let expectation = expectation(description: "messagesDidChange emitted")
        engine.messagesDidChange
            .first()
            .sink { convId in
                XCTAssertEqual(convId, "conv-1")
                expectation.fulfill()
            }
            .store(in: &cancellables)

        await engine.ensureMessages(for: "conv-1")

        await fulfillment(of: [expectation], timeout: 2.0)
    }

    func test_ensureMessages_force_alwaysRefetchesAcrossConsecutiveCalls() async {
        // A non-forced ensure has a `.fresh` short-circuit: a second call on a
        // cache the first call just populated would normally NOT refetch. The
        // forced path (push-driven) must bypass that short-circuit, so two
        // consecutive `force: true` calls BOTH hit the network — proving the
        // bypass without coupling to mergeUpdate's exact freshness timing.
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-force")
        let response = MessagesAPIResponse(
            success: true, data: [apiMsg], pagination: nil,
            cursorPagination: nil, hasNewer: nil, meta: nil
        )
        mockMsgService.listResult = .success(response)
        await CacheCoordinator.shared.messages.invalidate(for: "conv-force")

        let before = mockMsgService.listCallCount
        await engine.ensureMessages(for: "conv-force", force: true)
        await engine.ensureMessages(for: "conv-force", force: true)

        XCTAssertEqual(
            mockMsgService.listCallCount, before + 2,
            "force:true must bypass the fresh-cache short-circuit and refetch every time"
        )
    }

    // MARK: - Socket relay

    func test_startSocketRelay_subscribesToMessageEvents() async {
        await engine.startSocketRelay()

        // Verify that sending a message event is handled (doesn't crash)
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-relay")
        mockMessageSocket.messageReceived.send(apiMsg)

        // Small delay for async processing
        try? await Task.sleep(nanoseconds: 100_000_000)

        // If we get here without crash, relay is working
    }

    func test_stopSocketRelay_clearsSubscriptions() async {
        await engine.startSocketRelay()
        await engine.stopSocketRelay()

        // After stopping, events should not be processed (no crash)
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-stopped")
        mockMessageSocket.messageReceived.send(apiMsg)

        try? await Task.sleep(nanoseconds: 100_000_000)
    }

    // MARK: - GRDB persistor hook (apiMessagePersistor)

    /// The engine only maintains CacheCoordinator (list previews); the
    /// conversation timeline reads the app's GRDB store. `ensureMessages`
    /// (the push-notification refresh path) must hand the fetched payload to
    /// the installed persistor or the message stays invisible inside the
    /// conversation even though the list preview shows it.
    func test_ensureMessages_invokesAPIMessagePersistor_withFetchedPayload() async {
        let apiMsg = TestFactories.makeAPIMessage(id: "msg-persist-1", conversationId: "conv-persist")
        let response = MessagesAPIResponse(
            success: true, data: [apiMsg], pagination: nil,
            cursorPagination: nil, hasNewer: nil, meta: nil
        )
        mockMsgService.listResult = .success(response)
        await CacheCoordinator.shared.messages.invalidate(for: "conv-persist")

        let collector = PersistedMessagesCollector()
        engine.apiMessagePersistor = { messages in
            await collector.append(messages)
        }

        await engine.ensureMessages(for: "conv-persist", force: true)

        let batches = await collector.batches
        XCTAssertEqual(batches.count, 1)
        XCTAssertEqual(batches.first?.map(\.id), ["msg-persist-1"])
    }

    /// Same contract on the global `message:new` relay — the ONLY sink that
    /// sees broadcasts for CLOSED conversations.
    func test_messageNewRelay_invokesAPIMessagePersistor() async {
        await engine.startSocketRelay()

        let persisted = expectation(description: "persistor invoked from message:new relay")
        persisted.assertForOverFulfill = false
        engine.apiMessagePersistor = { messages in
            if messages.contains(where: { $0.id == "msg-relay-persist" }) {
                persisted.fulfill()
            }
        }

        let apiMsg = TestFactories.makeAPIMessage(
            id: "msg-relay-persist", conversationId: "conv-relay-persist"
        )
        mockMessageSocket.messageReceived.send(apiMsg)

        await fulfillment(of: [persisted], timeout: 2.0)
    }

    // MARK: - Total Unread Aggregator (cross-conversation)

    /// The sync engine must expose a CurrentValueSubject that aggregates the
    /// total `unreadCount` across all cached conversations. UI surfaces such
    /// as the back-button cross-conversation pill subscribe to it without
    /// re-implementing the reduce themselves.
    func test_totalConversationsUnreadValue_isZero_whenCacheEmpty() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")

        XCTAssertEqual(engine.totalConversationsUnreadValue, 0)
    }

    /// When the socket signals a single-conversation unread change, the
    /// aggregator MUST re-sum every cached conversation (not just delta the
    /// previous total). This guarantees correctness when the cache mutates
    /// from other code paths (delta sync, optimistic writes) between events.
    func test_totalConversationsUnread_publishesSumOfAllConversations_afterUnreadUpdatedEvent() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([
            ("unread-agg-c1", 2),
            ("unread-agg-c2", 5),
            ("unread-agg-c3", 0)
        ])

        await engine.startSocketRelay()

        let exp = expectation(description: "total unread published after event")
        var observed = [Int]()
        engine.totalConversationsUnread
            .sink { value in
                observed.append(value)
                if observed.count >= 2 { exp.fulfill() }
            }
            .store(in: &cancellables)

        // Update c1 from 2 → 4 ⇒ expected total = 4 + 5 + 0 = 9
        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "unread-agg-c1", unreadCount: 4))

        await fulfillment(of: [exp], timeout: 2.0)
        XCTAssertEqual(observed.last, 9)
    }

    /// Negative values are nonsense from the backend but the aggregator must
    /// not blow up: clamp each conversation contribution to ≥ 0.
    func test_totalConversationsUnread_clampsNegativeContributions_atZero() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([
            ("unread-agg-clamp-1", 4),
            ("unread-agg-clamp-2", -10)
        ])

        await engine.startSocketRelay()

        let exp = expectation(description: "clamped total")
        var observed = [Int]()
        engine.totalConversationsUnread
            .sink { value in
                observed.append(value)
                if observed.count >= 2 { exp.fulfill() }
            }
            .store(in: &cancellables)

        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "unread-agg-clamp-1", unreadCount: 4))

        await fulfillment(of: [exp], timeout: 2.0)
        XCTAssertEqual(observed.last, 4, "negative contribution must clamp to 0")
    }

    // MARK: - Currently-open conversation gating
    //
    // When the user has a conversation OPEN, the gateway still broadcasts
    // `conversation:unread-updated` for it (the server has no notion of
    // "currently visible"). The client must:
    //   1. Force the open conversation's unreadCount to 0 (the user IS
    //      reading the messages, so anything else is a visual lie).
    //   2. Exclude the open conversation from the cross-conversation
    //      aggregator (so the back-button pill counts OTHER conversations
    //      only).
    //
    // Setting the current id to `nil` (e.g. on view disappear) restores
    // normal pass-through behaviour.

    func test_setCurrentlyOpenConversation_forcesOpenConvUnreadToZero_onUnreadUpdate() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([
            ("open-conv", 0),
            ("other-conv", 3)
        ])
        await engine.startSocketRelay()
        engine.setCurrentlyOpenConversation("open-conv")

        // Server broadcasts a non-zero unread for the open conv — the engine
        // must ignore the new value and keep it at 0.
        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "open-conv", unreadCount: 75))

        // Wait for the event to be processed
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let openConv = cached.first { $0.id == "open-conv" }
        XCTAssertEqual(openConv?.userState.unreadCount, 0, "open conversation's unread must stay at 0")
    }

    func test_setCurrentlyOpenConversation_excludesOpenConvFromAggregator() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([
            ("open-conv", 10),
            ("other-conv-1", 4),
            ("other-conv-2", 2)
        ])
        await engine.startSocketRelay()
        engine.setCurrentlyOpenConversation("open-conv")

        // Trigger a recompute (any event that fires recomputeTotalUnread is fine)
        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "other-conv-1", unreadCount: 4))

        try? await Task.sleep(nanoseconds: 200_000_000)

        // Aggregator must skip "open-conv" — only 4 + 2 = 6
        XCTAssertEqual(engine.totalConversationsUnreadValue, 6,
                       "open conversation must be excluded from totalConversationsUnread")
    }

    func test_setCurrentlyOpenConversation_immediatelyZeroesOpenConvUnread() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([
            ("conv-with-11-unread", 11),
            ("other-conv", 3)
        ])

        engine.setCurrentlyOpenConversation("conv-with-11-unread")
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let openConv = cached.first { $0.id == "conv-with-11-unread" }
        XCTAssertEqual(openConv?.userState.unreadCount, 0,
                       "opening a conversation must reset its unread count locally")
    }

    // MARK: - L'agrégat exclut la conversation ouverte DÈS le tour de boucle
    //
    // `totalConversationsUnread` est un `CurrentValueSubject` : il rejoue sa
    // dernière valeur à l'abonnement. Publier l'exclusion depuis le `Task` qui
    // écrit le cache laissait donc `ConversationViewModel.start()` — qui
    // s'abonne juste après avoir déclaré la conversation ouverte — recevoir le
    // total d'AVANT l'ouverture, celui qui INCLUT la conversation qu'on vient
    // d'ouvrir. La pastille du bouton retour affichait ce total puis retombait :
    // le scintillement rapporté par l'utilisateur.

    func test_setCurrentlyOpenConversation_excludesOpenConv_withoutAwaitingTheCacheWrite() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([("sync-open-conv", 99), ("sync-other-conv", 3)])
        await engine.startSocketRelay()
        XCTAssertEqual(engine.totalConversationsUnreadValue, 102, "préalable : les deux comptent")

        engine.setCurrentlyOpenConversation("sync-open-conv")

        // AUCUNE attente : la valeur doit être juste immédiatement.
        XCTAssertEqual(engine.totalConversationsUnreadValue, 3,
                       "l'exclusion doit être publiée dans le tour de boucle de l'ouverture, pas après un aller-retour cache")
    }

    func test_setCurrentlyOpenConversation_aSubscriberAttachedAfterwards_neverSeesThePreOpenTotal() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([("late-open-conv", 99), ("late-other-conv", 3)])
        await engine.startSocketRelay()

        engine.setCurrentlyOpenConversation("late-open-conv")

        var firstReplayed: Int?
        engine.totalConversationsUnread
            .sink { if firstReplayed == nil { firstReplayed = $0 } }
            .store(in: &cancellables)

        XCTAssertEqual(firstReplayed, 3,
                       "c'est CETTE valeur que le premier rendu de l'écran affiche — 102 y serait le « 99 » du glitch")
    }

    func test_setCurrentlyOpenConversation_nil_restoresNormalPassThrough() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([("conv-1", 0)])
        await engine.startSocketRelay()

        engine.setCurrentlyOpenConversation("conv-1")
        engine.setCurrentlyOpenConversation(nil)

        // Now a server unread update for conv-1 must be applied normally
        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "conv-1", unreadCount: 4))
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first?.userState.unreadCount, 4)
    }

    // MARK: - Bridge ✦ persistence sur l'événement socket (G-124)
    //
    // `conversation:unread-updated` porte désormais un `bridge?` optionnel
    // (G-123, `ConversationUnreadUpdatedEventData.bridge`). Avant ce lot,
    // `handleUnreadUpdated` n'appliquait QUE `unreadCount` — un pont reçu par
    // socket était silencieusement perdu jusqu'au prochain rechargement REST
    // complet. C'est le trou exact que R-c dénonçait (« pont invisible,
    // drapeau ON ») : le champ existait sur le fil mais rien en aval ne le
    // recopiait sur la conversation mise en cache.

    func test_handleUnreadUpdated_persistsBridgeFromEvent() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([("bridge-c1", 0)])
        await engine.startSocketRelay()

        let bridge = ConversationBridge(
            kind: .fallback,
            unreadCount: 3,
            suggestedMode: .focal,
            data: ConversationBridgeData(authors: ["Ali"], extraAuthorCount: 0, messageCount: 3)
        )
        mockMessageSocket.unreadUpdated.send(
            UnreadUpdateEvent(conversationId: "bridge-c1", unreadCount: 3, bridge: bridge)
        )
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(
            cached.first(where: { $0.id == "bridge-c1" })?.bridge, bridge,
            "le pont de l'événement socket doit être persisté sur la conversation en cache — sans transformation"
        )
    }

    /// Le serveur AFFIRME l'absence de pont quand `unreadCount == 0` (contrat
    /// gelé §3.2) — le client doit alors EFFACER un pont déjà connu, jamais le
    /// laisser périmé derrière un compteur retombé à zéro (« zéro donnée
    /// fabriquée »).
    ///
    /// Cycle 63 : cette affirmation voyage désormais comme un `bridge: null`
    /// EXPLICITE (`.cleared`), et non plus comme l'omission du champ. Le nom de
    /// ce témoin disait « absentBridge » et gelait donc la règle fausse : c'est
    /// l'omission qui a fini par effacer les ponts de tous les lecteurs, à
    /// chaque reconnexion.
    func test_handleUnreadUpdated_explicitlyClearedBridge_clearsPreviouslyKnownBridge() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([("bridge-c2", 5)])
        await CacheCoordinator.shared.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == "bridge-c2" }) {
                updated[idx].bridge = ConversationBridge(kind: .fallback, unreadCount: 5, suggestedMode: .focal)
            }
            return updated
        }
        await engine.startSocketRelay()

        mockMessageSocket.unreadUpdated.send(
            UnreadUpdateEvent(conversationId: "bridge-c2", unreadCount: 0, announcement: .cleared)
        )
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertNil(
            cached.first(where: { $0.id == "bridge-c2" })?.bridge,
            "unreadCount==0 ⇒ le serveur AFFIRME l'absence de pont ⇒ le pont périmé doit être effacé"
        )
    }

    /// LE témoin du cycle 63, côté iOS — celui qui aurait rougi au cycle 62.
    ///
    /// Le serveur n'a PAS calculé le pont : instantané de reconnexion au-delà
    /// de sa borne, passe de ponts tombée, ou accusé de lecture qui ne recalcule
    /// rien. Il se tait, et son silence ne doit RIEN détruire.
    ///
    /// Avant ce lot, `handleUnreadUpdated` recopiait `event.bridge` — un
    /// optionnel qui valait `nil` dans ce cas comme dans celui de l'absence
    /// réelle de pont — et le pont disparaissait de toutes les lignes du
    /// lecteur à chaque retour du réseau, sans qu'aucun témoin ne change de
    /// couleur.
    func test_handleUnreadUpdated_notComputed_keepsTheCachedBridge() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([("bridge-c3", 5)])
        let known = ConversationBridge(kind: .fallback, unreadCount: 5, suggestedMode: .focal)
        await CacheCoordinator.shared.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == "bridge-c3" }) {
                updated[idx].bridge = known
            }
            return updated
        }
        await engine.startSocketRelay()

        mockMessageSocket.unreadUpdated.send(
            UnreadUpdateEvent(conversationId: "bridge-c3", unreadCount: 5, announcement: .notComputed)
        )
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let row = cached.first(where: { $0.id == "bridge-c3" })
        XCTAssertEqual(
            row?.bridge, known,
            "le serveur n'a rien annoncé : son silence ne doit pas effacer le pont en cache"
        )
        XCTAssertEqual(row?.userState.unreadCount, 5, "le compteur, lui, s'applique toujours")
    }

    // MARK: - handleReadStatusUpdated (multi-device read sync)

    /// When the gateway broadcasts a "read" event for the current user (e.g. from
    /// another device), the engine MUST apply the server-authoritative unreadCount
    /// rather than hard-coding zero — the user may have only partially read.
    func test_readStatusUpdated_ownRead_withAuthoritativeCount_setsExactCount() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([("conv-read-1", 5)])
        await engine.startSocketRelay()

        let exp = expectation(description: "conversationsDidChange after own read")
        engine.conversationsDidChange
            .first()
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)

        // In tests, currentUserId() returns "" (AuthManager has no current user).
        let event = ReadStatusUpdateEvent(
            conversationId: "conv-read-1",
            participantId: "participant-1",
            userId: "",
            type: "read",
            updatedAt: Date(),
            summary: ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1),
            lastReadAt: nil,
            unreadCount: 3
        )
        mockMessageSocket.readStatusUpdated.send(event)

        await fulfillment(of: [exp], timeout: 2.0)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first?.userState.unreadCount, 3,
                       "own read event must apply server-authoritative unreadCount, not hard-code 0")
    }

    /// When the gateway omits unreadCount (pre-rollout gateway), the engine must
    /// fall back to 0 rather than leaving stale data.
    func test_readStatusUpdated_ownRead_nilCount_fallsBackToZero() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([("conv-read-nil", 7)])
        await engine.startSocketRelay()

        let exp = expectation(description: "conversationsDidChange after nil-count read")
        engine.conversationsDidChange
            .first()
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)

        let event = ReadStatusUpdateEvent(
            conversationId: "conv-read-nil",
            participantId: "participant-1",
            userId: "",
            type: "read",
            updatedAt: Date(),
            summary: ReadStatusSummary(totalMembers: 1, deliveredCount: 1, readCount: 1),
            lastReadAt: nil,
            unreadCount: nil
        )
        mockMessageSocket.readStatusUpdated.send(event)

        await fulfillment(of: [exp], timeout: 2.0)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first?.userState.unreadCount, 0,
                       "nil unreadCount must fall back to 0")
    }

    /// A "read" event for a DIFFERENT user must NOT mutate the current user's
    /// unreadCount — it only advances the delivery status on their own messages.
    func test_readStatusUpdated_otherUserRead_doesNotChangeUnreadCount() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([("conv-read-other", 4)])
        await engine.startSocketRelay()

        let exp = expectation(description: "messagesDidChange emitted")
        engine.messagesDidChange
            .first(where: { $0 == "conv-read-other" })
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)

        let event = ReadStatusUpdateEvent(
            conversationId: "conv-read-other",
            participantId: "participant-other",
            userId: "some-other-user-id",
            type: "read",
            updatedAt: Date(),
            summary: ReadStatusSummary(totalMembers: 2, deliveredCount: 2, readCount: 1),
            lastReadAt: nil,
            unreadCount: 0
        )
        mockMessageSocket.readStatusUpdated.send(event)

        await fulfillment(of: [exp], timeout: 2.0)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first?.userState.unreadCount, 4,
                       "another user's read event must not modify the current user's unreadCount")
    }

    // MARK: - Realtime last-message preview (edit / delete)

    /// Editing the conversation's LAST message must refresh the list-row preview
    /// in real time — otherwise the row keeps showing the pre-edit text.
    func test_messageEdited_refreshesListPreview_whenEditedIsLastMessage() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let conv = MeeshyConversation(
            id: "c-edit", identifier: "test-c-edit", type: .direct,
            lastMessagePreview: "before edit", lastMessageId: "m-last")
        try? await CacheCoordinator.shared.conversations.save([conv], for: "list")
        await engine.startSocketRelay()

        mockMessageSocket.messageEdited.send(
            TestFactories.makeAPIMessage(id: "m-last", conversationId: "c-edit", content: "after edit"))
        try? await Task.sleep(nanoseconds: 250_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first(where: { $0.id == "c-edit" })?.lastMessagePreview, "after edit",
                       "editing the last message must update the list preview")
    }

    /// Editing an OLDER (non-last) message must NOT touch the list-row preview.
    func test_messageEdited_leavesListPreview_whenEditedIsNotLastMessage() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let conv = MeeshyConversation(
            id: "c-edit2", identifier: "test-c-edit2", type: .direct,
            lastMessagePreview: "the last message", lastMessageId: "m-last")
        try? await CacheCoordinator.shared.conversations.save([conv], for: "list")
        await engine.startSocketRelay()

        mockMessageSocket.messageEdited.send(
            TestFactories.makeAPIMessage(id: "m-older", conversationId: "c-edit2", content: "edited an older one"))
        try? await Task.sleep(nanoseconds: 250_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first(where: { $0.id == "c-edit2" })?.lastMessagePreview, "the last message",
                       "editing a non-last message must leave the preview unchanged")
    }

    /// Deleting the conversation's LAST message must recompute the list-row preview
    /// from the most recent surviving message (mirrors the gateway's `deletedAt: null`
    /// REST list) instead of leaving the deleted text on the row.
    func test_messageDeleted_recomputesListPreview_fromSurvivingMessage_whenDeletedWasLast() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let m1 = TestFactories.makeMessage(id: "m1", conversationId: "c-del", content: "Keep me")
        let m2 = TestFactories.makeMessage(id: "m2", conversationId: "c-del", content: "Delete me")
        try? await CacheCoordinator.shared.messages.save([m1, m2], for: "c-del")
        let conv = MeeshyConversation(
            id: "c-del", identifier: "test-c-del", type: .direct,
            lastMessagePreview: "Delete me", lastMessageId: "m2")
        try? await CacheCoordinator.shared.conversations.save([conv], for: "list")
        await engine.startSocketRelay()

        mockMessageSocket.messageDeleted.send(MessageDeletedEvent(messageId: "m2", conversationId: "c-del"))
        try? await Task.sleep(nanoseconds: 300_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let row = cached.first(where: { $0.id == "c-del" })
        XCTAssertEqual(row?.lastMessagePreview, "Keep me",
                       "deleting the last message must surface the surviving message as the preview")
        XCTAssertEqual(row?.lastMessageId, "m1")
    }

    /// Deleting the conversation's ONLY message leaves no survivor — the stale
    /// deleted text must be cleared from the row, not left showing the content
    /// the user just deleted.
    func test_messageDeleted_onlyMessage_clearsStaleDeletedPreview() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let m1 = TestFactories.makeMessage(id: "m1", conversationId: "c-del-solo", content: "Only message")
        try? await CacheCoordinator.shared.messages.save([m1], for: "c-del-solo")
        let conv = MeeshyConversation(
            id: "c-del-solo", identifier: "test-c-del-solo", type: .direct,
            lastMessagePreview: "Only message", lastMessageId: "m1")
        try? await CacheCoordinator.shared.conversations.save([conv], for: "list")
        await engine.startSocketRelay()

        mockMessageSocket.messageDeleted.send(MessageDeletedEvent(messageId: "m1", conversationId: "c-del-solo"))
        try? await Task.sleep(nanoseconds: 300_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let row = cached.first(where: { $0.id == "c-del-solo" })
        // `nil` et non `""` : le vidage passe par le geste CENTRAL du modèle
        // (`clearLastMessage`), le même qu'applique la fusion socket quand le
        // SERVEUR annonce « plus aucun message visible ». Les deux rendent
        // identiquement côté ligne (`resolvedLastMessagePreview` → `nil`, et la
        // vue teste déjà `!isEmpty`), mais le geste unique emporte AUSSI la
        // pastille de pièce jointe, l'épingle de position et les drapeaux
        // éphémères — que le vidage à la main laissait décrire le message
        // supprimé.
        XCTAssertNil(row?.lastMessagePreview,
                     "deleting the only message must clear the stale deleted text from the row")
        XCTAssertNil(row?.lastMessageId)
        XCTAssertNil(row?.lastMessageLocation)
        XCTAssertTrue(row?.lastMessageAttachments.isEmpty ?? false)
    }

    /// Deleting a call-summary message (the socket-confirmed, authoritative
    /// deletion path) must also sweep the locally persisted call transcript
    /// — otherwise a transcript for a call the user just deleted the summary
    /// of stays reachable forever, orphaned from any UI entry point.
    func test_messageDeleted_withCallSummary_sweepsLocalCallTranscript() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        var callMessage = TestFactories.makeMessage(id: "m-call", conversationId: "c-call-del", content: "")
        callMessage.callSummary = CallSummaryMetadata(
            callId: "call-xyz", initiatorId: "sender-1", callType: .audio, outcome: .completed,
            durationSeconds: 30, bytesTotal: nil, bytesEstimated: false, networkQuality: nil
        )
        try? await CacheCoordinator.shared.messages.save([callMessage], for: "c-call-del")
        let transcript = CallTranscript(
            callId: "call-xyz", conversationId: "c-call-del",
            callStartedAt: Date(timeIntervalSince1970: 0), segments: []
        )
        await CallTranscriptStore.shared.saveMerging(transcript)
        await engine.startSocketRelay()

        mockMessageSocket.messageDeleted.send(MessageDeletedEvent(messageId: "m-call", conversationId: "c-call-del"))
        try? await Task.sleep(nanoseconds: 300_000_000)

        let loaded = await CallTranscriptStore.shared.transcript(for: "call-xyz")
        XCTAssertNil(loaded, "deleting the call-summary message must sweep its local transcript")
    }

    /// A deleted message with no `callSummary` (the overwhelmingly common
    /// case — a regular text message) must not crash or otherwise misbehave
    /// when the sweep runs its `callId` resolution.
    func test_messageDeleted_withoutCallSummary_doesNotCrash() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let plainMessage = TestFactories.makeMessage(id: "m-plain", conversationId: "c-plain-del", content: "hi")
        try? await CacheCoordinator.shared.messages.save([plainMessage], for: "c-plain-del")
        await engine.startSocketRelay()

        mockMessageSocket.messageDeleted.send(MessageDeletedEvent(messageId: "m-plain", conversationId: "c-plain-del"))
        try? await Task.sleep(nanoseconds: 300_000_000)

        let cached = await CacheCoordinator.shared.messages.load(for: "c-plain-del").snapshot() ?? []
        XCTAssertNotNil(cached.first(where: { $0.id == "m-plain" })?.deletedAt)
    }

    /// An own-echo REST send racing the socket broadcast (or any other
    /// out-of-order `message:new`) must not regress the list row to older
    /// content once a newer message has already been applied — mirrors the
    /// monotone guard in `ConversationStore.applyConversationUpdated`.
    func test_messageNew_staleMessage_doesNotRegressListRow() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let newer = Date(timeIntervalSince1970: 1_700_000_000)
        let older = Date(timeIntervalSince1970: 1_699_000_000)
        let conv = MeeshyConversation(
            id: "c-order", identifier: "test-c-order", type: .direct,
            lastMessageAt: newer,
            lastMessagePreview: "current preview", lastMessageId: "m-current")
        try? await CacheCoordinator.shared.conversations.save([conv], for: "list")
        await engine.startSocketRelay()

        let exp = expectation(description: "conversationsDidChange after stale message:new")
        engine.conversationsDidChange.first().sink { exp.fulfill() }.store(in: &cancellables)

        mockMessageSocket.messageReceived.send(
            TestFactories.makeAPIMessage(id: "m-stale", conversationId: "c-order",
                                          content: "stale content", createdAt: older))
        await fulfillment(of: [exp], timeout: 2.0)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let row = cached.first(where: { $0.id == "c-order" })
        XCTAssertEqual(row?.lastMessagePreview, "current preview",
                       "a stale message:new must not overwrite the newer preview")
        XCTAssertEqual(row?.lastMessageId, "m-current")
        XCTAssertEqual(row?.lastMessageAt, newer)
    }

    /// The normal, in-order case: a genuinely newer message still updates
    /// the row and bumps it to the top.
    func test_messageNew_newerMessage_updatesListRow() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let older = Date(timeIntervalSince1970: 1_699_000_000)
        let newer = Date(timeIntervalSince1970: 1_700_000_000)
        let conv = MeeshyConversation(
            id: "c-order2", identifier: "test-c-order2", type: .direct,
            lastMessageAt: older,
            lastMessagePreview: "old preview", lastMessageId: "m-old")
        try? await CacheCoordinator.shared.conversations.save([conv], for: "list")
        await engine.startSocketRelay()

        let exp = expectation(description: "conversationsDidChange after newer message:new")
        engine.conversationsDidChange.first().sink { exp.fulfill() }.store(in: &cancellables)

        mockMessageSocket.messageReceived.send(
            TestFactories.makeAPIMessage(id: "m-new", conversationId: "c-order2",
                                          content: "fresh content", createdAt: newer))
        await fulfillment(of: [exp], timeout: 2.0)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let row = cached.first(where: { $0.id == "c-order2" })
        XCTAssertEqual(row?.lastMessagePreview, "fresh content")
        XCTAssertEqual(row?.lastMessageId, "m-new")
        XCTAssertEqual(row?.lastMessageAt, newer)
    }

    // Helper: seed the conversations cache with [id, unreadCount] tuples.
    // Uses `save()` (not `update()`): `update()` early-returns when the key
    // is absent from L1, which is exactly the state right after `invalidate`.
    private func seedConversations(_ entries: [(String, Int)]) async {
        let conversations: [MeeshyConversation] = entries.map { id, unread in
            MeeshyConversation(
                id: id,
                identifier: "test-\(id)",
                type: .direct,
                unreadCount: unread
            )
        }
        try? await CacheCoordinator.shared.conversations.save(conversations, for: "list")
    }

    // MARK: - Sort persistence

    /// The sync engine MUST persist the cached list sorted by `lastMessageAt`
    // MARK: - attachmentUpdated relay (Whisper/TTS enrichment)

    /// When `message:attachment-updated` arrives for a closed conversation,
    /// the sync engine must patch the cached message's attachment with the
    /// new transcription so opening the chat later shows enriched data.
    func test_attachmentUpdated_patchesTranscriptionInMessageCache() async {
        let convId = "conv-att-upd-1"
        let msgId = "msg-att-upd-1"
        let attachmentId = "att-1"

        let attachment = MeeshyMessageAttachment(id: attachmentId, mimeType: "audio/mp4")
        var msg = TestFactories.makeMessage(id: msgId, conversationId: convId)
        msg.attachments = [attachment]
        try? await CacheCoordinator.shared.messages.save([msg], for: convId)

        await engine.startSocketRelay()

        let attJson: [String: Any] = [
            "id": attachmentId,
            "transcription": [
                "text": "Hello world",
                "language": "en",
                "confidence": 0.98
            ]
        ]
        let event = makeAttachmentUpdatedEvent(
            conversationId: convId, messageId: msgId, attachmentJson: attJson
        )

        let exp = expectation(description: "messagesDidChange emitted")
        engine.messagesDidChange
            .first(where: { $0 == convId })
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)

        mockMessageSocket.attachmentUpdated.send(event)

        await fulfillment(of: [exp], timeout: 2.0)

        let cached = await CacheCoordinator.shared.messages.load(for: convId).snapshot() ?? []
        let cachedMsg = cached.first { $0.id == msgId }
        XCTAssertEqual(cachedMsg?.attachments.first?.transcription?.text, "Hello world")
        XCTAssertEqual(cachedMsg?.attachments.first?.transcription?.language, "en")
        XCTAssertEqual(cachedMsg?.attachments.first?.transcription?.confidence, 0.98)
    }

    /// When the event carries new audio translations, they must be merged into
    /// the cached attachment's `audioTranslations` dictionary.
    func test_attachmentUpdated_patchesAudioTranslationsInMessageCache() async {
        let convId = "conv-att-upd-2"
        let msgId = "msg-att-upd-2"
        let attachmentId = "att-2"

        let attachment = MeeshyMessageAttachment(id: attachmentId, mimeType: "audio/mp4")
        var msg = TestFactories.makeMessage(id: msgId, conversationId: convId)
        msg.attachments = [attachment]
        try? await CacheCoordinator.shared.messages.save([msg], for: convId)

        await engine.startSocketRelay()

        let attJson: [String: Any] = [
            "id": attachmentId,
            "translations": [
                "fr": ["url": "https://cdn.meeshy.me/audio/fr.mp4", "durationMs": 3200, "format": "mp4", "cloned": true]
            ]
        ]
        let event = makeAttachmentUpdatedEvent(
            conversationId: convId, messageId: msgId, attachmentJson: attJson
        )

        let exp = expectation(description: "messagesDidChange emitted for translations")
        engine.messagesDidChange
            .first(where: { $0 == convId })
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)

        mockMessageSocket.attachmentUpdated.send(event)

        await fulfillment(of: [exp], timeout: 2.0)

        let cached = await CacheCoordinator.shared.messages.load(for: convId).snapshot() ?? []
        let cachedAtt = cached.first(where: { $0.id == msgId })?.attachments.first
        XCTAssertEqual(cachedAtt?.audioTranslations?["fr"]?.url, "https://cdn.meeshy.me/audio/fr.mp4")
        XCTAssertEqual(cachedAtt?.audioTranslations?["fr"]?.cloned, true)
    }

    /// An event for an unknown message ID must not crash and must not emit
    /// messagesDidChange for a non-existent patch (the upsertPatch is a no-op
    /// when the item is absent — but we do still emit messagesDidChange to
    /// signal the UI to re-check; verify only no crash here).
    func test_attachmentUpdated_unknownMessageId_doesNotCrash() async {
        await engine.startSocketRelay()

        let attJson: [String: Any] = ["id": "att-unknown"]
        let event = makeAttachmentUpdatedEvent(
            conversationId: "conv-unknown", messageId: "msg-unknown", attachmentJson: attJson
        )

        mockMessageSocket.attachmentUpdated.send(event)
        try? await Task.sleep(nanoseconds: 200_000_000)
    }

    /// DESC so cold-start cache reads land on the correct order without
    /// requiring the ViewModel to re-sort. Backend pagination order is not
    /// guaranteed to be timestamp-sorted (e.g. when delta sync interleaves
    /// pages), so the engine is the right place to enforce the invariant.
    func test_fullSync_savesConversationsSortedByLastMessageAtDesc() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")

        let oldest = Date(timeIntervalSince1970: 1_000)
        let middle = Date(timeIntervalSince1970: 2_000)
        let newest = Date(timeIntervalSince1970: 3_000)

        // Backend returns rows in arbitrary order — sync engine must sort
        // them on persistence.
        let data: [APIConversation] = [
            TestFactories.makeAPIConversation(id: "older", lastMessageAt: oldest),
            TestFactories.makeAPIConversation(id: "newest", lastMessageAt: newest),
            TestFactories.makeAPIConversation(id: "middle", lastMessageAt: middle)
        ]
        let pagination = OffsetPagination(total: data.count, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: data, pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        await engine.fullSync()

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").value ?? []
        XCTAssertEqual(cached.map(\.id), ["newest", "middle", "older"], "Cache must be persisted sorted by lastMessageAt DESC")
    }

    // MARK: - Helpers

    private func makeAttachmentUpdatedEvent(
        conversationId: String,
        messageId: String,
        attachmentJson: [String: Any]
    ) -> AttachmentUpdatedEvent {
        let wrapper: [String: Any] = [
            "conversationId": conversationId,
            "messageId": messageId,
            "attachment": attachmentJson
        ]
        let data = try! JSONSerialization.data(withJSONObject: wrapper)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(AttachmentUpdatedEvent.self, from: data)
    }
}

// MARK: - Mock ConversationService

final class MockConversationService: ConversationServiceProviding, @unchecked Sendable {
    var listResult: Result<OffsetPaginatedAPIResponse<[APIConversation]>, Error> = .success(
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    var listCallCount = 0
    /// Réponses par OFFSET — nécessaire pour exercer la pagination réelle de
    /// `fullSync` (page 1 puis fan-out) : avec la seule `listResult`, toutes
    /// les pages renvoient les mêmes ids et le code de fusion des pages 2+
    /// n'est jamais atteint. Un offset absent retombe sur `listResult`.
    var listResultsByOffset: [Int: Result<OffsetPaginatedAPIResponse<[APIConversation]>, Error>] = [:]

    func reset() {
        listCallCount = 0
        listResultsByOffset = [:]
        listResult = .success(OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil))
    }

    func list(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        listCallCount += 1
        if let scoped = listResultsByOffset[offset] { return try scoped.get() }
        return try listResult.get()
    }

    func listPage(before cursor: String?, limit: Int, currentUserId: String) async throws -> ConversationPage {
        ConversationPage(items: [], nextCursor: nil, hasMore: false)
    }

    func search(query: String) async throws -> [APIConversation] { [] }

    func getById(_ conversationId: String) async throws -> APIConversation { fatalError("Not used in tests") }
    func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse { fatalError("Not used in tests") }
    func delete(conversationId: String) async throws {}
    func markRead(conversationId: String) async throws {}
    func markAsReceived(conversationId: String) async throws {}
    func markUnread(conversationId: String) async throws {}
    func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]> { fatalError("Not used in tests") }
    func deleteForMe(conversationId: String) async throws {}
    func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation] { [] }
    func findDirectWith(userId: String) async throws -> APIConversation? { nil }
    func removeParticipant(conversationId: String, key: String) async throws {}
    func updateParticipantRole(conversationId: String, userId: String, role: String) async throws {}
    func update(conversationId: String, title: String?, description: String?, avatar: String?, banner: String?, defaultWriteRole: String?, isAnnouncementChannel: Bool?, slowModeSeconds: Int?, autoTranslateEnabled: Bool?) async throws -> APIConversation { fatalError("Not used in tests") }
    func leave(conversationId: String) async throws {}
    func banParticipant(conversationId: String, key: String) async throws {}
    func unbanParticipant(conversationId: String, key: String) async throws {}
}

// MARK: - Mock MessageService

final class MockMessageService: MessageServiceProviding, @unchecked Sendable {
    var listResult: Result<MessagesAPIResponse, Error> = .success(
        MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    )
    var listCallCount = 0
    var listBeforeResult: Result<MessagesAPIResponse, Error> = .success(
        MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    )

    func reset() {
        listCallCount = 0
        listResult = .success(MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil))
    }

    func list(conversationId: String, offset: Int, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        listCallCount += 1
        return try listResult.get()
    }

    func listBefore(conversationId: String, before: String, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        return try listBeforeResult.get()
    }

    func listAfter(conversationId: String, after: Date, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse {
        return MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    }

    func listAround(conversationId: String, around: String, limit: Int, includeReplies: Bool, includeTranslations: Bool, languages: [String]?) async throws -> MessagesAPIResponse { fatalError("Not used in tests") }
    func send(conversationId: String, request: SendMessageRequest) async throws -> SendMessageResponseData { fatalError("Not used in tests") }
    func edit(messageId: String, content: String) async throws -> APIMessage { fatalError("Not used in tests") }
    func delete(conversationId: String, messageId: String) async throws {}
    func pin(conversationId: String, messageId: String) async throws {}
    func unpin(conversationId: String, messageId: String) async throws {}
    func consumeViewOnce(conversationId: String, messageId: String) async throws -> ConsumeViewOnceResponse { fatalError("Not used in tests") }
    func search(conversationId: String, query: String, limit: Int) async throws -> MessagesAPIResponse { fatalError("Not used in tests") }
    func searchWithCursor(conversationId: String, query: String, cursor: String) async throws -> MessagesAPIResponse { fatalError("Not used in tests") }
}

// MARK: - TestFactories extension

private extension TestFactories {
    static func makeAPIConversation(
        id: String = "conv-1",
        lastMessageAt: Date? = nil,
        unreadCount: Int = 0,
        updatedAt: Date? = nil
    ) -> APIConversation {
        var json: [String: Any] = [
            "id": id,
            "identifier": "test-\(id)",
            "type": "DIRECT",
            "createdAt": ISO8601DateFormatter().string(from: Date()),
            "updatedAt": ISO8601DateFormatter().string(from: updatedAt ?? Date()),
            "isActive": true,
            "unreadCount": unreadCount
        ]
        if let lastMessageAt {
            json["lastMessageAt"] = ISO8601DateFormatter().string(from: lastMessageAt)
        }
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIConversation.self, from: data)
    }
}

// MARK: - Gap-recovery mock (per-offset pages + transient per-offset failure)

private final class GapMockConversationService: ConversationServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    var pagesByOffset: [Int: [APIConversation]] = [:]
    var advertisedTotal: Int?
    /// offset -> number of leading calls that should throw before succeeding.
    var failTimesRemaining: [Int: Int] = [:]

    func list(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        let (items, total): ([APIConversation], Int?) = try lock.withLock {
            if let remaining = failTimesRemaining[offset], remaining > 0 {
                failTimesRemaining[offset] = remaining - 1
                throw URLError(.timedOut)
            }
            return (pagesByOffset[offset] ?? [], advertisedTotal)
        }
        return OffsetPaginatedAPIResponse(
            success: true,
            data: items,
            pagination: OffsetPagination(total: total, hasMore: nil, limit: limit, offset: offset),
            error: nil
        )
    }

    func listPage(before cursor: String?, limit: Int, currentUserId: String) async throws -> ConversationPage {
        ConversationPage(items: [], nextCursor: nil, hasMore: false)
    }
    func search(query: String) async throws -> [APIConversation] { [] }
    func getById(_ conversationId: String) async throws -> APIConversation { fatalError("Not used in tests") }
    func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse { fatalError("Not used in tests") }
    func delete(conversationId: String) async throws {}
    func markRead(conversationId: String) async throws {}
    func markAsReceived(conversationId: String) async throws {}
    func markUnread(conversationId: String) async throws {}
    func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]> { fatalError("Not used in tests") }
    func deleteForMe(conversationId: String) async throws {}
    func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation] { [] }
    func findDirectWith(userId: String) async throws -> APIConversation? { nil }
    func removeParticipant(conversationId: String, key: String) async throws {}
    func updateParticipantRole(conversationId: String, userId: String, role: String) async throws {}
    func update(conversationId: String, title: String?, description: String?, avatar: String?, banner: String?, defaultWriteRole: String?, isAnnouncementChannel: Bool?, slowModeSeconds: Int?, autoTranslateEnabled: Bool?) async throws -> APIConversation { fatalError("Not used in tests") }
    func leave(conversationId: String) async throws {}
    func banParticipant(conversationId: String, key: String) async throws {}
    func unbanParticipant(conversationId: String, key: String) async throws {}
}

// MARK: - Read-receipt frontier (don't mark a message read after the read moment)

final class ReadReceiptFrontierTests: XCTestCase {

    private func ownMessage(_ content: String, at seconds: TimeInterval,
                            status: MeeshyMessage.DeliveryStatus = .sent, isMe: Bool = true) -> MeeshyMessage {
        MeeshyMessage(conversationId: "c", content: content,
                      createdAt: Date(timeIntervalSince1970: seconds),
                      deliveryStatus: status, isMe: isMe)
    }

    /// The bug: a message I send AFTER the peer's read moment must NOT be marked
    /// `.read`. The read event's `updatedAt` is the frontier; only messages
    /// created at or before it were actually seen.
    func test_applyReadReceipt_messageSentAfterFrontier_staysUnread() {
        let frontier = Date(timeIntervalSince1970: 1000)
        let messages = [ownMessage("before", at: 900), ownMessage("after", at: 1100)]

        let result = ConversationSyncEngine.applyReadReceipt(
            to: messages, newStatus: .read, deliveredCount: 1, readCount: 1, frontier: frontier)

        XCTAssertEqual(result[0].deliveryStatus, .read, "the message sent before the read moment is read")
        XCTAssertEqual(result[1].deliveryStatus, .sent,
                       "a message sent AFTER the read moment must NOT falsely show as read")
    }

    func test_applyReadReceipt_allWithinFrontier_allAdvance() {
        let frontier = Date(timeIntervalSince1970: 1000)
        let messages = [ownMessage("m1", at: 800), ownMessage("m2", at: 900)]

        let result = ConversationSyncEngine.applyReadReceipt(
            to: messages, newStatus: .read, deliveredCount: 1, readCount: 1, frontier: frontier)

        XCTAssertEqual(result.map(\.deliveryStatus), [.read, .read])
        XCTAssertEqual(result[1].readCount, 1)
    }

    /// The frontier `continue` must not break the "older than the first read are
    /// all read" short-circuit: a newest message past the frontier is skipped,
    /// the middle (in-frontier) advances, and the oldest already-read stops it.
    func test_applyReadReceipt_skipPastFrontier_thenStopAtAlreadyRead() {
        let frontier = Date(timeIntervalSince1970: 1000)
        let messages = [
            ownMessage("old", at: 700, status: .read),
            ownMessage("mid", at: 900, status: .sent),
            ownMessage("new", at: 1100, status: .sent)
        ]

        let result = ConversationSyncEngine.applyReadReceipt(
            to: messages, newStatus: .read, deliveredCount: 1, readCount: 1, frontier: frontier)

        XCTAssertEqual(result.map(\.deliveryStatus), [.read, .read, .sent])
    }

    func test_applyReadReceipt_ignoresOtherUsersMessages() {
        let frontier = Date(timeIntervalSince1970: 1000)
        let messages = [ownMessage("theirs", at: 900, status: .sent, isMe: false)]

        let result = ConversationSyncEngine.applyReadReceipt(
            to: messages, newStatus: .read, deliveredCount: 1, readCount: 1, frontier: frontier)

        XCTAssertEqual(result[0].deliveryStatus, .sent, "a peer's message is never my delivery status")
    }

    func test_applyReadReceipt_deliveredDoesNotRegressRead() {
        let frontier = Date(timeIntervalSince1970: 1000)
        let messages = [ownMessage("m", at: 900, status: .read)]

        let result = ConversationSyncEngine.applyReadReceipt(
            to: messages, newStatus: .delivered, deliveredCount: 2, readCount: 0, frontier: frontier)

        XCTAssertEqual(result[0].deliveryStatus, .read, "a delivered update must not downgrade a read message")
    }
}

// MARK: - Last-message survivor after deletion

final class LastMessageSurvivorTests: XCTestCase {

    private func msg(_ id: String, at seconds: TimeInterval, deleted: Bool = false) -> MeeshyMessage {
        MeeshyMessage(id: id, conversationId: "c", content: id,
                      deletedAt: deleted ? Date(timeIntervalSince1970: seconds) : nil,
                      createdAt: Date(timeIntervalSince1970: seconds))
    }

    func test_survivor_picksMostRecentNonDeleted_excludingTarget() {
        let messages = [msg("m1", at: 100), msg("m2", at: 200), msg("m3", at: 300)]
        let survivor = ConversationSyncEngine.mostRecentSurvivor(in: messages, excluding: "m3")
        XCTAssertEqual(survivor?.id, "m2", "the newest surviving message becomes the preview")
    }

    /// The bug case: the deleted message was the only one — no survivor, so the
    /// caller must clear the stale preview rather than leave the deleted text.
    func test_survivor_nilWhenOnlyMessageDeleted() {
        let messages = [msg("m1", at: 100)]
        XCTAssertNil(ConversationSyncEngine.mostRecentSurvivor(in: messages, excluding: "m1"))
    }

    func test_survivor_skipsAlreadyDeletedMessages() {
        let messages = [msg("m1", at: 100), msg("m2", at: 200, deleted: true)]
        let survivor = ConversationSyncEngine.mostRecentSurvivor(in: messages, excluding: "m3")
        XCTAssertEqual(survivor?.id, "m1", "an already-deleted newer message is not a valid survivor")
    }

    func test_survivor_nilWhenEverythingDeletedOrExcluded() {
        let messages = [msg("m1", at: 100, deleted: true), msg("m2", at: 200)]
        XCTAssertNil(ConversationSyncEngine.mostRecentSurvivor(in: messages, excluding: "m2"))
    }

    // MARK: - mergeDeltaConversations (delta sync, O(existing + deltas))

    private func conv(_ id: String, identifier: String? = nil, active: Bool = true) -> MeeshyConversation {
        MeeshyConversation(id: id, identifier: identifier ?? id, isActive: active)
    }

    func test_mergeDeltaConversations_upsertsActive_removesInactive_addsNew() {
        let existing = [conv("a"), conv("b"), conv("c")]
        let deltas = [
            conv("b", identifier: "b-updated"), // update in place
            conv("c", active: false),           // remove
            conv("d")                           // new
        ]
        let (merged, removedIds) = ConversationSyncEngine.mergeDeltaConversations(existing: existing, deltas: deltas)
        XCTAssertEqual(Set(merged.map(\.id)), ["a", "b", "d"])
        XCTAssertEqual(merged.first(where: { $0.id == "b" })?.identifier, "b-updated")
        XCTAssertEqual(removedIds, ["c"])
    }

    func test_mergeDeltaConversations_inactiveNotInExisting_stillReportedForInvalidation() {
        // The original loop invalidated the message cache for EVERY inactive
        // delta, present or not — preserve that.
        let (merged, removedIds) = ConversationSyncEngine.mergeDeltaConversations(
            existing: [conv("a")], deltas: [conv("z", active: false)])
        XCTAssertEqual(Set(merged.map(\.id)), ["a"])
        XCTAssertEqual(removedIds, ["z"])
    }

    func test_mergeDeltaConversations_emptyDeltas_returnsExistingUntouched() {
        let (merged, removedIds) = ConversationSyncEngine.mergeDeltaConversations(
            existing: [conv("a"), conv("b")], deltas: [])
        XCTAssertEqual(Set(merged.map(\.id)), ["a", "b"])
        XCTAssertTrue(removedIds.isEmpty)
    }

    // MARK: - mergeDeltaConversations — tombstones (`meta.deletedConversationIds`)
    //
    // Une page delta ne porte que des lignes SERVIES : sa clause serveur exige
    // une conversation active et un participant actif sans `deletedForMe`. Une
    // conversation SORTIE de la vue (fermée, quittée, bannie, supprimée pour moi
    // depuis un autre appareil) n'apparaît donc dans AUCUNE réponse — pas même
    // en `isActive: false`, qui ne décrit que les sorties encore servables. Un
    // leave ou un ban n'écrit d'ailleurs que la ligne `Participant`, sans
    // toucher `Conversation.updatedAt`.

    func test_mergeDeltaConversations_tombstoneRemovesConversationAbsentFromThePage() {
        let (merged, removedIds) = ConversationSyncEngine.mergeDeltaConversations(
            existing: [conv("a"), conv("b")], deltas: [], tombstoneIds: ["b"])
        XCTAssertEqual(Set(merged.map(\.id)), ["a"])
        XCTAssertEqual(removedIds, ["b"],
            "sans ce canal, une conversation quittée depuis un autre appareil survit jusqu'à la réconciliation complète")
    }

    func test_mergeDeltaConversations_tombstoneWinsOverAnUpsertOfTheSameId() {
        // Les deux flux du même lot peuvent se contredire : la page a servi la
        // ligne (encore visible au moment de la lecture) et le stream des
        // sorties la déclare partie. La SORTIE est le fait le plus spécifique.
        let (merged, removedIds) = ConversationSyncEngine.mergeDeltaConversations(
            existing: [conv("a")],
            deltas: [conv("a", identifier: "a-updated")],
            tombstoneIds: ["a"])
        XCTAssertTrue(merged.isEmpty,
            "un upsert appliqué APRÈS la tombstone rendrait la purge inatteignable jusqu'à la réconciliation complète")
        XCTAssertEqual(removedIds, ["a"])
    }

    func test_mergeDeltaConversations_tombstoneAlreadyRemovedByAnInactiveDelta_reportedOnce() {
        // `removedIds` pilote une invalidation de cache par id : le même retrait
        // annoncé par les deux canaux ne doit pas la déclencher deux fois.
        let (merged, removedIds) = ConversationSyncEngine.mergeDeltaConversations(
            existing: [conv("a"), conv("b")],
            deltas: [conv("b", active: false)],
            tombstoneIds: ["b"])
        XCTAssertEqual(Set(merged.map(\.id)), ["a"])
        XCTAssertEqual(removedIds, ["b"])
    }

    func test_mergeDeltaConversations_tombstoneUnknownToTheCache_stillReportedForInvalidation() {
        // Même règle que pour un delta inactif inconnu : la liste et le cache
        // des messages sont deux magasins DISTINCTS, et une conversation absente
        // de l'une peut très bien laisser un fil dans l'autre.
        let (merged, removedIds) = ConversationSyncEngine.mergeDeltaConversations(
            existing: [conv("a")], deltas: [], tombstoneIds: ["z"])
        XCTAssertEqual(Set(merged.map(\.id)), ["a"])
        XCTAssertEqual(removedIds, ["z"])
    }

    func test_mergeDeltaConversations_noTombstones_leavesThePageUntouched() {
        let (merged, removedIds) = ConversationSyncEngine.mergeDeltaConversations(
            existing: [conv("a")], deltas: [conv("b")], tombstoneIds: [])
        XCTAssertEqual(Set(merged.map(\.id)), ["a", "b"])
        XCTAssertTrue(removedIds.isEmpty)
    }
}

/// Thread-safe collector for the `apiMessagePersistor` hook (the hook is a
/// `@Sendable` async closure — an actor is the simplest race-free recorder).
private actor PersistedMessagesCollector {
    private(set) var batches: [[APIMessage]] = []
    func append(_ messages: [APIMessage]) {
        batches.append(messages)
    }
}

/// sync-04 — reset des checkpoints de delta-sync (logout / ré-auth).
extension ConversationSyncEngineTests {

    func test_resetSyncCheckpoints_removesAllThreeUserDefaultsKeys() {
        let keys = ["me.meeshy.lastSyncTimestamp", "me.meeshy.lastCleanupDate", "me.meeshy.lastFullReconcileAt"]
        for key in keys { UserDefaults.standard.set(Date(), forKey: key) }

        engine.resetSyncCheckpoints()

        for key in keys {
            XCTAssertNil(
                UserDefaults.standard.object(forKey: key),
                "\(key) doit être effacé — le compte suivant ne doit pas hériter du watermark de la session sortante"
            )
        }
    }
}
