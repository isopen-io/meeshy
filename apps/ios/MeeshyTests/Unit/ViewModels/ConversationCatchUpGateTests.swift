import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// #10830 — une reprise de socket rejouait le rattrapage `listAfter` autant de
/// fois qu'il restait de `ConversationViewModel` en vie pour la conversation
/// (19 requêtes identiques dans la même milliseconde, mesurées en production).
@MainActor
final class ConversationCatchUpGateTests: XCTestCase {

    private let conversationId = "000000000000000000010830"
    private let myUserId = "000000000000000000000099"

    // MARK: - Factory

    private func makeViewModel(service: MockMessageService) throws -> ConversationViewModel {
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(user: MeeshyUser(id: myUserId, username: "me", displayName: "Me"))
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: authManager,
            messageService: service,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(persistence: MessagePersistenceActor(dbWriter: pool))
        )
        sut.start()
        return sut
    }

    private func makeHeldMessage(createdAt: Date) -> Message {
        Message(
            id: "held", conversationId: conversationId, senderId: myUserId, content: "déjà là",
            createdAt: createdAt, updatedAt: createdAt, isMe: true
        )
    }

    private func makePage(id: String, createdAtISO: String) -> MessagesAPIResponse {
        JSONStub.decode("""
        {"success":true,"data":[{"id":"\(id)","conversationId":"\(conversationId)","senderId":"\(myUserId)","content":"neuf","createdAt":"\(createdAtISO)"}],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    private func makeEmptyPage() -> MessagesAPIResponse {
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    // MARK: - N lecteurs, UNE requête

    func test_syncMissedMessages_threeLiveReadersOfOneConversation_sendOneRequest() async throws {
        let service = MockMessageService()
        service.listAfterResult = .success(makeEmptyPage())
        let latch = FlightLatch()
        service.holdListAfter = { await latch.hold() }
        let held = Date(timeIntervalSince1970: 1_760_000_000)
        let readers = try (0..<3).map { _ in try makeViewModel(service: service) }
        readers.forEach { $0.messages = [makeHeldMessage(createdAt: held)] }

        let syncs = readers.map { reader in Task { await reader.syncMissedMessages() } }
        await latch.untilHolding()
        await Task.yield()
        latch.release()
        for sync in syncs { await sync.value }

        XCTAssertEqual(service.listAfterCallCount, 1)
    }

    func test_syncMissedMessages_afterTheFlightLands_asksAgain() async throws {
        let service = MockMessageService()
        service.listAfterResult = .success(makeEmptyPage())
        let reader = try makeViewModel(service: service)
        reader.messages = [makeHeldMessage(createdAt: Date(timeIntervalSince1970: 1_760_000_000))]

        await reader.syncMissedMessages()
        await reader.syncMissedMessages()

        XCTAssertEqual(service.listAfterCallCount, 2)
    }

    // MARK: - Le lecteur parti se tait

    func test_syncMissedMessages_onceTheScreenIsLeft_sendsNothing() async throws {
        let service = MockMessageService()
        service.listAfterResult = .success(makeEmptyPage())
        let reader = try makeViewModel(service: service)
        reader.messages = [makeHeldMessage(createdAt: Date(timeIntervalSince1970: 1_760_000_000))]

        reader.noteScreenLeft()
        await reader.syncMissedMessages()

        XCTAssertEqual(service.listAfterCallCount, 0)
    }

    func test_syncMissedMessages_whenTheScreenComesBack_catchesUpAgain() async throws {
        let service = MockMessageService()
        service.listAfterResult = .success(makeEmptyPage())
        let reader = try makeViewModel(service: service)
        reader.messages = [makeHeldMessage(createdAt: Date(timeIntervalSince1970: 1_760_000_000))]

        reader.noteScreenLeft()
        reader.start()
        await reader.syncMissedMessages()

        XCTAssertEqual(service.listAfterCallCount, 1)
    }

    // MARK: - Le curseur avance

    func test_syncMissedMessages_afterAPageLands_theNextCatchUpStartsFromIt() async throws {
        let service = MockMessageService()
        service.listAfterResults = [makePage(id: "arrived", createdAtISO: "2026-10-16T14:57:08.000Z")]
        service.listAfterResult = .success(makeEmptyPage())
        let reader = try makeViewModel(service: service)
        reader.messages = [makeHeldMessage(createdAt: Date(timeIntervalSince1970: 1_760_000_000))]

        await reader.syncMissedMessages()
        let landed = await MessageStoreObservationHelper.awaitMessage(in: reader) { $0.id == "arrived" }
        XCTAssertNotNil(landed)
        await reader.syncMissedMessages()

        let arrivedAt = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-10-16T14:57:08Z"))
        let cursor = try XCTUnwrap(service.lastListAfterAfter)
        XCTAssertGreaterThan(cursor, arrivedAt.addingTimeInterval(-0.01))
    }

    // MARK: - La porte seule

    /// `depart` gardait l'`ObjectIdentifier` de chaque lecteur parti, sans
    /// jamais l'oublier à sa libération : l'ensemble grossissait d'une entrée par
    /// conversation quittée, et un nouveau modèle alloué à la même adresse
    /// passait pour « parti » — son rattrapage de reconnexion était sauté.
    func test_depart_forgetsReadersOnceReleased() {
        let gate = ConversationCatchUpGate()
        for _ in 0..<50 {
            let gone = NSObject()
            gate.depart(gone)
        }
        let stillHere = NSObject()
        gate.depart(stillHere)
        XCTAssertEqual(gate.departedCount, 1, "seul le lecteur encore vivant reste marqué parti")
        XCTAssertFalse(gate.isPresent(stillHere))
        gate.arrive(stillHere)
        XCTAssertTrue(gate.isPresent(stillHere))
        XCTAssertEqual(gate.departedCount, 0)
    }

    func test_isPresent_aFreshReaderNeverDeparted_isPresent() {
        let gate = ConversationCatchUpGate()
        XCTAssertTrue(gate.isPresent(NSObject()))
    }

    func test_pages_aCursorOlderThanTheFlight_isNotJoined() async throws {
        let gate = ConversationCatchUpGate()
        var fetches = 0
        let latch = FlightLatch()
        let recent = Date(timeIntervalSince1970: 1_760_000_100)
        let older = Date(timeIntervalSince1970: 1_760_000_000)

        let first = Task {
            try await gate.pages(conversationId: "c", after: recent) {
                fetches += 1
                await latch.hold()
                return []
            }
        }
        await latch.untilHolding()
        _ = try await gate.pages(conversationId: "c", after: older) {
            fetches += 1
            return []
        }
        latch.release()
        _ = try await first.value

        XCTAssertEqual(fetches, 2)
    }

    func test_pages_twoConversations_doNotShareAFlight() async throws {
        let gate = ConversationCatchUpGate()
        let latch = FlightLatch()
        let cursor = Date(timeIntervalSince1970: 1_760_000_000)
        var fetched: [String] = []

        let first = Task {
            try await gate.pages(conversationId: "a", after: cursor) {
                fetched.append("a")
                await latch.hold()
                return []
            }
        }
        await latch.untilHolding()
        _ = try await gate.pages(conversationId: "b", after: cursor) {
            fetched.append("b")
            return []
        }
        latch.release()
        _ = try await first.value

        XCTAssertEqual(fetched, ["a", "b"])
    }
}

@MainActor
private final class FlightLatch {
    private var held: CheckedContinuation<Void, Never>?
    private var arrival: CheckedContinuation<Void, Never>?
    private var used = false
    private var isHolding = false

    nonisolated deinit {}

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
