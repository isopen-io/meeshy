import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationViewModelSendCoordinatorTests: XCTestCase {

    private let conversationId = "00000000000000000000ce01"
    private let userId = "00000000000000000000ce99"

    private struct Fixture {
        let sut: ConversationViewModel
        let coordinator: MockConversationSendCoordinator
        let messageService: MockMessageService
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

    private func makeFixture(
        isOnline: Bool = true,
        injectCoordinator: Bool = true
    ) async throws -> Fixture {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "coord", displayName: "Coord"))
        let messageService = MockMessageService()
        let coordinator = MockConversationSendCoordinator()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        MessageSocketManager.shared.isConnected = false
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: isOnline),
            offlineQueue: FakeOfflineMessageQueue(),
            sendCoordinator: injectCoordinator ? coordinator : nil
        )
        sut.start()
        return Fixture(sut: sut, coordinator: coordinator, messageService: messageService, pool: pool)
    }

    private func makeOutgoing(clientMessageId: String = "cid_fixed", protection: MessageProtectionIntent? = nil) -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID(conversationId),
            content: "Bonjour",
            relation: .none,
            attachments: .none,
            protection: protection,
            reusedClientMessageId: MessageID(clientMessageId)
        )
    }

    private func acknowledgedReceipt(_ clientMessageId: String = "cid_fixed") -> SentMessageReceipt {
        SentMessageReceipt(
            clientMessageId: MessageID(clientMessageId),
            delivery: .acknowledged(serverId: MessageID("srv_1"), at: Date(timeIntervalSince1970: 100), via: .rest)
        )
    }

    func test_send_online_delegatesTransportToInjectedCoordinator() async throws {
        let fx = try await makeFixture()
        fx.coordinator.emitResult = .success(acknowledgedReceipt())

        let result = await fx.sut.send(makeOutgoing())

        guard case .success = result else { return XCTFail("un succès était attendu") }
        XCTAssertEqual(fx.coordinator.emitCalls.count, 1)
        XCTAssertEqual(fx.coordinator.acknowledged, ["cid_fixed"])
        XCTAssertEqual(fx.sut.pendingServerIds["cid_fixed"], "srv_1")
    }

    func test_send_transportFailsAndFallbackMisses_recordsFailureThenQueuesForRetry() async throws {
        let fx = try await makeFixture()
        fx.coordinator.emitResult = .failure(URLError(.notConnectedToInternet))
        fx.coordinator.fallbackResult = nil

        let result = await fx.sut.send(makeOutgoing())

        XCTAssertEqual(fx.coordinator.callLog, ["emit", "emitSocketFallback", "recordFailure", "enqueueForRetry"])
        guard case .failure(.queuedForRetry) = result else { return XCTFail("`.queuedForRetry` était attendu") }
    }

    func test_send_transportFailsAndFallbackAcks_acknowledgesAfterPendingServerIdIsSet() async throws {
        let fx = try await makeFixture()
        fx.coordinator.emitResult = .failure(URLError(.timedOut))
        fx.coordinator.fallbackResult = SentMessageReceipt(
            clientMessageId: MessageID("cid_fixed"),
            delivery: .acknowledged(serverId: MessageID("srv_fb"), at: Date(timeIntervalSince1970: 100), via: .socketFallback)
        )

        let result = await fx.sut.send(makeOutgoing())

        guard case .success = result else { return XCTFail("un succès était attendu") }
        XCTAssertEqual(fx.sut.pendingServerIds["cid_fixed"], "srv_fb")
        XCTAssertEqual(fx.coordinator.callLog, ["emit", "emitSocketFallback", "acknowledge"])
        XCTAssertEqual(fx.coordinator.acknowledged, ["cid_fixed"])
    }

    func test_send_writeRestrictedRefusal_neitherFallsBackNorQueues() async throws {
        let fx = try await makeFixture()
        fx.coordinator.emitResult = .failure(MeeshyError.forbidden(
            reason: "Global",
            body: Data(#"{"success":false,"error":"Global","code":"GLOBAL_ADULTS_ONLY"}"#.utf8)
        ))

        let result = await fx.sut.send(makeOutgoing(clientMessageId: "cid_wr"))

        guard case .failure(.writeRestricted) = result else { return XCTFail("`.writeRestricted` était attendu") }
        XCTAssertFalse(fx.coordinator.callLog.contains("enqueueForRetry"))
        XCTAssertFalse(fx.coordinator.callLog.contains("emitSocketFallback"))
        XCTAssertEqual(fx.coordinator.withdrawn, ["cid_wr"])
    }

    func test_send_offline_enqueuesThroughCoordinator_withoutEmitting() async throws {
        let fx = try await makeFixture(isOnline: false)
        fx.coordinator.enqueueOfflineResult = .success(
            SentMessageReceipt(clientMessageId: MessageID("cid_fixed"), delivery: .queuedOffline)
        )

        let result = await fx.sut.send(makeOutgoing())

        guard case .success = result else { return XCTFail("un succès était attendu") }
        XCTAssertEqual(fx.coordinator.callLog, ["enqueueOffline"])
        XCTAssertEqual(fx.coordinator.emitCalls.count, 0)
    }

    func test_recordSendFailure_delegatesToCoordinator() async throws {
        let fx = try await makeFixture()

        await fx.sut.recordSendFailure(tempId: "cid_view", error: URLError(.timedOut))

        XCTAssertEqual(fx.coordinator.recordedFailures, ["cid_view"])
    }

    func test_init_withoutCoordinator_buildsLiveCoordinatorFromInjectedServices() async throws {
        let fx = try await makeFixture(injectCoordinator: false)

        let result = await fx.sut.send(makeOutgoing())

        guard case .success = result else { return XCTFail("un succès était attendu") }
        XCTAssertEqual(fx.messageService.sendCallCount, 1)
    }
}
