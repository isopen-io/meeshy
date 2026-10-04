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
    private func jump(_ sut: ConversationViewModel, _ service: MockMessageService, hasNewer: Bool) async {
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

    func test_conversationView_nearingBottom_asksForNewerPage() throws {
        XCTAssertTrue(try viewSource("ConversationView.swift").contains("await viewModel.loadNewerMessages()"),
                      "L'approche du bas d'une fenêtre sautée demande la page plus récente")
    }

    func test_scrollToBottomButton_receivesNewerPageLoading() throws {
        XCTAssertTrue(try viewSource("ConversationView+ScrollIndicators.swift").contains("isLoadingNewer: viewModel.isLoadingNewer"),
                      "Le bouton « revenir en bas » dit la page plus récente en vol")
    }
}
