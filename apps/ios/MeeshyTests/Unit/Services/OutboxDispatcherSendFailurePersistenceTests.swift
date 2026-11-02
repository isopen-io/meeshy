import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

@MainActor
final class OutboxDispatcherSendFailurePersistenceTests: XCTestCase {

    private let conversationId = "00000000000000000000d001"
    private let userId = "00000000000000000000d099"

    private struct Store {
        let pool: DatabaseQueue
        let persistence: MessagePersistenceActor

        func record(_ localId: String) async throws -> MessageRecord? {
            try await pool.read { db in try MessageRecord.fetchOne(db, key: localId) }
        }
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        try await super.tearDown()
    }

    private func makeStore() throws -> Store {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        return Store(pool: pool, persistence: MessagePersistenceActor(dbWriter: pool))
    }

    private func makeDispatcher(store: Store, service: MockMessageService) -> OutboxDispatcher {
        let persistence = store.persistence
        return OutboxDispatcher(messageService: service, persistence: { persistence })
    }

    private func failingService() -> MockMessageService {
        let service = MockMessageService()
        service.sendResult = .failure(URLError(.notConnectedToInternet))
        return service
    }

    private func outboxRecord(for item: OfflineQueueItem) -> OutboxRecord {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return OutboxRecord(
            id: "ofq_\(item.clientMessageId)",
            kind: .sendMessage,
            conversationId: item.conversationId,
            clientMessageId: item.clientMessageId,
            payload: (try? encoder.encode(item)) ?? Data()
        )
    }

    private func makeViewModel(
        store: Store,
        service: MockMessageService,
        queue: FakeOfflineMessageQueue
    ) -> ConversationViewModel {
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "replay", displayName: "Replay"))
        MessageSocketManager.shared.isConnected = false
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: service,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(persistence: store.persistence),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: queue
        )
        sut.start()
        return sut
    }

    func test_failedSendIsPersisted_thenReplayedByDispatcher() async throws {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let store = try makeStore()
        let queue = FakeOfflineMessageQueue()
        let sut = makeViewModel(store: store, service: failingService(), queue: queue)
        let outgoing = OutgoingMessage(
            conversationId: ConversationID(conversationId),
            content: "Bonjour",
            relation: .none,
            attachments: .none
        )

        let result = await sut.send(outgoing)

        guard case .failure(.queuedForRetry) = result else { return XCTFail("`.queuedForRetry` était attendu") }
        let enqueued = await queue.enqueuedItems
        let item = try XCTUnwrap(enqueued.first)
        let failedRow = try await store.record(item.clientMessageId)
        XCTAssertEqual(failedRow?.state, .queued)
        XCTAssertNotNil(failedRow?.lastError)

        let dispatcher = makeDispatcher(store: store, service: MockMessageService())
        try await dispatcher.dispatch(outboxRecord(for: item))

        let replayed = try await store.record(item.clientMessageId)
        XCTAssertEqual(replayed?.state, .sent)
        XCTAssertNotNil(replayed?.serverId)
    }

    func test_replayFailure_onOfflineStagedRow_persistsQueued_thenNextReplayAcknowledges() async throws {
        let store = try makeStore()
        try await store.persistence.insertOptimistic(
            SendingRowFixture.record(localId: "cid_off", conversationId: conversationId)
        )
        let item = OfflineQueueItem(conversationId: conversationId, content: "Bonjour", clientMessageId: "cid_off")

        do {
            try await makeDispatcher(store: store, service: failingService()).dispatch(outboxRecord(for: item))
            XCTFail("l'échec du rejeu devait être relancé")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .notConnectedToInternet)
        }
        let failedRow = try await store.record("cid_off")
        XCTAssertEqual(failedRow?.state, .queued)
        XCTAssertNotNil(failedRow?.lastError)

        try await makeDispatcher(store: store, service: MockMessageService()).dispatch(outboxRecord(for: item))

        let replayed = try await store.record("cid_off")
        XCTAssertEqual(replayed?.state, .sent)
    }

    func test_fanoutDeferral_doesNotTouchTheRow() async throws {
        let store = try makeStore()
        try await store.persistence.insertOptimistic(
            SendingRowFixture.record(localId: "cid_fan", conversationId: conversationId)
        )
        let item = OfflineQueueItem(
            conversationId: conversationId,
            content: "Bonjour",
            clientMessageId: "cid_fan",
            copyAttachmentsFromClientMessageId: "cid_origin_unresolved"
        )

        do {
            try await makeDispatcher(store: store, service: MockMessageService()).dispatch(outboxRecord(for: item))
            XCTFail("le report de fan-out devait être relancé")
        } catch {
            XCTAssertTrue(error is OutboxDeferralError)
        }

        let row = try await store.record("cid_fan")
        XCTAssertEqual(row?.state, .sending)
    }

    func test_persistsReplayFailure_excludesDeferralAndCancellation() {
        XCTAssertFalse(OutboxDispatcher.persistsReplayFailure(OutboxDeferralError.waitingForFanoutOrigin(clientMessageId: "c")))
        XCTAssertFalse(OutboxDispatcher.persistsReplayFailure(CancellationError()))
        XCTAssertTrue(OutboxDispatcher.persistsReplayFailure(URLError(.timedOut)))
    }
}
