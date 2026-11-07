import XCTest
import Combine
import GRDB
@testable import Meeshy
import MeeshySDK

final class MockConversationMessageSearch: ConversationMessageSearchProviding, @unchecked Sendable {
    var localResult: [GlobalSearchMessageResult] = []
    var remoteResult: GlobalSearchLeg<GlobalSearchMessageResult> = .served([])
    /// La page rendue pour un curseur donné ; `remoteResult` sert la première.
    var remotePages: [String: GlobalSearchLeg<GlobalSearchMessageResult>] = [:]
    /// Suspend un volet réseau : une réponse qui revient après une autre frappe.
    var remoteGate: (@Sendable () async -> Void)?
    private(set) var localCallCount = 0
    private(set) var remoteCallCount = 0
    private(set) var remoteCursors: [String?] = []

    func localMessages(query: String, reader: MeeshyUser?) async -> [GlobalSearchMessageResult] {
        localCallCount += 1
        return localResult
    }

    func remoteMessages(query: String, reader: MeeshyUser?, after cursor: String?) async -> GlobalSearchLeg<GlobalSearchMessageResult> {
        remoteCallCount += 1
        remoteCursors.append(cursor)
        await remoteGate?()
        return cursor.flatMap { remotePages[$0] } ?? remoteResult
    }
}

@MainActor
final class ConversationListMessageSearchModelTests: XCTestCase {

    private func makeResult(
        id: String, at seconds: TimeInterval, content: String = "rendez-vous", conversationId: String = "conv-1"
    ) -> GlobalSearchMessageResult {
        GlobalSearchMessageResult(
            id: id, conversationId: conversationId, conversationName: "Equipe", conversationAvatar: nil,
            content: content, senderName: "Aminata", senderAvatar: nil,
            createdAt: Date(timeIntervalSince1970: seconds)
        )
    }

    private func makeSUT(
        text: PassthroughSubject<String, Never> = PassthroughSubject(),
        debounce: DispatchQueue.SchedulerTimeType.Stride = .milliseconds(300),
        contentLocks: @escaping () -> Set<String> = { [] }
    ) -> (sut: ConversationListMessageSearchModel, search: MockConversationMessageSearch) {
        let search = MockConversationMessageSearch()
        let sut = ConversationListMessageSearchModel(
            text: text.eraseToAnyPublisher(), search: search, reader: { nil }, debounce: debounce,
            contentLocks: contentLocks
        )
        return (sut, search)
    }

    func test_run_mergesLocalAndRemote_newestFirst_withoutDuplicates() async {
        let (sut, search) = makeSUT()
        search.localResult = [makeResult(id: "m1", at: 10), makeResult(id: "e2ee-local", at: 30)]
        search.remoteResult = .served([makeResult(id: "m1", at: 10), makeResult(id: "m2", at: 20)])

        await sut.run(query: "rendez")

        XCTAssertEqual(sut.results.map(\.id), ["e2ee-local", "m2", "m1"])
        XCTAssertFalse(sut.isSearching)
        XCTAssertTrue(sut.showsSection)
    }

    func test_run_remoteFails_keepsLocalResults() async {
        let (sut, search) = makeSUT()
        search.localResult = [makeResult(id: "local", at: 10)]
        search.remoteResult = .failed("panne")

        await sut.run(query: "rendez")

        XCTAssertEqual(sut.results.map(\.id), ["local"], "une panne réseau n'efface pas ce que l'appareil a trouvé")
    }

    func test_run_sameQueryTwice_servesRemoteFromCache() async {
        let (sut, search) = makeSUT()
        search.remoteResult = .served([makeResult(id: "m2", at: 20)])

        await sut.run(query: "rendez")
        await sut.run(query: "Rendez")

        XCTAssertEqual(search.remoteCallCount, 1, "la même requête dans les deux minutes ne refait pas l'aller-retour")
        XCTAssertEqual(search.localCallCount, 2, "l'index local est relu à chaque fois")
        XCTAssertEqual(sut.results.map(\.id), ["m2"])
    }

