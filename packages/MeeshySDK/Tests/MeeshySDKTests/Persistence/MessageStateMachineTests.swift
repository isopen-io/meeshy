import XCTest
@testable import MeeshySDK

final class MessageStateTests: XCTestCase {

    func test_comparable_sentIsGreaterThanSending() {
        XCTAssertTrue(MessageState.sent > MessageState.sending)
    }

    func test_comparable_readIsGreaterThanDelivered() {
        XCTAssertTrue(MessageState.read > MessageState.delivered)
    }

    func test_comparable_failedIsLessThanDraft() {
        XCTAssertTrue(MessageState.failed < MessageState.draft)
    }

    func test_codable_roundtrip() throws {
        let state = MessageState.delivered
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(MessageState.self, from: data)
        XCTAssertEqual(decoded, .delivered)
    }
}

final class MessageStateMachineTests: XCTestCase {

    // MARK: - Happy Path

    func test_apply_serverAck_fromSending_transitionsToSent() {
        var sm = MessageStateMachine(state: .sending)
        let result = sm.apply(.serverAck(serverId: "srv_123", at: Date()))
        XCTAssertEqual(result, .sent)
        XCTAssertEqual(sm.state, .sent)
        XCTAssertEqual(sm.serverId, "srv_123")
    }

    func test_apply_delivered_fromSent_transitionsToDelivered() {
        var sm = MessageStateMachine(state: .sent)
        let result = sm.apply(.delivered(count: 1, at: Date()))
        XCTAssertEqual(result, .delivered)
        XCTAssertNotNil(sm.deliveredAt)
    }

    func test_apply_readBy_fromDelivered_transitionsToRead() {
        var sm = MessageStateMachine(state: .delivered)
        let result = sm.apply(.readBy(userId: "u1", at: Date()))
        XCTAssertEqual(result, .read)
        XCTAssertNotNil(sm.readAt)
    }

    func test_apply_readBy_fromSent_skipsDelivered() {
        var sm = MessageStateMachine(state: .sent)
        let result = sm.apply(.readBy(userId: "u1", at: Date()))
        XCTAssertEqual(result, .read)
    }

    // MARK: - Retry Logic

    func test_apply_sendFailed_requeuesIfRetriesRemain() {
        var sm = MessageStateMachine(state: .sending)
        let result = sm.apply(.sendFailed(TestError.network))
        XCTAssertEqual(result, .queued)
        XCTAssertEqual(sm.retryCount, 1)
    }

    func test_apply_sendFailed_afterMaxRetries_transitionsToFailed() {
        var sm = MessageStateMachine(state: .sending, retryCount: 2)
        let result = sm.apply(.sendFailed(TestError.network))
        XCTAssertEqual(result, .failed)
        XCTAssertEqual(sm.retryCount, 3)
    }

    func test_apply_retry_fromFailed_resetsAndRequeues() {
        var sm = MessageStateMachine(state: .failed, retryCount: 3)
        let result = sm.apply(.retry)
        XCTAssertEqual(result, .queued)
        XCTAssertEqual(sm.retryCount, 0)
    }

    // MARK: - Invalid Transitions

    func test_apply_serverAck_fromRead_returnsNil() {
        var sm = MessageStateMachine(state: .read)
        let result = sm.apply(.serverAck(serverId: "srv", at: Date()))
        XCTAssertNil(result)
        XCTAssertEqual(sm.state, .read)
    }

    func test_apply_sendFailed_fromDelivered_returnsNil() {
        var sm = MessageStateMachine(state: .delivered)
        let result = sm.apply(.sendFailed(TestError.network))
        XCTAssertNil(result)
        XCTAssertEqual(sm.state, .delivered)
    }

    // MARK: - Monotonicity

    func test_fullLifecycle_stateNeverGoesBackward() {
        var sm = MessageStateMachine(state: .sending)
        let events: [MessageEvent] = [
            .serverAck(serverId: "srv_1", at: Date()),
            .delivered(count: 1, at: Date()),
            .readBy(userId: "u1", at: Date())
        ]
        var prev = sm.state
        for event in events {
            let next = sm.apply(event)
            XCTAssertNotNil(next)
            XCTAssertTrue(next! > prev)
            prev = next!
        }
    }

    // MARK: - Error Capture

    func test_sendFailed_capturesErrorDescription() {
        var sm = MessageStateMachine(state: .sending)
        _ = sm.apply(.sendFailed(TestError.timeout))
        XCTAssertEqual(sm.lastError, "timeout")
    }
}

private enum TestError: Error, LocalizedError {
    case network
    case timeout
    var errorDescription: String? { String(describing: self) }
}
