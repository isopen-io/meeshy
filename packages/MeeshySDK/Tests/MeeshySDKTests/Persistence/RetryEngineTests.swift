import XCTest
import GRDB
@testable import MeeshySDK

final class RetryEngineTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var persistence: MessagePersistenceActor!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        persistence = MessagePersistenceActor(dbWriter: dbQueue)
    }

    func test_queuedMessageIsDetectedByObservation() async throws {
        let record = MessageRecordFactory.make(localId: "retry_001", state: .sending)
        try await persistence.insertOptimistic(record)
        _ = try await persistence.applyEvent(localId: "retry_001",
            event: .sendFailed(RetryTestError.network))

        let fetched = try persistence.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .queued)
        XCTAssertEqual(fetched[0].retryCount, 1)
    }

    func test_manualRetry_resetsCountAndRequeues() async throws {
        var record = MessageRecordFactory.make(localId: "retry_002", state: .failed)
        record.retryCount = 3
        try await persistence.insertOptimistic(record)

        _ = try await persistence.applyEvent(localId: "retry_002", event: .retry)

        let fetched = try persistence.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .queued)
        XCTAssertEqual(fetched[0].retryCount, 0)
    }

    func test_sendFailed_afterMaxRetries_moveToFailed() async throws {
        // maxRetries = 3 means three retries are permitted: a failure surfaces
        // as .failed only once retryCount has already reached the cap.
        var record = MessageRecordFactory.make(localId: "retry_003", state: .sending)
        record.retryCount = MessageStateMachine.maxRetries
        try await persistence.insertOptimistic(record)

        _ = try await persistence.applyEvent(localId: "retry_003",
            event: .sendFailed(RetryTestError.network))

        let fetched = try persistence.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .failed)
        XCTAssertEqual(fetched[0].retryCount, MessageStateMachine.maxRetries)
    }

    func test_multipleFailedMessages_allRequeue() async throws {
        for i in 0..<3 {
            let record = MessageRecordFactory.make(localId: "batch_\(i)", state: .sending)
            try await persistence.insertOptimistic(record)
            _ = try await persistence.applyEvent(localId: "batch_\(i)",
                event: .sendFailed(RetryTestError.network))
        }

        let fetched = try persistence.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched.filter { $0.state == .queued }.count, 3)
    }

    func test_retryEngine_manualRetry_integratesWithPersistence() async throws {
        let record = MessageRecordFactory.make(localId: "manual_001", state: .failed)
        try await persistence.insertOptimistic(record)

        let mockSender = MockSender()
        let engine = RetryEngine(persistence: persistence, dbWriter: dbQueue, sender: mockSender)
        await engine.manualRetry(localId: "manual_001")

        let fetched = try persistence.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .queued)
    }
}

private enum RetryTestError: Error, LocalizedError {
    case network
    var errorDescription: String? { "network" }
}

private struct MockSender: MessageSending {
    func send(conversationId: String, content: String?, contentType: String,
              encryptedPayload: Data?, attachments: Data?) async throws -> SendMessageResponse {
        SendMessageResponse(id: "srv_mock", createdAt: Date())
    }
}