    func test_run_failedRemote_isNotCached() async {
        let (sut, search) = makeSUT()
        search.remoteResult = .failed("panne")
        await sut.run(query: "rendez")
        search.remoteResult = .served([makeResult(id: "m2", at: 20)])

        await sut.run(query: "rendez")

        XCTAssertEqual(search.remoteCallCount, 2)
        XCTAssertEqual(sut.results.map(\.id), ["m2"])
    }

    func test_loadMore_followsTheCursor_untilTheServerHasNoMore() async {
        let (sut, search) = makeSUT()
        search.remoteResult = GlobalSearchLeg(items: [makeResult(id: "m3", at: 30)], failure: nil, nextCursor: "c1")
        search.remotePages["c1"] = GlobalSearchLeg(items: [makeResult(id: "m2", at: 20)], failure: nil, nextCursor: "c2")
        search.remotePages["c2"] = .served([makeResult(id: "m1", at: 10)])

        await sut.run(query: "rendez")
        XCTAssertTrue(sut.canLoadMore)
        await sut.loadMore()
        await sut.loadMore()

        XCTAssertEqual(sut.results.map(\.id), ["m3", "m2", "m1"])
        XCTAssertEqual(search.remoteCursors, [nil, "c1", "c2"])
        XCTAssertFalse(sut.canLoadMore, "le serveur n'a plus rien à rendre")
        await sut.loadMore()
        XCTAssertEqual(search.remoteCallCount, 3, "aucun aller de plus une fois le curseur épuisé")
    }

    func test_loadMore_failure_keepsWhatIsShown_andTheCursorForARetry() async {
        let (sut, search) = makeSUT()
        search.remoteResult = GlobalSearchLeg(items: [makeResult(id: "m3", at: 30)], failure: nil, nextCursor: "c1")
        search.remotePages["c1"] = GlobalSearchLeg(items: [], failure: "panne", nextCursor: "c1")
        await sut.run(query: "rendez")

        await sut.loadMore()

        XCTAssertEqual(sut.results.map(\.id), ["m3"])
        XCTAssertEqual(sut.nextCursor, "c1", "la page ratée se redemande au défilement suivant")
        XCTAssertFalse(sut.isLoadingMore)
    }

    func test_loadMore_answerOfAnOlderQuery_isDropped() async {
        let (sut, search) = makeSUT()
        search.remoteResult = GlobalSearchLeg(items: [makeResult(id: "m3", at: 30)], failure: nil, nextCursor: "c1")
        search.remotePages["c1"] = .served([makeResult(id: "stale", at: 20)])
        await sut.run(query: "rendez")
        let release = AsyncStream<Void>.makeStream()
        let entered = expectation(description: "page demandée")
        search.remoteGate = { entered.fulfill(); for await _ in release.stream { break } }

        let more = Task { await sut.loadMore() }
        await fulfillment(of: [entered], timeout: 2)
        search.remoteGate = nil
        search.remoteResult = .served([makeResult(id: "fresh", at: 40)])
        await sut.run(query: "autre")
        release.continuation.yield()
        await more.value

        XCTAssertEqual(sut.results.map(\.id), ["fresh"], "la page d'une requête quittée ne se mêle pas à la nouvelle")
    }

    func test_loadMore_sectionFull_stopsAskingTheServer() async {
        let (sut, search) = makeSUT()
        let full = (0..<ConversationListMessageSearchModel.sectionCapacity).map { makeResult(id: "m\($0)", at: TimeInterval($0)) }
        search.remoteResult = GlobalSearchLeg(items: full, failure: nil, nextCursor: "c1")
        await sut.run(query: "rendez")

        await sut.loadMore()

        XCTAssertFalse(sut.canLoadMore)
        XCTAssertEqual(search.remoteCallCount, 1, "la section est bornée : la mémoire et le serveur aussi")
    }

    func test_run_sameQueryTwice_keepsTheCursorOfTheCachedPages() async {
        let (sut, search) = makeSUT()
        search.remoteResult = GlobalSearchLeg(items: [makeResult(id: "m3", at: 30)], failure: nil, nextCursor: "c1")
        search.remotePages["c1"] = GlobalSearchLeg(items: [makeResult(id: "m2", at: 20)], failure: nil, nextCursor: "c2")
        await sut.run(query: "rendez")
        await sut.loadMore()

        await sut.run(query: "rendez")

        XCTAssertEqual(sut.results.map(\.id), ["m3", "m2"], "le cache garde aussi les pages suivies")
        XCTAssertEqual(sut.nextCursor, "c2", "et repart d'où le défilement s'était arrêté")
        XCTAssertEqual(search.remoteCallCount, 2)
    }

