import XCTest
import MeeshySDK
@testable import Meeshy

/// L'index d'un genre en mémoire, pour les témoins de l'écran des médias.
final class InMemoryConversationMediaHubStore: ConversationMediaHubIndexStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var carriers: [ConversationMediaKind: [MeeshyMessage]]
    private var complete: Set<ConversationMediaKind>
    private let fresh: Bool
    private(set) var mergeCount = 0

    init(seed: [ConversationMediaKind: [MeeshyMessage]] = [:], complete: Set<ConversationMediaKind> = [], fresh: Bool = false) {
        self.carriers = seed
        self.complete = complete
        self.fresh = fresh
    }

    func stored(_ kind: ConversationMediaKind) -> [MeeshyMessage] {
        lock.withLock { carriers[kind] ?? [] }
    }

    func isMarkedComplete(_ kind: ConversationMediaKind) -> Bool {
        lock.withLock { complete.contains(kind) }
    }

    func load(conversationId: String, kind: ConversationMediaKind) async -> CacheResult<[MeeshyMessage]> {
        lock.withLock {
            guard let items = carriers[kind], !items.isEmpty else { return .empty }
            return fresh ? .fresh(items, age: 1) : .stale(items, age: 3_600)
        }
    }

    func merge(_ incoming: [MeeshyMessage], conversationId: String, kind: ConversationMediaKind) async {
        lock.withLock {
            mergeCount += 1
            carriers[kind] = ConversationMediaHubViewModel.union(carriers[kind] ?? [], incoming)
        }
    }

    func isComplete(conversationId: String, kind: ConversationMediaKind) async -> Bool {
        lock.withLock { complete.contains(kind) }
    }

    func markComplete(conversationId: String, kind: ConversationMediaKind) async {
        _ = lock.withLock { complete.insert(kind) }
    }
}

/// #8103 — **l'écran « Médias, liens et documents »** : cache d'abord, un
/// segment par genre, pagination à la demande, recherche locale puis serveur.
@MainActor
final class ConversationMediaHubViewModelTests: XCTestCase {

    private let conversationId = "conv-hub"

    private func makeSUT(
        store: InMemoryConversationMediaHubStore = InMemoryConversationMediaHubStore(),
        pageSize: Int = 2
    ) -> (sut: ConversationMediaHubViewModel, service: MockMessageService, store: InMemoryConversationMediaHubStore) {
        let service = MockMessageService()
        let sut = ConversationMediaHubViewModel(
            conversationId: conversationId,
            messageService: service,
            store: store,
            currentUserId: { "me" },
            preferredLanguages: { ["fr"] },
            isHidden: { _ in false },
            now: { Date(timeIntervalSince1970: 1_800_000_000) },
            pageSize: pageSize,
            debounce: .zero
        )
        return (sut, service, store)
    }

    private func pdfCarrier(_ n: Int, name: String = "doc.pdf") -> MeeshyMessage {
        MeeshyMessage(
            id: "msg-\(n)", conversationId: conversationId, content: "",
            messageType: .file, createdAt: Date(timeIntervalSince1970: TimeInterval(1_700_000_000 + n)),
            attachments: [MeeshyMessageAttachment(id: "att-\(n)", originalName: name, mimeType: "application/pdf")]
        )
    }

