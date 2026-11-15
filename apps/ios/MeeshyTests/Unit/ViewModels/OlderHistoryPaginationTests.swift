import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// #16471 — une remontée rapide ne bute plus sur le réseau quand l'historique
/// est déjà sur disque : la page GRDB se sert sans attendre la page REST, et un
/// seul appel réseau vole à la fois.
@MainActor
final class OlderHistoryPaginationTests: XCTestCase {

    private let conversationId = "000000000000000000000001"
    private let userId = "000000000000000000000099"

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        APIClient.shared.anonymousSessionToken = nil
        try await super.tearDown()
    }

    private func makeSUT(cachedCount: Int) async throws -> (sut: ConversationViewModel, service: MockMessageService, gate: NetworkGate) {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let base = Date().addingTimeInterval(-86_400)
        let conversationId = conversationId
        let userId = userId
        let records: [MessageRecord] = (0..<cachedCount).map { i in
            var record = MessageStoreObservationHelper.makeRecord(
                localId: "cached-\(i)", conversationId: conversationId, senderId: userId,
                content: "msg \(i)", state: .sent, createdAt: base.addingTimeInterval(Double(i))
            )
            record.cachedTimeString = MessageRecord.computeTimeString(for: record.createdAt)
            return record
        }
        try await pool.write { db in for record in records { try record.insert(db) } }

        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "me", displayName: "Me"))
        let service = MockMessageService()
        let gate = NetworkGate()
        service.listBeforeGate = { await gate.wait() }
        let sut = ConversationViewModel(
            conversationId: conversationId, unreadCount: 0, isDirect: false, participantUserId: nil,
            anonymousSession: nil, authManager: auth, messageService: service,
            conversationService: MockConversationService(), reactionService: MockReactionService(),
            reportService: MockReportService(), messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(persistence: MessagePersistenceActor(dbWriter: pool))
        )
        sut.start()
        await sut.loadMessages()
        _ = await MessageStoreObservationHelper.awaitMessagesCount(equals: min(cachedCount, 200), in: sut)
        sut.hasOlderMessages = true
        return (sut, service, gate)
    }

    /// La page GRDB servie libère la pagination sans attendre la requête réseau qu'elle a lancée.
    private func serveFirstCachedPage(_ sut: ConversationViewModel, expecting count: Int) async -> Task<Void, Never> {
        let first = Task { await sut.loadOlderMessages() }
        let served = await MessageStoreObservationHelper.awaitMessagesCount(equals: count, in: sut)
        XCTAssertTrue(served, "la page GRDB se sert sans attendre le réseau")
        let released = await MessageStoreObservationHelper.awaitCondition(timeout: 1.0) { !sut.isLoadingOlder }
        XCTAssertTrue(released, "une page servie depuis le cache libère la pagination pendant que le réseau vole")
        sut.lastOlderPaginationTime = .distantPast
        return first
    }

    func test_loadOlder_withASlowNetworkAndARichCache_servesTwoCachedPagesBeforeTheFirstRequestReturns() async throws {
        let (sut, service, gate) = try await makeSUT(cachedCount: 300)
        let first = await serveFirstCachedPage(sut, expecting: 250)

        await sut.loadOlderMessages()

        let served = await MessageStoreObservationHelper.awaitMessagesCount(equals: 300, in: sut)
        XCTAssertTrue(served, "deux pages GRDB doivent être servies pendant que la première requête réseau vole encore")
        XCTAssertEqual(service.listBeforeCallCount, 1, "un seul appel réseau vole à la fois")
        await gate.release()
        await first.value
    }

    func test_loadOlder_whenTheCacheIsExhausted_awaitsTheRequestInFlightWithoutStartingAnother() async throws {
        let (sut, service, gate) = try await makeSUT(cachedCount: 250)
        let first = await serveFirstCachedPage(sut, expecting: 250)

        let second = Task { await sut.loadOlderMessages() }
        let waiting = await MessageStoreObservationHelper.awaitCondition(timeout: 1.0) { sut.isLoadingOlder }
        XCTAssertTrue(waiting, "le cache épuisé, la page suivante attend la requête en vol")
        XCTAssertEqual(service.listBeforeCallCount, 1, "attendre la requête en vol, jamais en lancer une seconde")

        await gate.release()
        await second.value
        await first.value
        XCTAssertFalse(sut.isLoadingOlder)
    }
}

actor NetworkGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        guard !isOpen else { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func release() {
        isOpen = true
        waiters.forEach { $0.resume() }
        waiters = []
    }
}