    func test_run_lockedConversation_showsNoneOfItsMessages() async {
        let (sut, search) = makeSUT(contentLocks: { ["conv-locked"] })
        search.localResult = [makeResult(id: "local-secret", at: 30, conversationId: "conv-locked")]
        search.remoteResult = .served([
            makeResult(id: "remote-secret", at: 20, conversationId: "conv-locked"),
            makeResult(id: "m1", at: 10)
        ])

        await sut.run(query: "rendez")

        XCTAssertEqual(sut.results.map(\.id), ["m1"], "le verrou PIN protège le contenu, la recherche comprise (#11387)")
    }

    func test_run_lockedConversation_localLegHidesItBeforeTheNetworkAnswers() async {
        let (sut, search) = makeSUT(contentLocks: { ["conv-locked"] })
        search.localResult = [makeResult(id: "local-secret", at: 30, conversationId: "conv-locked")]
        let release = AsyncStream<Void>.makeStream()
        let entered = expectation(description: "volet réseau en vol")
        search.remoteGate = { entered.fulfill(); for await _ in release.stream { break } }

        let running = Task { await sut.run(query: "rendez") }
        await fulfillment(of: [entered], timeout: 2)
        XCTAssertTrue(sut.results.isEmpty, "le texte d'une conversation verrouillée ne paraît pas même le temps du réseau")
        release.continuation.yield()
        await running.value
    }

    func test_typing_shortQuery_hidesTheSection() async {
        let text = PassthroughSubject<String, Never>()
        let (sut, search) = makeSUT(text: text, debounce: .milliseconds(1))
        search.remoteResult = .served([makeResult(id: "m2", at: 20)])
        await sut.run(query: "rendez")

        let cleared = expectation(description: "section retirée")
        let token = sut.$query.dropFirst().sink { if $0.isEmpty { cleared.fulfill() } }
        text.send("r")
        await fulfillment(of: [cleared], timeout: 2)
        token.cancel()

        XCTAssertTrue(sut.results.isEmpty)
        XCTAssertFalse(sut.showsSection)
    }

    func test_typing_debouncedQuery_triggersOneSearch() async {
        let text = PassthroughSubject<String, Never>()
        let (sut, search) = makeSUT(text: text, debounce: .milliseconds(50))
        search.remoteResult = .served([makeResult(id: "m2", at: 20)])

        let served = expectation(description: "résultats servis")
        let token = sut.$results.sink { if !$0.isEmpty { served.fulfill() } }
        text.send("re")
        text.send("ren")
        text.send("rend")
        await fulfillment(of: [served], timeout: 2)
        token.cancel()

        XCTAssertEqual(search.remoteCallCount, 1, "l'anti-rebond ne lance qu'une recherche pour une rafale de frappes")
        XCTAssertEqual(sut.query, "rend")
    }
}

final class ConversationMessageSearchServiceTests: XCTestCase {

    func test_servedText_prefersTheReadersPrimaryLanguage() {
        let text = ConversationMessageSearchService.servedText(
            original: "Hello everyone", originalLanguage: "en",
            translations: [("fr", "Bonjour tout le monde"), ("es", "Hola a todos")],
            preferredLanguages: ["fr", "en"]
        )
        XCTAssertEqual(text, "Bonjour tout le monde", "la langue d'origine concourt à son rang, elle ne court-circuite pas le rang 1")
    }

    func test_servedText_noPrismLanguageServed_keepsTheOriginal() {
        let text = ConversationMessageSearchService.servedText(
            original: "Hello everyone", originalLanguage: "en",
            translations: [("es", "Hola a todos")],
            preferredLanguages: ["fr"]
        )
        XCTAssertEqual(text, "Hello everyone", "jamais une langue tierce")
    }

