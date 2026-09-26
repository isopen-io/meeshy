import XCTest
import MeeshySDK
@testable import Meeshy

/// #8095 — **la galerie feuillette TOUS les médias d'une conversation**, même
/// ceux des messages que la fenêtre n'a jamais chargés.
///
/// La source est `ConversationMediaCatalog` : la fenêtre en mémoire + l'INDEX
/// persisté des porteurs de médias + les pages `view=media` remontées en
/// arrière-plan. Ces témoins gardent ce qu'elle promet à la galerie : ce qu'on
/// y voit (fusion, dédoublonnage, exclusions), d'où ça vient (cache d'abord,
/// réseau ensuite, jusqu'à épuisement), et ce qui arrive quand le réseau ou le
/// serveur ne suit pas (rien de visible).
@MainActor
final class ConversationMediaCatalogTests: XCTestCase {

    private let conversationId = "conv-media"
    private let me = "user-me"

    // MARK: - Fabriques

    private func makeSUT(
        store: InMemoryConversationMediaIndexStore = InMemoryConversationMediaIndexStore(),
        service: MockMessageService = MockMessageService(),
        hidden: Set<String> = [],
        pageSize: Int = 2
    ) -> (sut: ConversationMediaCatalog, service: MockMessageService, store: InMemoryConversationMediaIndexStore) {
        let sut = ConversationMediaCatalog(
            conversationId: conversationId,
            messageService: service,
            store: store,
            currentUserId: { [me] in me },
            isHidden: { hidden.contains($0) },
            now: { Date(timeIntervalSince1970: 1_800_000_000) },
            pageSize: pageSize
        )
        return (sut, service, store)
    }

    private func carrier(_ n: Int, attachment: String? = nil, viewOnce: Bool = false, content: String = "") -> MeeshyMessage {
        var photo = MeeshyMessageAttachment(id: attachment ?? "att-\(n)", mimeType: "image/jpeg")
        photo.isViewOnce = viewOnce
        return MeeshyMessage(
            id: "msg-\(n)",
            conversationId: conversationId,
            senderId: "user-other",
            content: content,
            originalLanguage: "en",
            messageType: .image,
            createdAt: Date(timeIntervalSince1970: TimeInterval(1_700_000_000 + n)),
            attachments: [photo],
            senderName: "Other"
        )
    }

