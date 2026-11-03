import XCTest
import Combine
import GRDB
@testable import Meeshy
import MeeshySDK

final class MockConversationMessageSearch: ConversationMessageSearchProviding, @unchecked Sendable {
    var localResult: [GlobalSearchMessageResult] = []
    var remoteResult: GlobalSearchLeg<GlobalSearchMessageResult> = .served([])
    private(set) var localCallCount = 0
    private(set) var remoteCallCount = 0

    func localMessages(query: String, reader: MeeshyUser?) async -> [GlobalSearchMessageResult] {
        localCallCount += 1
        return localResult
    }

    func remoteMessages(query: String, reader: MeeshyUser?) async -> GlobalSearchLeg<GlobalSearchMessageResult> {
        remoteCallCount += 1
        return remoteResult
    }
}

@MainActor
final class ConversationListMessageSearchModelTests: XCTestCase {

    private func makeResult(id: String, at seconds: TimeInterval, content: String = "rendez-vous") -> GlobalSearchMessageResult {
        GlobalSearchMessageResult(
            id: id, conversationId: "conv-1", conversationName: "Equipe", conversationAvatar: nil,
            content: content, senderName: "Aminata", senderAvatar: nil,
            createdAt: Date(timeIntervalSince1970: seconds)
        )
    }

    private func makeSUT(
        text: PassthroughSubject<String, Never> = PassthroughSubject(),
        debounce: DispatchQueue.SchedulerTimeType.Stride = .milliseconds(300)
    ) -> (sut: ConversationListMessageSearchModel, search: MockConversationMessageSearch) {
        let search = MockConversationMessageSearch()
        let sut = ConversationListMessageSearchModel(
            text: text.eraseToAnyPublisher(), search: search, reader: { nil }, debounce: debounce
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