    func test_remoteMessages_globalRoute_servesTheGatewaysPrismText() async {
        let api = MockAPIClientForApp()
        let page: PaginatedAPIResponse<[APIMessageSearchHit]> = JSONStub.decode("""
        {"success":true,"data":[{
          "id":"m1","conversationId":"c1","createdAt":"2026-11-02T10:00:00.000Z","messageType":"text",
          "content":"Bonjour","servedLanguage":"fr","originalContent":"Hello","originalLanguage":"en",
          "sender":{"id":"p1","userId":"u1","displayName":"Aminata","username":"ami","avatar":null},
          "conversation":{"id":"c1","identifier":null,"type":"group","title":"Equipe","avatar":null}
        }],"pagination":{"limit":30,"hasMore":false,"nextCursor":null}}
        """)
        api.stub("/messages/search", result: page)
        let service = ConversationMessageSearchService(
            api: api, searchService: MessageSearchService(reader: try! DatabaseQueue()), cachedConversations: { [] }
        )

        let leg = await service.remoteMessages(query: "bonjour", reader: nil)

        XCTAssertNil(leg.failure)
        XCTAssertEqual(leg.items.map(\.content), ["Bonjour"])
        XCTAssertEqual(leg.items.first?.conversationName, "Equipe")
        XCTAssertEqual(leg.items.first?.senderName, "Aminata")
        XCTAssertFalse(api.requestEndpoints.contains("/conversations/search"), "la route globale suffit : pas d'aller-retour par conversation")
    }

    private func hit(_ id: String, conversationId: String = "c1", title: String = "Equipe", avatar: String? = nil) -> String {
        """
        {"id":"\(id)","conversationId":"\(conversationId)","createdAt":"2026-11-02T10:00:00.000Z","messageType":"text",
         "content":"Bonjour","servedLanguage":"fr","originalContent":"Hello","originalLanguage":"en",
         "sender":{"id":"p1","userId":"u1","displayName":"Aminata","username":"ami","avatar":null},
         "conversation":{"id":"\(conversationId)","identifier":null,"type":"direct","title":"\(title)","avatar":\(avatar.map { "\"\($0)\"" } ?? "null")}}
        """
    }

    private func page(_ hits: [String], next: String?) -> PaginatedAPIResponse<[APIMessageSearchHit]> {
        let cursor = next.map { "\"\($0)\"" } ?? "null"
        return JSONStub.decode("""
        {"success":true,"data":[\(hits.joined(separator: ","))],
         "pagination":{"limit":30,"hasMore":\(next != nil),"nextCursor":\(cursor)}}
        """)
    }

    private func makeService(
        api: MockAPIClientForApp,
        conversations: [MeeshyConversation] = []
    ) -> ConversationMessageSearchService {
        ConversationMessageSearchService(
            api: api, searchService: MessageSearchService(reader: try! DatabaseQueue()), cachedConversations: { conversations }
        )
    }

    private func cursors(_ api: MockAPIClientForApp) -> [String?] {
        api.requestQueryItems.map { $0.first { $0.name == "cursor" }?.value }
    }

    func test_remoteMessages_emptyPageWithHasMore_followsTheCursorToTheFullPage() async {
        let api = MockAPIClientForApp()
        api.stubSequence("/messages/search", results: [page([], next: "c1"), page([hit("m1")], next: "c2")])

        let leg = await makeService(api: api).remoteMessages(query: "bonjour", reader: nil)

        XCTAssertEqual(leg.items.map(\.id), ["m1"], "une page vide avec hasMore ne dit pas « rien »")
        XCTAssertEqual(cursors(api), [nil, "c1"], "le curseur repart TEL QUEL")
        XCTAssertEqual(leg.nextCursor, "c2", "la suite reste à demander au défilement")
    }

    func test_remoteMessages_aPageWithHits_answersAtOnce() async {
        let api = MockAPIClientForApp()
        api.stubSequence("/messages/search", results: [page([hit("m1")], next: "c1")])

        let leg = await makeService(api: api).remoteMessages(query: "bonjour", reader: nil)

        XCTAssertEqual(api.requestCount, 1, "un résultat s'affiche sans attendre la page suivante")
        XCTAssertEqual(leg.nextCursor, "c1")
    }