    private func apiJSON(_ n: Int, viewOnce: Bool = false, content: String = "", translations: String = "null") -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let createdAt = formatter.string(from: Date(timeIntervalSince1970: TimeInterval(1_700_000_000 + n)))
        return """
        {"id":"msg-\(n)","conversationId":"\(conversationId)","senderId":"user-other","content":"\(content)",\
        "originalLanguage":"en","messageType":"image","createdAt":"\(createdAt)",\
        "isViewOnce":\(viewOnce),"translations":\(translations),\
        "attachments":[{"id":"att-\(n)","mimeType":"image/jpeg"}]}
        """
    }

    private func page(_ items: [String], hasMore: Bool?) -> MessagesAPIResponse {
        let more = hasMore.map { "{\"hasMore\":\($0),\"nextCursor\":null,\"limit\":2}" } ?? "null"
        return JSONStub.decode("""
        {"success":true,"data":[\(items.joined(separator: ","))],"pagination":null,"cursorPagination":\(more),"hasNewer":null}
        """)
    }

    private struct ViewRejected: Error {}

    // MARK: - La fusion

    func test_load_indexHoldsCarriersAbsentFromMemory_galleryListsThemBeforeTheLoadedOnes() async {
        let store = InMemoryConversationMediaIndexStore(seed: [carrier(1), carrier(2)], completed: true, fresh: true)
        let (sut, _, _) = makeSUT(store: store)
        sut.syncLive([carrier(9)], serverId: { $0 })

        await sut.load(preferredLanguages: ["fr"])

        XCTAssertEqual(sut.snapshot.attachments.map(\.id), ["att-1", "att-2", "att-9"])
    }

    func test_syncLive_messageBothLoadedAndIndexed_keepsOneCopyAndTheLoadedOneWins() async {
        var stale = carrier(3)
        stale.attachments[0].caption = "ancienne"
        let store = InMemoryConversationMediaIndexStore(seed: [stale], completed: true, fresh: true)
        let (sut, _, _) = makeSUT(store: store)
        var fresh = carrier(3)
        fresh.attachments[0].caption = "à jour"

        await sut.load(preferredLanguages: ["fr"])
        sut.syncLive([fresh], serverId: { $0 })

        XCTAssertEqual(sut.snapshot.attachments.map(\.id), ["att-3"])
        XCTAssertEqual(sut.snapshot.attachments.first?.caption, "à jour")
        XCTAssertTrue(sut.snapshot.isLoaded("att-3"))
    }

    func test_syncLive_optimisticRowKnownByItsServerId_doesNotDuplicateTheIndexedCopy() async {
        let store = InMemoryConversationMediaIndexStore(seed: [carrier(4)], completed: true, fresh: true)
        let (sut, _, _) = makeSUT(store: store)
        let optimistic = MeeshyMessage(
            id: "cid-local", conversationId: conversationId, content: "", messageType: .image,
            createdAt: Date(timeIntervalSince1970: 1_700_000_004),
            attachments: [MeeshyMessageAttachment(id: "att-local", mimeType: "image/jpeg")]
        )

        await sut.load(preferredLanguages: ["fr"])
        sut.syncLive([optimistic], serverId: { $0 == "cid-local" ? "msg-4" : $0 })

        XCTAssertEqual(sut.snapshot.attachments.map(\.id), ["att-local"])
    }

    func test_load_viewOnceCarrierInThePage_neverEntersTheGallery() async {
        let (sut, service, _) = makeSUT()
        service.listMediaResults = [.success(page([apiJSON(2), apiJSON(1, viewOnce: true)], hasMore: false))]

        await sut.load(preferredLanguages: ["fr"])

        XCTAssertEqual(sut.snapshot.attachments.map(\.id), ["att-2"])
    }

    func test_load_carrierHiddenForMe_neverEntersTheGallery() async {
        let store = InMemoryConversationMediaIndexStore(seed: [carrier(1), carrier(2)], completed: true, fresh: true)
        let (sut, _, _) = makeSUT(store: store, hidden: ["msg-1"])

        await sut.load(preferredLanguages: ["fr"])

        XCTAssertEqual(sut.snapshot.attachments.map(\.id), ["att-2"])
    }

    // MARK: - La remontée

    func test_load_emptyIndex_pagesBackUntilHasMoreIsFalseThenStops() async {
        let (sut, service, store) = makeSUT()
        service.listMediaResults = [
            .success(page([apiJSON(6), apiJSON(5)], hasMore: true)),
            .success(page([apiJSON(4), apiJSON(3)], hasMore: true)),
            .success(page([apiJSON(2)], hasMore: false))
        ]

        await sut.load(preferredLanguages: ["fr"])

        XCTAssertEqual(service.listMediaCallCount, 3)
        XCTAssertEqual(service.listMediaCursors, [nil, "msg-5", "msg-3"])
        XCTAssertEqual(sut.snapshot.attachments.map(\.id), ["att-2", "att-3", "att-4", "att-5", "att-6"])
        let persisted = await store.completed
        XCTAssertTrue(persisted, "l'épuisement se retient : la prochaine ouverture ne refeuillette pas tout")
    }

    func test_load_staleCompletedIndex_refreshesOnlyTheHeadUntilItMeetsAKnownCarrier() async {
        let store = InMemoryConversationMediaIndexStore(seed: [carrier(1), carrier(2)], completed: true, fresh: false)
        let (sut, service, _) = makeSUT(store: store)
        service.listMediaResults = [.success(page([apiJSON(3), apiJSON(2)], hasMore: true))]

        await sut.load(preferredLanguages: ["fr"])

        XCTAssertEqual(service.listMediaCallCount, 1)
        XCTAssertEqual(sut.snapshot.attachments.map(\.id), ["att-1", "att-2", "att-3"])
    }

    func test_load_incompleteIndex_resumesFromTheOldestKnownCarrier() async {
        let store = InMemoryConversationMediaIndexStore(seed: [carrier(5), carrier(6)], completed: false, fresh: false)
        let (sut, service, _) = makeSUT(store: store)
        service.listMediaResults = [
            .success(page([apiJSON(6), apiJSON(5)], hasMore: true)),
            .success(page([apiJSON(4)], hasMore: false))
        ]

        await sut.load(preferredLanguages: ["fr"])

        XCTAssertEqual(service.listMediaCursors, [nil, "msg-5"])
        XCTAssertEqual(sut.snapshot.attachments.map(\.id), ["att-4", "att-5", "att-6"])
    }

    func test_load_freshCompletedIndex_servesTheCacheWithoutTouchingTheNetwork() async {
        let store = InMemoryConversationMediaIndexStore(seed: [carrier(1)], completed: true, fresh: true)
        let (sut, service, _) = makeSUT(store: store)

        await sut.load(preferredLanguages: ["fr"])

        XCTAssertEqual(service.listMediaCallCount, 0)
        XCTAssertEqual(sut.snapshot.attachments.map(\.id), ["att-1"])
    }

    // MARK: - Dégradation et persistance

    func test_load_serverRejectsTheMediaView_keepsTheCachedIndexWithoutError() async {
        let store = InMemoryConversationMediaIndexStore(seed: [carrier(1)], completed: false, fresh: false)
        let (sut, service, _) = makeSUT(store: store)
        service.listMediaResult = .failure(ViewRejected())
        sut.syncLive([carrier(9)], serverId: { $0 })

        await sut.load(preferredLanguages: ["fr"])

        XCTAssertEqual(sut.snapshot.attachments.map(\.id), ["att-1", "att-9"])
        let completed = await store.completed
        XCTAssertFalse(completed, "un refus n'est pas un épuisement : la remontée reprendra plus tard")
    }

    func test_load_persistsThePages_nextOpeningPaintsThemFromCacheOffline() async {
        let store = InMemoryConversationMediaIndexStore()
        let (first, service, _) = makeSUT(store: store)
        service.listMediaResults = [.success(page([apiJSON(2), apiJSON(1)], hasMore: false))]
        await first.load(preferredLanguages: ["fr"])

        let (second, offline, _) = makeSUT(store: store)
        offline.listMediaResult = .failure(URLError(.notConnectedToInternet))
        await second.load(preferredLanguages: ["fr"])

        XCTAssertEqual(second.snapshot.attachments.map(\.id), ["att-1", "att-2"])
    }

    // MARK: - Ce que la galerie demande d'une pièce

    func test_carrier_ofAnIndexedOnlyPiece_isItsMessage_andIsNotLoaded() async {
        let store = InMemoryConversationMediaIndexStore(seed: [carrier(1)], completed: true, fresh: true)
        let (sut, _, _) = makeSUT(store: store)

        await sut.load(preferredLanguages: ["fr"])

        XCTAssertEqual(sut.snapshot.carrier(ofAttachment: "att-1")?.id, "msg-1")
        XCTAssertFalse(sut.snapshot.isLoaded("att-1"))
        XCTAssertEqual(sut.snapshot.senderInfo["att-1"]?.senderName, "Other")
    }

    func test_load_indexedCaption_descendsThePrismFromThePageTranslations() async {
        let (sut, service, _) = makeSUT()
        let translations = """
        [{"id":"t1","messageId":"msg-1","targetLanguage":"fr","translatedContent":"Bonjour"}]
        """
        service.listMediaResults = [.success(page([apiJSON(1, content: "Hello", translations: translations)], hasMore: false))]

        await sut.load(preferredLanguages: ["fr", "en"])

        XCTAssertEqual(sut.snapshot.captions["att-1"], "Bonjour")
    }

    func test_close_rightAfterOpen_theBackfillNeverReachesTheNetwork() async {
        let (sut, service, _) = makeSUT()
        service.listMediaResult = .success(page([apiJSON(2), apiJSON(1)], hasMore: true))

        sut.open(preferredLanguages: ["fr"])
        sut.close()
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(service.listMediaCallCount, 0)
    }

    func test_open_catalogDroppedMidBackfill_isReleasedAndStopsPaging() async {
        let service = MockMessageService()
        service.listMediaResults = (0..<50).map { index in
            .success(page([apiJSON(2 * index + 1), apiJSON(2 * index)], hasMore: true))
        }
        weak var released: ConversationMediaCatalog?
        do {
            let (sut, _, _) = makeSUT(service: service)
            released = sut
            sut.open(preferredLanguages: ["fr"])
        }

        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertNil(released, "la remontée ne doit pas retenir le catalogue qu'on a quitté")
        XCTAssertLessThan(service.listMediaCallCount, 50)
    }
}

// MARK: - Index en mémoire

actor InMemoryConversationMediaIndexStore: ConversationMediaIndexStoring {
    private var items: [MeeshyMessage]?
    private(set) var completed: Bool
    private var fresh: Bool

    init(seed: [MeeshyMessage]? = nil, completed: Bool = false, fresh: Bool = false) {
        self.items = seed
        self.completed = completed
        self.fresh = fresh
    }

    func load(conversationId: String) async -> CacheResult<[MeeshyMessage]> {
        guard let items else { return .empty }
        return fresh ? .fresh(items, age: 0) : .stale(items, age: 3600)
    }

    func save(_ carriers: [MeeshyMessage], conversationId: String) async {
        items = carriers
        fresh = true
    }

    func isComplete(conversationId: String) async -> Bool { completed }

    func markComplete(_ complete: Bool, conversationId: String) async { completed = complete }
}
