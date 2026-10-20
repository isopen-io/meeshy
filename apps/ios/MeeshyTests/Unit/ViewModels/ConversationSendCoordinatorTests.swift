import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

@MainActor
final class ConversationSendCoordinatorTests: XCTestCase {

    private static let conversationId = "00000000000000000000ff01"

    private struct Fixture {
        let sut: ConversationSendCoordinator
        let service: MockMessageService
        let socket: MockMessageSocket
        let queue: FakeOfflineMessageQueue
        let persistence: MockConversationSendPersistence
        let recorder: SendErrorRecorderSpy
    }

    private func makeFixture(
        persistenceFailure: (any Error)? = nil,
        restFailure: (any Error)? = nil,
        socketAck: MessageSocketManager.SendMessageAck? = nil,
        queueThrows: Bool = false
    ) async -> Fixture {
        let service = MockMessageService()
        if let restFailure { service.sendResult = .failure(restFailure) }
        let socket = MockMessageSocket()
        socket.sendViaSocketFallbackResult = socketAck
        let queue = FakeOfflineMessageQueue()
        if queueThrows { await queue.setShouldThrow(true) }
        let persistence = MockConversationSendPersistence(failing: persistenceFailure)
        let recorder = SendErrorRecorderSpy()
        let sut = ConversationSendCoordinator(
            conversationId: Self.conversationId,
            messageService: service,
            messageSocket: socket,
            offlineQueue: queue,
            persistence: persistence,
            recorder: recorder
        )
        return Fixture(sut: sut, service: service, socket: socket, queue: queue, persistence: persistence, recorder: recorder)
    }