    func test_remoteMessages_lastPage_hasNoCursor() async {
        let api = MockAPIClientForApp()
        api.stubSequence("/messages/search", results: [page([hit("m1")], next: nil)])

        let leg = await makeService(api: api).remoteMessages(query: "bonjour", reader: nil)

        XCTAssertNil(leg.nextCursor)
    }

    func test_remoteMessages_onlyEmptyPages_stopsAtItsBudget() async {
        let api = MockAPIClientForApp()
        let budget = ConversationMessageSearchService.emptyPageBudget
        api.stubSequence("/messages/search", results: (0...budget + 2).map { page([], next: "c\($0)") })

        let leg = await makeService(api: api).remoteMessages(query: "bonjour", reader: nil)

        XCTAssertEqual(api.requestCount, budget, "un terme rare ne balaie pas tout l'historique à chaque frappe (#16476)")
        XCTAssertTrue(leg.items.isEmpty)
    }

    func test_remoteMessages_afterACursor_sendsItAndFailureKeepsIt() async {
        let api = MockAPIClientForApp()
        api.stubSequence("/messages/search", results: [NSError(domain: "reseau", code: -1)])

        let leg = await makeService(api: api).remoteMessages(query: "bonjour", reader: nil, after: "c7")

        XCTAssertEqual(cursors(api), ["c7"])
        XCTAssertNotNil(leg.failure)
        XCTAssertEqual(leg.nextCursor, "c7", "la page ratée se redemande")
        XCTAssertFalse(api.requestEndpoints.contains("/conversations/search"), "la suite d'une pagination ne repasse pas par l'ancien chemin")
    }

    func test_remoteMessages_knownDirect_keepsThePeersNameAndPhoto_neverTheServedCard() async {
        let api = MockAPIClientForApp()
        api.stubSequence("/messages/search", results: [page([hit("m1", title: "Titre legacy", avatar: "conv.png")], next: nil)])
        let direct = MeeshyConversation(
            id: "c1", identifier: "c1", type: .direct, title: "Aminata Diop", avatar: "conv.png",
            customName: "Mimi", participantAvatarURL: "peer.png"
        )

        let leg = await makeService(api: api, conversations: [direct]).remoteMessages(query: "bonjour", reader: nil)

        XCTAssertEqual(leg.items.first?.conversationName, "Mimi", "le nom choisi par le lecteur gagne (#16485)")
        XCTAssertEqual(leg.items.first?.conversationAvatar, "peer.png", "un direct montre son interlocuteur")
    }

    func test_remoteMessages_knownDirectWithoutPeerPhoto_staysOnInitials() async {
        let api = MockAPIClientForApp()
        api.stubSequence("/messages/search", results: [page([hit("m1", avatar: "conv.png")], next: nil)])
        let direct = MeeshyConversation(id: "c1", identifier: "c1", type: .direct, title: "Aminata", avatar: "conv.png")

        let leg = await makeService(api: api, conversations: [direct]).remoteMessages(query: "bonjour", reader: nil)

        XCTAssertNil(leg.items.first?.conversationAvatar, "la photo de la conversation n'est jamais prêtée à un direct")
    }

    func test_remoteMessages_unknownConversation_usesTheServedCard() async {
        let api = MockAPIClientForApp()
        api.stubSequence("/messages/search", results: [page([hit("m1", title: "Equipe", avatar: "conv.png")], next: nil)])

        let leg = await makeService(api: api).remoteMessages(query: "bonjour", reader: nil)

        XCTAssertEqual(leg.items.first?.conversationName, "Equipe")
        XCTAssertEqual(leg.items.first?.conversationAvatar, "conv.png")
    }