    private func pdfJSON(_ n: Int, name: String = "doc.pdf") -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let createdAt = formatter.string(from: Date(timeIntervalSince1970: TimeInterval(1_700_000_000 + n)))
        return """
        {"id":"msg-\(n)","conversationId":"\(conversationId)","senderId":"u","content":"",\
        "originalLanguage":"fr","messageType":"file","createdAt":"\(createdAt)",\
        "attachments":[{"id":"att-\(n)","mimeType":"application/pdf","originalName":"\(name)"}]}
        """
    }

    private func page(_ items: [String], hasMore: Bool) -> MessagesAPIResponse {
        JSONStub.decode("""
        {"success":true,"data":[\(items.joined(separator: ","))],"pagination":null,\
        "cursorPagination":{"hasMore":\(hasMore),"nextCursor":null,"limit":2},"hasNewer":null}
        """)
    }

    // MARK: - Cache d'abord

    func test_open_staleIndexAndOfflineNetwork_showsTheIndexWithTheOfflineNotice() async {
        let store = InMemoryConversationMediaHubStore(seed: [.document: [pdfCarrier(1), pdfCarrier(2)]])
        let (sut, service, _) = makeSUT(store: store)
        service.listMediaResult = .failure(URLError(.notConnectedToInternet))

        sut.select(.document)
        await sut.open(.document)

        XCTAssertEqual(sut.listing.items.map(\.messageId), ["msg-2", "msg-1"])
        XCTAssertEqual(sut.listing.phase, .offline)
    }

    func test_open_freshAndCompleteIndex_servesItWithoutAnyRequest() async {
        let store = InMemoryConversationMediaHubStore(seed: [.document: [pdfCarrier(1)]], complete: [.document], fresh: true)
        let (sut, service, _) = makeSUT(store: store)

        sut.select(.document)
        await sut.open(.document)

        XCTAssertEqual(service.listMediaCallCount, 0)
        XCTAssertEqual(sut.listing.items.count, 1)
        XCTAssertEqual(sut.listing.phase, .loaded)
        XCTAssertFalse(sut.listing.canLoadMore)
    }

    func test_open_emptyIndex_requestsOnlyTheSegmentKindAndPersistsThePage() async {
        let (sut, service, store) = makeSUT()
        service.listMediaResult = .success(page([pdfJSON(3), pdfJSON(2)], hasMore: true))

        sut.select(.document)
        await sut.open(.document)

        XCTAssertEqual(service.listMediaKinds.first, [.document])
        XCTAssertEqual(service.listMediaQueries.first ?? "x", nil)
        XCTAssertEqual(sut.listing.items.map(\.messageId), ["msg-3", "msg-2"])
        XCTAssertEqual(store.stored(.document).map(\.id), ["msg-2", "msg-3"])
        XCTAssertTrue(sut.listing.canLoadMore)
    }

    func test_open_emptyIndexAndServerRefusal_drawsTheErrorState() async {
        let (sut, service, _) = makeSUT()
        service.listMediaResult = .failure(APIError.serverError(400, "INVALID_VIEW"))

        sut.select(.audio)
        await sut.open(.audio)

        XCTAssertTrue(sut.listing.items.isEmpty)
        XCTAssertEqual(sut.listing.phase, .failed)
    }

    // MARK: - Pagination

    func test_loadMore_pagesBeforeTheOldestAndStopsAtTheFirstMedia() async {
        let (sut, service, store) = makeSUT()
        service.listMediaResults = [
            .success(page([pdfJSON(4), pdfJSON(3)], hasMore: true)),
            .success(page([pdfJSON(2)], hasMore: false)),
        ]

        sut.select(.document)
        await sut.open(.document)
        await sut.loadMoreNow()

        XCTAssertEqual(service.listMediaCursors, [nil, "msg-3"])
        XCTAssertEqual(sut.listing.items.map(\.messageId), ["msg-4", "msg-3", "msg-2"])
        XCTAssertFalse(sut.listing.canLoadMore)
        XCTAssertTrue(store.isMarkedComplete(.document))

        await sut.loadMoreNow()
        XCTAssertEqual(service.listMediaCallCount, 2, "un index épuisé ne redemande rien")
    }

    func test_open_headMeetsTheCachedIndex_resumesBehindItsOldest() async {
        let store = InMemoryConversationMediaHubStore(seed: [.document: [pdfCarrier(1), pdfCarrier(2)]])
        let (sut, service, _) = makeSUT(store: store)
        service.listMediaResults = [
            .success(page([pdfJSON(3), pdfJSON(2)], hasMore: true)),
            .success(page([], hasMore: false)),
        ]

        sut.select(.document)
        await sut.open(.document)
        await sut.loadMoreNow()

        XCTAssertEqual(service.listMediaCursors, [nil, "msg-1"])
    }

    // MARK: - Recherche

    func test_runSearch_answersFromTheIndexThenAsksTheServerWithTheTerm() async {
        let store = InMemoryConversationMediaHubStore(seed: [.document: [pdfCarrier(1, name: "facture.pdf"), pdfCarrier(2, name: "menu.pdf")]],
                                                      complete: [.document], fresh: true)
        let (sut, service, _) = makeSUT(store: store)
        service.listMediaResult = .success(page([pdfJSON(9, name: "facture-ancienne.pdf")], hasMore: false))

        sut.select(.document)
        await sut.open(.document)
        await sut.runSearch("facture")

        XCTAssertEqual(service.listMediaQueries.last ?? nil, "facture")
        XCTAssertEqual(service.listMediaKinds.last, [.document])
        XCTAssertEqual(sut.listing.items.map(\.messageId), ["msg-9", "msg-1"])
        XCTAssertEqual(store.stored(.document).map(\.id), ["msg-1", "msg-2"], "une recherche n'écrit pas dans l'index")
    }

    func test_runSearch_offline_keepsTheLocalMatches() async {
        let store = InMemoryConversationMediaHubStore(seed: [.document: [pdfCarrier(1, name: "facture.pdf")]],
                                                      complete: [.document], fresh: true)
        let (sut, service, _) = makeSUT(store: store)
        service.listMediaResult = .failure(URLError(.notConnectedToInternet))

        sut.select(.document)
        await sut.open(.document)
        await sut.runSearch("fact")

        XCTAssertEqual(sut.listing.items.map(\.messageId), ["msg-1"])
        XCTAssertEqual(sut.listing.phase, .offline)
    }

    func test_updateQuery_underTwoCharacters_restoresTheWholeSegmentWithoutRequest() async {
        let store = InMemoryConversationMediaHubStore(seed: [.document: [pdfCarrier(1), pdfCarrier(2)]],
                                                      complete: [.document], fresh: true)
        let (sut, service, _) = makeSUT(store: store)
        sut.select(.document)
        await sut.open(.document)

        sut.updateQuery(" a ")

        XCTAssertNil(sut.activeQuery)
        XCTAssertEqual(sut.listing.items.count, 2)
        XCTAssertEqual(service.listMediaCallCount, 0)
    }
}
