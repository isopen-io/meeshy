import XCTest
@testable import Meeshy

final class ConversationSendActivityTests: XCTestCase {

    func test_began_twice_thenEnded_once_isStillSendingWithOneInFlight() {
        let activity = ConversationSendActivity.idle.began().began().ended()

        XCTAssertEqual(activity, ConversationSendActivity(inFlight: 1))
        XCTAssertTrue(activity.isSending)
    }

    func test_ended_whenIdle_staysIdle() {
        let activity = ConversationSendActivity.idle.ended()

        XCTAssertEqual(activity, .idle)
        XCTAssertFalse(activity.isSending)
    }

    func test_equality_dependsOnInFlightOnly() {
        XCTAssertEqual(ConversationSendActivity(inFlight: 2), ConversationSendActivity.idle.began().began())
        XCTAssertNotEqual(ConversationSendActivity(inFlight: 1), ConversationSendActivity.idle)
    }

    func test_outgoingMessageState_failedDelivery_isFailed() {
        XCTAssertTrue(OutgoingMessageState(messageId: "m1", delivery: .failed).isFailed)
        XCTAssertFalse(OutgoingMessageState(messageId: "m1", delivery: .sent).isFailed)
    }
}