    private func makeOutgoing(content: String = "Bonjour") -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID(Self.conversationId),
            content: content,
            relation: .none,
            attachments: .none
        )
    }

    private func makeContext(localId: String = "cid_test") -> SendAttemptContext {
        SendAttemptContext(
            clientMessageId: MessageID(localId),
            startedAt: Date(),
            intent: MessageProtectionIntent(),
            language: "fr",
            reusesExistingRow: false
        )
    }

    private func makePayload(_ outgoing: OutgoingMessage, context: SendAttemptContext) -> SealedOutgoingPayload {
        let request = outgoing.wireRequest(
            content: outgoing.text,
            isEncrypted: false,
            encryptionMode: nil,
            context: context,
            wireEffectFlags: nil
        )
        return SealedOutgoingPayload(request: request, content: outgoing.text, isEncrypted: false)
    }

    private func ack(_ id: String = "srv_1") -> MessageSocketManager.SendMessageAck {
        MessageSocketManager.SendMessageAck(messageId: id, clientMessageId: "cid_test", createdAt: Date(timeIntervalSince1970: 100))
    }

    // MARK: - emit

    func test_emit_socketFirstAcknowledged_returnsSocketFirstReceipt_withoutREST() async throws {
        let fx = await makeFixture(socketAck: ack())
        let outgoing = makeOutgoing()
        let context = makeContext()

        let receipt = try await fx.sut.emit(outgoing, payload: makePayload(outgoing, context: context), context: context, socketFirst: true)

        guard case .acknowledged(let serverId, _, let via) = receipt.delivery else {
            return XCTFail("un reçu acquitté était attendu")
        }
        XCTAssertEqual(serverId.rawValue, "srv_1")
        XCTAssertEqual(via, .socketFirst)
        XCTAssertEqual(fx.service.sendCallCount, 0)
    }

    func test_emit_socketFirstMiss_fallsThroughToREST() async throws {
        let fx = await makeFixture(socketAck: nil)
        let outgoing = makeOutgoing()
        let context = makeContext()

        let receipt = try await fx.sut.emit(outgoing, payload: makePayload(outgoing, context: context), context: context, socketFirst: true)

        guard case .acknowledged(_, _, let via) = receipt.delivery else {
            return XCTFail("un reçu acquitté était attendu")
        }
        XCTAssertEqual(via, .rest)
        XCTAssertEqual(fx.service.sendCallCount, 1)
        let attempts = await fx.persistence.attempts
        XCTAssertEqual(attempts.map(\.transport), [.socketFirst, .rest])
        XCTAssertEqual(attempts.map(\.outcome), [.failure, .success])
    }

    func test_emit_notSocketFirst_goesStraightToREST() async throws {
        let fx = await makeFixture(socketAck: ack())
        let outgoing = makeOutgoing()
        let context = makeContext()

        _ = try await fx.sut.emit(outgoing, payload: makePayload(outgoing, context: context), context: context, socketFirst: false)

        XCTAssertEqual(fx.socket.sendViaSocketFallbackCallCount, 0)
        XCTAssertEqual(fx.service.sendCallCount, 1)
    }

    func test_emit_restFails_rethrows_andJournalsFailedRestAttempt() async {
        let fx = await makeFixture(restFailure: URLError(.notConnectedToInternet))
        let outgoing = makeOutgoing()
        let context = makeContext()

        do {
            _ = try await fx.sut.emit(outgoing, payload: makePayload(outgoing, context: context), context: context, socketFirst: false)
            XCTFail("l'échec REST devait être relancé")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .notConnectedToInternet)
        }
        let attempts = await fx.persistence.attempts
        XCTAssertEqual(attempts.map(\.transport), [.rest])
        XCTAssertEqual(attempts.map(\.outcome), [.failure])
    }

    // MARK: - emitSocketFallback

    func test_emitSocketFallback_noAck_returnsNil_andJournalsFailure() async {
        let fx = await makeFixture(socketAck: nil)
        let outgoing = makeOutgoing()
        let context = makeContext()

        let receipt = await fx.sut.emitSocketFallback(outgoing, payload: makePayload(outgoing, context: context), context: context)

        XCTAssertNil(receipt)
        let attempts = await fx.persistence.attempts
        XCTAssertEqual(attempts.map(\.transport), [.socketFallback])
        XCTAssertEqual(attempts.map(\.outcome), [.failure])
    }

    func test_emitSocketFallback_ack_returnsReceipt_andWritesNoServerAck() async {
        let fx = await makeFixture(socketAck: ack("srv_9"))
        let outgoing = makeOutgoing()
        let context = makeContext()

        let receipt = await fx.sut.emitSocketFallback(outgoing, payload: makePayload(outgoing, context: context), context: context)

        guard case .acknowledged(let serverId, _, let via)? = receipt?.delivery else {
            return XCTFail("un reçu acquitté était attendu")
        }
        XCTAssertEqual(serverId.rawValue, "srv_9")
        XCTAssertEqual(via, .socketFallback)
        let events = await fx.persistence.appliedEvents
        XCTAssertTrue(events.isEmpty, "l'acquittement est écrit par l'hôte, après pendingServerIds")
    }

    // MARK: - ligne persistée

    func test_recordFailure_onSendingRow_persistsQueuedStateWithLastError() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let store = MessagePersistenceActor(dbWriter: pool)
        try await store.insertOptimistic(SendingRowFixture.record(localId: "cid_row", conversationId: Self.conversationId))
        let sut = ConversationSendCoordinator(
            conversationId: Self.conversationId,
            messageService: MockMessageService(),
            messageSocket: MockMessageSocket(),
            offlineQueue: FakeOfflineMessageQueue(),
            persistence: store,
            recorder: SendErrorRecorderSpy()
        )

        await sut.recordFailure(URLError(.timedOut), localId: "cid_row")

        let record = try await pool.read { db in try MessageRecord.fetchOne(db, key: "cid_row") }
        XCTAssertEqual(record?.state, .queued)
        XCTAssertNotNil(record?.lastError)
    }

    func test_acknowledge_onSendingRow_persistsSentState() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let store = MessagePersistenceActor(dbWriter: pool)
        try await store.insertOptimistic(SendingRowFixture.record(localId: "cid_ack", conversationId: Self.conversationId))
        let sut = ConversationSendCoordinator(
            conversationId: Self.conversationId,
            messageService: MockMessageService(),
            messageSocket: MockMessageSocket(),
            offlineQueue: FakeOfflineMessageQueue(),
            persistence: store,
            recorder: SendErrorRecorderSpy()
        )

        let state = await sut.acknowledge(localId: "cid_ack", serverId: "srv_ack", at: Date())

        XCTAssertEqual(state, .sent)
    }

    // MARK: - #11119 : une écriture best-effort qui échoue est enregistrée

    func test_recordFailure_persistenceThrows_isRecordedByBestEffort() async {
        let fx = await makeFixture(persistenceFailure: URLError(.cannotWriteToFile))

        await fx.sut.recordFailure(URLError(.timedOut), localId: "cid_x")

        let failures = fx.recorder.failures
        XCTAssertEqual(failures.count, 1)
        XCTAssertEqual(failures.first?.context, "send.sendFailed")
        XCTAssertEqual(failures.first?.category, .messages)
    }

    func test_markFailed_persistenceThrows_isRecordedByBestEffort() async {
        let fx = await makeFixture(persistenceFailure: URLError(.cannotWriteToFile))

        await fx.sut.markFailed(localId: "cid_x", reason: "r")

        XCTAssertEqual(fx.recorder.failures.map(\.context), ["send.markFailed"])
    }

    func test_withdraw_persistenceThrows_isRecordedByBestEffort() async {
        let fx = await makeFixture(persistenceFailure: URLError(.cannotWriteToFile))

        await fx.sut.withdraw(localId: "cid_x")

        XCTAssertEqual(fx.recorder.failures.map(\.context), ["send.withdraw"])
    }

    func test_acknowledge_persistenceThrows_isRecordedByBestEffort_andReturnsNil() async {
        let fx = await makeFixture(persistenceFailure: URLError(.cannotWriteToFile))

        let state = await fx.sut.acknowledge(localId: "cid_x", serverId: "srv", at: Date())

        XCTAssertNil(state)
        XCTAssertEqual(fx.recorder.failures.map(\.context), ["send.serverAck"])
    }

    func test_exhaustAndMarkRetrying_persistenceThrows_areRecorded() async {
        let fx = await makeFixture(persistenceFailure: URLError(.cannotWriteToFile))

        await fx.sut.exhaust(localId: "cid_x")
        await fx.sut.markRetrying(localId: "cid_x")

        XCTAssertEqual(fx.recorder.failures.map(\.context), ["send.retryExhausted", "send.retrying"])
    }

    // MARK: - file de reprise

    func test_enqueueForRetry_queueRefuses_marksRowFailed_returnsRetryEnqueueFailed() async {
        let fx = await makeFixture(queueThrows: true)
        let outgoing = makeOutgoing()
        let context = makeContext(localId: "cid_retry")

        let failure = await fx.sut.enqueueForRetry(outgoing, context: context, cause: URLError(.timedOut))

        guard case .retryEnqueueFailed = failure else {
            return XCTFail("`.retryEnqueueFailed` était attendu, reçu \(failure)")
        }
        let marks = await fx.persistence.failedMarks
        XCTAssertEqual(marks.map(\.localId), ["cid_retry"])
    }

    func test_enqueueForRetry_queueAccepts_returnsQueuedForRetry() async {
        let fx = await makeFixture()
        let outgoing = makeOutgoing()
        let context = makeContext(localId: "cid_retry")

        let failure = await fx.sut.enqueueForRetry(outgoing, context: context, cause: URLError(.timedOut))

        guard case .queuedForRetry = failure else {
            return XCTFail("`.queuedForRetry` était attendu, reçu \(failure)")
        }
        let count = await fx.queue.enqueueCount
        XCTAssertEqual(count, 1)
    }

    func test_enqueueOffline_success_returnsQueuedOfflineReceipt() async {
        let fx = await makeFixture()

        let result = await fx.sut.enqueueOffline(makeOutgoing(), clientMessageId: MessageID("cid_off"), intent: MessageProtectionIntent())

        guard case .success(let receipt) = result else {
            return XCTFail("un succès était attendu")
        }
        XCTAssertEqual(receipt.delivery, .queuedOffline)
        XCTAssertEqual(receipt.clientMessageId.rawValue, "cid_off")
    }

    func test_enqueueOffline_queueRefuses_marksRowFailed_returnsOfflineEnqueueFailed() async {
        let fx = await makeFixture(queueThrows: true)

        let result = await fx.sut.enqueueOffline(makeOutgoing(), clientMessageId: MessageID("cid_off"), intent: MessageProtectionIntent())

        guard case .failure(.offlineEnqueueFailed) = result else {
            return XCTFail("`.offlineEnqueueFailed` était attendu")
        }
        let marks = await fx.persistence.failedMarks
        XCTAssertEqual(marks.map(\.localId), ["cid_off"])
    }
}

private extension FakeOfflineMessageQueue {
    func setShouldThrow(_ value: Bool) {
        shouldThrow = value
    }
}
