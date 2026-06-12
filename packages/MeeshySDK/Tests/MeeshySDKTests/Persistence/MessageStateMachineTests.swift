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

    /// A send that fails once goes `.sending -> .queued` (retry budget intact) and is
    /// mirrored into the outbox. When the OutboxFlusher later re-sends and succeeds, the
    /// reconciliation delivers a `serverAck` while the record is still `.queued`. Without a
    /// `(.queued, .serverAck)` transition the ack is rejected (returns nil) and the bubble
    /// stays stuck on the "sending" clock for a message the server actually received. The
    /// ack MUST lift `.queued -> .sent`, symmetric with the `.sending` case.
    func test_apply_serverAck_fromQueued_transitionsToSent() {
        var sm = MessageStateMachine(state: .queued, retryCount: 1)
        let result = sm.apply(.serverAck(serverId: "srv_retry", at: Date()))
        XCTAssertEqual(result, .sent)
        XCTAssertEqual(sm.state, .sent)
        XCTAssertEqual(sm.serverId, "srv_retry")
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
        // maxRetries = 3 means three attempts are allowed: retryCount must
        // already equal maxRetries for the next failure to surface as .failed.
        var sm = MessageStateMachine(state: .sending, retryCount: MessageStateMachine.maxRetries)
        let result = sm.apply(.sendFailed(TestError.network))
        XCTAssertEqual(result, .failed)
        XCTAssertEqual(sm.retryCount, MessageStateMachine.maxRetries)
    }

    func test_apply_retry_fromFailed_resetsAndRequeues() {
        var sm = MessageStateMachine(state: .failed, retryCount: 3)
        let result = sm.apply(.retry)
        XCTAssertEqual(result, .queued)
        XCTAssertEqual(sm.retryCount, 0)
    }

    /// The ack is authoritative — the server HAS the message. A row can sit in
    /// `.failed` from the orphan reconciler's grace-window guess (legitimately
    /// slow in-flight send) or an exhausted outbox whose final attempt's ack
    /// raced the exhaustion. The late ack MUST lift `.failed -> .sent` so a
    /// delivered message never keeps the failed bar + retry affordance.
    func test_apply_serverAck_fromFailed_transitionsToSent() {
        var sm = MessageStateMachine(state: .failed, retryCount: 3)
        let result = sm.apply(.serverAck(serverId: "srv_late", at: Date()))
        XCTAssertEqual(result, .sent)
        XCTAssertEqual(sm.state, .sent)
        XCTAssertEqual(sm.serverId, "srv_late")
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
