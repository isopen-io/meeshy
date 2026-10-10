import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// #9929 — Global se lit sans s'écrire avant 18 ans. Un envoi refusé par un
/// 403 `GLOBAL_ADULTS_ONLY` est DÉFINITIF : ni repli socket, ni file de
/// re-tentative, la bulle optimiste disparaît et le composeur cède la place au
/// bandeau de lecture seule.
@MainActor
final class ConversationViewModelWriteRestrictionTests: XCTestCase {

    private let conversationId = "00000000000000000000cd01"
    private let userId = "00000000000000000000cd99"

    private struct Fixture {
        let sut: ConversationViewModel
        let messageService: MockMessageService
        let messageSocket: MockMessageSocket
        let offlineQueue: FakeOfflineMessageQueue
        let pool: DatabaseQueue
    }

    override func setUp() async throws {
        try await super.setUp()
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        APIClient.shared.anonymousSessionToken = nil
        try await super.tearDown()
    }

    private func makeFixture(restSendFailure: Error? = nil) async throws -> Fixture {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "minor", displayName: "Minor"))
        let messageService = MockMessageService()
        if let restSendFailure {
            messageService.sendResult = .failure(restSendFailure)
        }
        let messageSocket = MockMessageSocket()
        let offlineQueue = FakeOfflineMessageQueue()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        MessageSocketManager.shared.isConnected = true
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: messageSocket,
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: offlineQueue
        )
        sut.start()
        return Fixture(sut: sut, messageService: messageService, messageSocket: messageSocket,
                       offlineQueue: offlineQueue, pool: pool)
    }

    private var globalAdultsOnly: MeeshyError {
        .forbidden(reason: "Global", body: Data(#"{"success":false,"error":"Global","code":"GLOBAL_ADULTS_ONLY"}"#.utf8))
    }

    private func storedMessageCount(in pool: DatabaseQueue) throws -> Int {
        try pool.read { db in try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM messages") ?? 0 }
    }

    // MARK: - Le refus d'envoi

    func test_sendMessage_globalAdultsOnly_learnsTheRestriction() async throws {
        let fx = try await makeFixture(restSendFailure: globalAdultsOnly)

        let sent = await fx.sut.sendMessage(content: "Salut Global")

        XCTAssertFalse(sent)
        XCTAssertEqual(fx.sut.learnedWriteRestriction, .minorGlobal)
        XCTAssertEqual(fx.sut.writeRestriction(served: nil), .minorGlobal)
    }

    func test_sendMessage_globalAdultsOnly_withdrawsTheOptimisticMessage() async throws {
        let fx = try await makeFixture(restSendFailure: globalAdultsOnly)

        _ = await fx.sut.sendMessage(content: "Salut Global")

        XCTAssertEqual(try storedMessageCount(in: fx.pool), 0)
    }

    func test_sendMessage_globalAdultsOnly_neitherFallsBackNorQueues() async throws {
        let fx = try await makeFixture(restSendFailure: globalAdultsOnly)

        _ = await fx.sut.sendMessage(content: "Salut Global")

        XCTAssertEqual(fx.messageSocket.sendViaSocketFallbackCallCount, 0)
        let queued = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(queued, 0)
    }

    func test_sendMessage_otherForbidden_learnsNoRestriction() async throws {
        let fx = try await makeFixture(restSendFailure: MeeshyError.forbidden(reason: nil, body: Data(#"{"code":"FORBIDDEN"}"#.utf8)))

        _ = await fx.sut.sendMessage(content: "Salut")

        XCTAssertNil(fx.sut.learnedWriteRestriction)
    }

    // MARK: - Ce que la vue lit

    func test_writeRestriction_servedMinorGlobal_closesTheComposer() async throws {
        let fx = try await makeFixture()

        XCTAssertEqual(fx.sut.writeRestriction(served: .minorGlobal), .minorGlobal)
    }

    func test_writeRestriction_servedUnknown_keepsTheComposer() async throws {
        let fx = try await makeFixture()

        XCTAssertNil(fx.sut.writeRestriction(served: .unknown("future-rule")))
        XCTAssertNil(fx.sut.writeRestriction(served: nil))
    }
}
