import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

// MARK: - La page plus récente d'une fenêtre sautée (#9304)

/// Jumelle iOS de #7420 / #9302 (web). Une fenêtre sautée (citation tapée,
/// favori, mini-lecteur) ne rejoignait jamais le présent par le bas :
/// `isLoadingNewer` était déclaré et jamais posé, aucune page `after` n'était
/// demandée. Le fil demande désormais la page plus récente à l'approche du
/// bas, l'annonce pendant qu'elle est en vol, et la fenêtre s'arrête au bord
/// que le SERVEUR a servi d'un seul tenant — jamais sur des lignes plus
/// récentes du cache séparées d'elle par un trou.
@MainActor
final class JumpedWindowNewerPageTests: XCTestCase {

    private let conversationId = "000000000000000000000001"
    private let otherUserId = "000000000000000000000002"

    override func setUp() async throws {
        try await super.setUp()
        MessageSocketManager.shared.isConnected = false
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        APIClient.shared.anonymousSessionToken = nil
        try await super.tearDown()
    }

    // MARK: - Fabriques

    private func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    private func makeSUT() -> (sut: ConversationViewModel, service: MockMessageService) {
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(user: MeeshyUser(id: "000000000000000000000099", username: "me", displayName: "Me"))
        let service = MockMessageService()
        let pool = try! makeInMemoryPool()
        let sut = ConversationViewModel(
            conversationId: conversationId,
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: authManager,
            messageService: service,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool))
        )
        sut.start()
        return (sut, service)
    }

    private func response(
        _ rows: [(id: String, createdAt: String)],
        hasMore: Bool,
        hasNewer: Bool?
    ) -> MessagesAPIResponse {
        let data = rows.map {
            """
            {"id":"\($0.id)","conversationId":"\(conversationId)","senderId":"\(otherUserId)","content":"m","createdAt":"\($0.createdAt)"}
            """
        }.joined(separator: ",")
        let newer = hasNewer.map { "\($0)" } ?? "null"
        return JSONStub.decode("""
        {"success":true,"data":[\(data)],"pagination":null,"cursorPagination":{"hasMore":\(hasMore),"nextCursor":null,"limit":30},"hasNewer":\(newer)}
        """)
    }

    private func isoDate(_ string: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: string)!
    }

    /// Fenêtre sautée autour de `m-2`, le plus récent servi étant `m-3`.
    /// `atBottom` est le dernier état « en bas » connu de la liste à l'arrivée :
    /// faux par défaut, pour que seuls les témoins de #9360 voient l'atterrissage
    /// au bas lancer la chaîne.
    private func jump(_ sut: ConversationViewModel, _ service: MockMessageService, hasNewer: Bool, atBottom: Bool = false) async {
        sut.noteNearBottom(atBottom)
        service.listAroundResult = .success(response([
            ("m-1", "2026-03-01T10:00:00.000Z"),
            ("m-2", "2026-03-01T10:01:00.000Z"),
            ("m-3", "2026-03-01T10:02:00.000Z"),
        ], hasMore: true, hasNewer: hasNewer))
        await sut.loadMessagesAround(messageId: "m-2")
    }

    // MARK: - Le modèle

    func test_loadNewerMessages_notInJumpedState_doesNotFetch() async {
        let (sut, service) = makeSUT()

        await sut.loadNewerMessages()

        XCTAssertEqual(service.listAfterCallCount, 0)
        XCTAssertFalse(sut.isLoadingNewer)
    }

    func test_loadNewerMessages_jumpedWindowAtPresent_doesNotFetch() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: false)

        await sut.loadNewerMessages()

        XCTAssertEqual(service.listAfterCallCount, 0, "Le serveur a dit qu'il n'y a rien de plus récent")
    }

    func test_loadNewerMessages_jumpedWithNewer_fetchesAfterNewestServedMessage() async throws {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResult = .success(response([("m-4", "2026-03-01T10:03:00.000Z")], hasMore: true, hasNewer: nil))

        await sut.loadNewerMessages()

        XCTAssertEqual(service.listAfterCallCount, 1)
        let after = try XCTUnwrap(service.lastListAfterAfter)
        let newestServed = isoDate("2026-03-01T10:02:00.000Z")
        XCTAssertLessThanOrEqual(after, newestServed)
        XCTAssertGreaterThan(after, newestServed.addingTimeInterval(-0.01),
                             "Le filigrane est le plus récent message SERVI de la fenêtre")
        XCTAssertTrue(sut.hasNewerMessages, "hasMore ⇒ il reste une page plus récente")
    }

    func test_loadNewerMessages_whileInFlight_isLoadingNewerThenCleared() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResult = .success(response([("m-4", "2026-03-01T10:03:00.000Z")], hasMore: false, hasNewer: nil))
        var inFlight: Bool?
        service.onListAfter = { inFlight = sut.isLoadingNewer }

        await sut.loadNewerMessages()

        XCTAssertEqual(inFlight, true, "La page plus récente en vol se dit en chargement")
        XCTAssertFalse(sut.isLoadingNewer, "Servie, elle revient à l'état ordinaire")
    }

    func test_loadNewerMessages_lastPage_reachesPresent() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResult = .success(response([("m-4", "2026-03-01T10:03:00.000Z")], hasMore: false, hasNewer: nil))

        await sut.loadNewerMessages()

        XCTAssertFalse(sut.hasNewerMessages)
        XCTAssertEqual(sut.messageStore.jumpedNewerEdge, .present)
    }

    func test_loadNewerMessages_watermarkStagnates_stopsAskingForNewer() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResult = .success(response([("m-3", "2026-03-01T10:02:00.000Z")], hasMore: true, hasNewer: nil))

        await sut.loadNewerMessages()

        XCTAssertFalse(sut.hasNewerMessages, "Une page qui n'avance pas le filigrane ne relance jamais la même demande")
    }

    func test_loadNewerMessages_failure_clearsLoadingAndKeepsNewer() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResult = .failure(URLError(.notConnectedToInternet))

        await sut.loadNewerMessages()

        XCTAssertFalse(sut.isLoadingNewer)
        XCTAssertTrue(sut.hasNewerMessages, "Un échec réseau laisse la page à redemander")
    }

    func test_returnToLatest_resetsNewerEdge() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)

        await sut.returnToLatest()

        XCTAssertEqual(sut.messageStore.jumpedNewerEdge, .halfWindow)
    }

    // MARK: - La chaîne des pages plus récentes (#9339)

    /// Les pages `after` successives : `m-4` (il en reste), puis `m-5` (le présent).
    private func twoShortPages() -> [MessagesAPIResponse] {
        [
            response([("m-4", "2026-03-01T10:03:00.000Z")], hasMore: true, hasNewer: nil),
            response([("m-5", "2026-03-01T10:04:00.000Z")], hasMore: false, hasNewer: nil),
        ]
    }

    func test_noteNearBottom_atBottomAfterShortPage_chainsNextPageUntilPresent() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResults = twoShortPages()

        sut.noteNearBottom(true)
        await sut.newerPagesChain?.value

        XCTAssertEqual(service.listAfterCallCount, 2,
                       "Une page courte laissant le bas visible enchaîne la suivante sans redéfiler")
        XCTAssertFalse(sut.hasNewerMessages)
        XCTAssertEqual(sut.messageStore.jumpedNewerEdge, .present)
        XCTAssertNil(sut.newerPagesChain, "La chaîne finie libère sa place")
    }

    func test_noteNearBottom_pageDoesNotAdvance_stopsTheChain() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResult = .success(response([("m-3", "2026-03-01T10:02:00.000Z")], hasMore: true, hasNewer: nil))

        sut.noteNearBottom(true)
        await sut.newerPagesChain?.value

        XCTAssertEqual(service.listAfterCallCount, 1, "Une page qui n'avance pas le curseur arrête la chaîne")
    }

    func test_noteNearBottom_failure_stopsTheChain() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResult = .failure(URLError(.notConnectedToInternet))

        sut.noteNearBottom(true)
        await sut.newerPagesChain?.value

        XCTAssertEqual(service.listAfterCallCount, 1, "Un échec ne boucle pas sur la même demande")
        XCTAssertTrue(sut.hasNewerMessages)
    }

    func test_noteNearBottom_calledTwice_keepsOneRequestInFlight() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResults = twoShortPages()
        var maxInFlight = 0
        var inFlight = 0
        service.onListAfter = {
            inFlight += 1
            maxInFlight = max(maxInFlight, inFlight)
            inFlight -= 1
        }

        sut.noteNearBottom(true)
        let first = sut.newerPagesChain
        sut.noteNearBottom(true)

        XCTAssertNotNil(first)
        XCTAssertTrue(sut.newerPagesChain == first, "Un second signal « en bas » ne lance pas de seconde chaîne")
        await first?.value
        XCTAssertEqual(service.listAfterCallCount, 2)
        XCTAssertEqual(maxInFlight, 1)
    }

    func test_noteNearBottom_readerLeavesBottom_cancelsTheChain() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResults = twoShortPages()
        service.onListAfter = { sut.noteNearBottom(false) }
        sut.noteNearBottom(true)
        let chain = sut.newerPagesChain

        await chain?.value

        XCTAssertEqual(service.listAfterCallCount, 1, "Quitter le bas arrête la chaîne")
        XCTAssertNil(sut.newerPagesChain)
        XCTAssertFalse(sut.isCurrentlyNearBottom)
    }

    func test_noteNearBottom_awayFromBottom_doesNotFetch() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResults = twoShortPages()

        sut.noteNearBottom(false)
        await sut.newerPagesChain?.value

        XCTAssertEqual(service.listAfterCallCount, 0)
        XCTAssertNil(sut.newerPagesChain)
    }

    func test_noteNearBottom_latestWindow_doesNotStartAChain() async {
        let (sut, service) = makeSUT()

        sut.noteNearBottom(true)

        XCTAssertNil(sut.newerPagesChain, "Hors fenêtre sautée, rien à enchaîner")
        XCTAssertEqual(service.listAfterCallCount, 0)
    }

    func test_returnToLatest_cancelsTheChain() async {
        let (sut, service) = makeSUT()
        await jump(sut, service, hasNewer: true)
        service.listAfterResults = twoShortPages()
        service.onListAfter = { Task { await sut.returnToLatest() } }
        sut.noteNearBottom(true)
        let chain = sut.newerPagesChain

        await chain?.value

        XCTAssertLessThanOrEqual(service.listAfterCallCount, 1, "Revenir au présent arrête la chaîne")
    }

    // MARK: - L'atterrissage d'un saut au bas d'une fenêtre courte (#9360)

    func test_jumpLanding_atBottomWithNewer_startsTheChainUntilPresent() async {
        let (sut, service) = makeSUT()
        service.listAfterResults = twoShortPages()

        await jump(sut, service, hasNewer: true, atBottom: true)
        await sut.newerPagesChain?.value

        XCTAssertEqual(service.listAfterCallCount, 2,
                       "Une fenêtre courte qui tient à l'écran rejoint le présent sans attendre un défilement")
        XCTAssertFalse(sut.hasNewerMessages)
        XCTAssertEqual(sut.messageStore.jumpedNewerEdge, .present)
        XCTAssertNil(sut.newerPagesChain, "La chaîne finie libère sa place")
    }

    func test_jumpToQuotedMessage_landingAtBottomWithNewer_startsTheChain() async {
        let (sut, service) = makeSUT()
        sut.noteNearBottom(true)
        service.listAroundResult = .success(response([
            ("m-1", "2026-03-01T10:00:00.000Z"),
            ("m-2", "2026-03-01T10:01:00.000Z"),
            ("m-3", "2026-03-01T10:02:00.000Z"),
        ], hasMore: true, hasNewer: true))
        service.listAfterResults = twoShortPages()

        let result = await sut.jumpToQuotedMessage(messageId: "m-2")
        await sut.newerPagesChain?.value

        XCTAssertEqual(result, .loadedFromServer)
        XCTAssertEqual(service.listAfterCallCount, 2, "La citation tapée suit la même règle que le saut")
        XCTAssertEqual(sut.messageStore.jumpedNewerEdge, .present)
    }

    func test_jumpLanding_awayFromBottom_doesNotStartTheChain() async {
        let (sut, service) = makeSUT()
        service.listAfterResults = twoShortPages()

        await jump(sut, service, hasNewer: true, atBottom: false)
        await sut.newerPagesChain?.value

        XCTAssertNil(sut.newerPagesChain)
        XCTAssertEqual(service.listAfterCallCount, 0, "Loin du bas, rien ne part avant que le lecteur y arrive")
    }

    func test_jumpLanding_atBottomOnPresent_doesNotStartTheChain() async {
        let (sut, service) = makeSUT()
        service.listAfterResults = twoShortPages()

        await jump(sut, service, hasNewer: false, atBottom: true)
        await sut.newerPagesChain?.value

        XCTAssertNil(sut.newerPagesChain)
        XCTAssertEqual(service.listAfterCallCount, 0, "Le serveur n'annonce rien de plus récent")
    }

    func test_jumpLanding_atBottom_thenBottomSignal_keepsOneChain() async {
        let (sut, service) = makeSUT()
        service.listAfterResults = twoShortPages()
        var maxInFlight = 0
        var inFlight = 0
        service.onListAfter = {
            inFlight += 1
            maxInFlight = max(maxInFlight, inFlight)
            inFlight -= 1
        }

        await jump(sut, service, hasNewer: true, atBottom: true)
        let landed = sut.newerPagesChain
        sut.noteNearBottom(true)

        XCTAssertNotNil(landed, "L'atterrissage au bas lance la chaîne")
        XCTAssertTrue(sut.newerPagesChain == landed, "Le signal « en bas » qui suit ne double pas la chaîne")
        await landed?.value
        XCTAssertEqual(service.listAfterCallCount, 2)
        XCTAssertEqual(maxInFlight, 1)
    }

    func test_jumpLanding_atBottom_readerLeavesBottom_cancelsTheChain() async {
        let (sut, service) = makeSUT()
        service.listAfterResults = twoShortPages()
        service.onListAfter = { sut.noteNearBottom(false) }

        await jump(sut, service, hasNewer: true, atBottom: true)
        await sut.newerPagesChain?.value

        XCTAssertEqual(service.listAfterCallCount, 1, "Quitter le bas arrête la chaîne lancée à l'atterrissage")
        XCTAssertNil(sut.newerPagesChain)
    }

    func test_jumpLanding_atBottom_pageDoesNotAdvance_stopsTheChain() async {
        let (sut, service) = makeSUT()
        service.listAfterResult = .success(response([("m-3", "2026-03-01T10:02:00.000Z")], hasMore: true, hasNewer: nil))

        await jump(sut, service, hasNewer: true, atBottom: true)
        await sut.newerPagesChain?.value

        XCTAssertEqual(service.listAfterCallCount, 1, "Une page qui n'avance pas arrête la chaîne")
    }

    // MARK: - Un nouveau saut et la chaîne du précédent (#9364)

    /// Second saut, plus loin dans le fil : `m-10`…`m-12`, le plus récent
    /// servi étant `m-12` (11:02).
    private func jumpAgain(_ sut: ConversationViewModel, _ service: MockMessageService, atBottom: Bool) async {
        sut.noteNearBottom(atBottom)
        service.listAroundResult = .success(response([
            ("m-10", "2026-03-01T11:00:00.000Z"),
            ("m-11", "2026-03-01T11:01:00.000Z"),
            ("m-12", "2026-03-01T11:02:00.000Z"),
        ], hasMore: true, hasNewer: true))
        await sut.loadMessagesAround(messageId: "m-11")
    }

    func test_secondJump_whileFirstChainInFlight_cancelsItAndStartsItsOwn() async {
        let (sut, service) = makeSUT()
        let gate = PageGate()
        service.holdListAfter = { await gate.hold() }
        service.listAfterResults = [
            response([("m-4", "2026-03-01T10:03:00.000Z")], hasMore: true, hasNewer: nil),
            response([("m-13", "2026-03-01T11:03:00.000Z")], hasMore: false, hasNewer: nil),
        ]
        await jump(sut, service, hasNewer: true, atBottom: true)
        let firstChain = sut.newerPagesChain
        await gate.untilHolding()

        await jumpAgain(sut, service, atBottom: true)
        let secondChain = sut.newerPagesChain

        XCTAssertNotNil(firstChain)
        XCTAssertEqual(firstChain?.isCancelled, true, "Le nouveau saut arrête la chaîne de l'ancienne fenêtre")
        XCTAssertNotNil(secondChain, "La nouvelle fenêtre au bas lance sa propre chaîne")
        XCTAssertFalse(secondChain == firstChain, "Une seule chaîne vivante : celle de la fenêtre courante")
        if secondChain != firstChain { await secondChain?.value }
        gate.release()
        await firstChain?.value

        XCTAssertEqual(service.listAfterCallCount, 2, "La page en vol de l'ancienne chaîne n'en appelle pas d'autre")
        let after = service.lastListAfterAfter.map { $0.timeIntervalSince(isoDate("2026-03-01T11:02:00.000Z")) }
        XCTAssertEqual(after ?? -1, 0, accuracy: 0.01, "La nouvelle chaîne part du bord de la NOUVELLE fenêtre")
        XCTAssertEqual(sut.messageStore.jumpedNewerEdge, .present)
        XCTAssertFalse(sut.hasNewerMessages)
        XCTAssertFalse(sut.isLoadingNewer)
    }

    func test_pageOfPreviousWindow_landingAfterSecondJump_doesNotExtendTheNewWindow() async {
        let (sut, service) = makeSUT()
        let gate = PageGate()
        service.holdListAfter = { await gate.hold() }
        service.listAfterResult = .success(response([("m-4", "2026-03-01T10:03:00.000Z")], hasMore: false, hasNewer: nil))
        await jump(sut, service, hasNewer: true)
        let firstPage = Task { await sut.loadNewerMessages() }
        await gate.untilHolding()

        await jumpAgain(sut, service, atBottom: false)
        gate.release()
        await firstPage.value

        XCTAssertEqual(sut.messageStore.jumpedNewerEdge, .through(isoDate("2026-03-01T11:02:00.000Z")),
                       "Une page partie pour l'ancienne fenêtre n'en recule pas le bord")
        XCTAssertTrue(sut.hasNewerMessages, "Le présent annoncé par l'ancienne page ne vaut pas pour la nouvelle fenêtre")
        XCTAssertFalse(sut.isLoadingNewer)
    }

    func test_newWindow_pageInFlightForPreviousWindow_doesNotBlockItsOwnPage() async {
        let (sut, service) = makeSUT()
        let gate = PageGate()
        service.holdListAfter = { await gate.hold() }
        service.listAfterResults = [
            response([("m-4", "2026-03-01T10:03:00.000Z")], hasMore: true, hasNewer: nil),
            response([("m-13", "2026-03-01T11:03:00.000Z")], hasMore: true, hasNewer: nil),
        ]
        await jump(sut, service, hasNewer: true)
        let firstPage = Task { await sut.loadNewerMessages() }
        await gate.untilHolding()
        await jumpAgain(sut, service, atBottom: false)

        await sut.loadNewerMessages()

        XCTAssertEqual(service.listAfterCallCount, 2, "La page de la nouvelle fenêtre part sans attendre celle de l'ancienne")
        XCTAssertEqual(sut.messageStore.jumpedNewerEdge, .through(isoDate("2026-03-01T11:03:00.000Z")))
        gate.release()
        await firstPage.value
        XCTAssertEqual(sut.messageStore.jumpedNewerEdge, .through(isoDate("2026-03-01T11:03:00.000Z")))
        XCTAssertFalse(sut.isLoadingNewer)
    }

    // MARK: - La fenêtre du store

    private func seededStore() async throws -> (store: MessageStore, center: Date) {
        let db = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: db)
        let store = MessageStore(conversationId: "conv-edge", persistence: persistence)
        let center = Date(timeIntervalSince1970: 1_700_000_000)
        let offsets: [(String, TimeInterval)] = [("c", 0), ("n1", 60), ("n2", 120), ("latest", 86_400)]
        for (id, offset) in offsets {
            try await MessageStoreObservationHelper.insertRecord(
                MessageStoreObservationHelper.makeRecord(
                    localId: id, conversationId: "conv-edge", createdAt: center.addingTimeInterval(offset)
                ),
                into: persistence
            )
        }
        return (store, center)
    }

    func test_loadWindow_throughEdge_stopsAtServedEdge() async throws {
        let (store, center) = try await seededStore()

        await store.loadWindow(around: center, newerEdge: .through(center.addingTimeInterval(120)))

        XCTAssertEqual(store.messages.map(\.localId), ["c", "n1", "n2"],
                       "Une ligne du cache séparée de la fenêtre par un trou n'y entre pas en silence")
    }

    func test_extendJumpedWindow_toPresent_joinsNewestRows() async throws {
        let (store, center) = try await seededStore()
        await store.loadWindow(around: center, newerEdge: .through(center.addingTimeInterval(60)))

        await store.extendJumpedWindow(to: .present)

        XCTAssertEqual(store.messages.map(\.localId), ["c", "n1", "n2", "latest"])
    }

    func test_extendJumpedWindow_inLatestMode_isIgnored() async throws {
        let (store, _) = try await seededStore()

        await store.extendJumpedWindow(to: .present)

        XCTAssertEqual(store.windowMode, .latest)
        XCTAssertEqual(store.jumpedNewerEdge, .halfWindow)
    }

    // MARK: - Le fil et le bouton

    private func viewSource(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // ViewModels/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/\(name)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_conversationView_nearingBottom_handsTheSignalToTheModel() throws {
        XCTAssertTrue(try viewSource("ConversationView.swift").contains("viewModel.noteNearBottom(nearBottom)"),
                      "L'état « en bas » va au modèle, qui enchaîne les pages plus récentes")
    }

    func test_scrollToBottomButton_receivesNewerPageLoading() throws {
        XCTAssertTrue(try viewSource("ConversationView+ScrollIndicators.swift").contains("isLoadingNewer: viewModel.isLoadingNewer"),
                      "Le bouton « revenir en bas » dit la page plus récente en vol")
    }
}

/// Retient UNE page `listAfter` en vol jusqu'à `release()` : le témoin rejoue
/// un saut pendant qu'elle est partie (#9364).
@MainActor
private final class PageGate {
    private var held: CheckedContinuation<Void, Never>?
    private var arrival: CheckedContinuation<Void, Never>?
    private var used = false
    private var isHolding = false

    func hold() async {
        guard !used else { return }
        used = true
        isHolding = true
        arrival?.resume()
        arrival = nil
        await withCheckedContinuation { held = $0 }
    }

    func untilHolding() async {
        guard !isHolding else { return }
        await withCheckedContinuation { arrival = $0 }
    }

    func release() {
        isHolding = false
        held?.resume()
        held = nil
    }
}