    func test_localMessages_conversationNotCached_neverShowsARawIdentifier() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            try SearchTestMessageRecordFactory.make(localId: "m1", conversationId: "6900aa", content: "see you tomorrow").insert(db)
        }
        let service = ConversationMessageSearchService(
            api: MockAPIClientForApp(), searchService: MessageSearchService(reader: pool), cachedConversations: { [] }
        )

        let results = await service.localMessages(query: "tomorrow", reader: nil)

        XCTAssertEqual(results.count, 1)
        XCTAssertNotEqual(results.first?.conversationName, "6900aa")
    }

    func test_remoteMessages_gatewayWithoutTheRoute_fallsBackToPerConversationSearch() async {
        let api = MockAPIClientForApp()
        let conversations: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[{"id":"conv-old","type":"group","title":"Ancienne","createdAt":"2026-01-01T00:00:00Z"}]}
        """)
        api.stub("/conversations/search", result: conversations)
        let messages: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"msg-old","conversationId":"conv-old","senderId":"user-002","content":"bonjour","createdAt":"2026-01-01T00:04:00.000Z"}
        ],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        api.stub("/conversations/conv-old/messages/search", result: messages)
        let service = ConversationMessageSearchService(
            api: api, searchService: MessageSearchService(reader: try! DatabaseQueue()), cachedConversations: { [] }
        )

        let leg = await service.remoteMessages(query: "bonjour", reader: nil)

        XCTAssertEqual(leg.items.map(\.id), ["msg-old"], "une passerelle d'avant la route sert encore ses résultats")
    }

    func test_localMessages_servesTheCachedTranslationOfTheReader() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            var record = SearchTestMessageRecordFactory.make(localId: "m1", conversationId: "conv-1", content: "see you tomorrow")
            record.originalLanguage = "en"
            try record.insert(db)
            try TranslationRecord(
                id: "t1", messageLocalId: "m1", messageServerId: nil, targetLanguage: "fr",
                translatedContent: "à demain", translationModel: "nllb", confidenceScore: nil,
                sourceLanguage: "en", receivedAt: Date(timeIntervalSince1970: 0)
            ).insert(db)
        }
        let service = ConversationMessageSearchService(
            api: MockAPIClientForApp(),
            searchService: MessageSearchService(reader: pool),
            cachedConversations: { [] }
        )

        let results = await service.localMessages(
            query: "tomorrow",
            reader: MeeshyUser(id: "user-001", username: "lecteur", systemLanguage: "fr")
        )

        XCTAssertEqual(results.map(\.content), ["à demain"])
        XCTAssertEqual(results.first?.conversationId, "conv-1")
    }
}

@MainActor
final class MessageSearchResultOpenerTests: XCTestCase {

    private func makeResult(conversationId: String) -> GlobalSearchMessageResult {
        GlobalSearchMessageResult(
            id: "m-old", conversationId: conversationId, conversationName: "Equipe", conversationAvatar: nil,
            content: "rendez-vous", senderName: "Aminata", senderAvatar: nil, createdAt: Date(timeIntervalSince1970: 0)
        )
    }

    private func conversation(_ id: String) -> Conversation {
        Conversation(id: id, identifier: id, type: .group, title: "Equipe")
    }

    func test_open_knownConversation_opensItOnTheMessage_withoutANetworkRead() async {
        var opened: [(String, String)] = []
        var fetches = 0

        await MessageSearchResultOpener.open(
            makeResult(conversationId: "c1"), among: [conversation("c1")],
            fetch: { _ in fetches += 1; return nil },
            navigate: { opened.append(($0.id, $1)) },
            failed: { XCTFail("aucune erreur attendue") }
        )

        XCTAssertEqual(opened.map(\.0), ["c1"])
        XCTAssertEqual(opened.map(\.1), ["m-old"])
        XCTAssertEqual(fetches, 0)
    }

    func test_open_conversationBeyondTheLoadedPage_isReadThenOpenedOnTheMessage() async {
        var opened: [(String, String)] = []

        await MessageSearchResultOpener.open(
            makeResult(conversationId: "c-far"), among: [conversation("c1")],
            fetch: { [self] in conversation($0) },
            navigate: { opened.append(($0.id, $1)) },
            failed: { XCTFail("aucune erreur attendue") }
        )

        XCTAssertEqual(opened.map(\.0), ["c-far"], "un toucher n'est jamais perdu parce que la conversation est hors de la page chargée")
        XCTAssertEqual(opened.map(\.1), ["m-old"])
    }

    func test_open_unreadableConversation_saysSo() async {
        var failures = 0

        await MessageSearchResultOpener.open(
            makeResult(conversationId: "c-far"), among: [],
            fetch: { _ in nil },
            navigate: { _, _ in XCTFail("rien à ouvrir") },
            failed: { failures += 1 }
        )

        XCTAssertEqual(failures, 1)
    }
}
