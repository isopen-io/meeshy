import Foundation
import Testing
@testable import MeeshySDK

struct SendFailureTests {

    @Test func slowModeAndWriteRestriction_areEquatable() {
        #expect(SendFailure.slowMode(NewcomerSlowMode(retryAfterSeconds: 30))
                == SendFailure.slowMode(NewcomerSlowMode(retryAfterSeconds: 30)))
        #expect(SendFailure.slowMode(NewcomerSlowMode(retryAfterSeconds: 30))
                != SendFailure.slowMode(NewcomerSlowMode(retryAfterSeconds: 31)))
        #expect(SendFailure.writeRestricted(.unknown("x")) == SendFailure.writeRestricted(.unknown("x")))
        #expect(SendFailure.ineligible != SendFailure.recipientBlocked)
    }

    @Test func failure_isAnError() {
        let result: Result<Int, SendFailure> = .failure(.queuedForRetry(reason: "timeout"))

        #expect(throws: SendFailure.self) { try result.get() }
    }

    @Test func receipt_distinguishesAcknowledgedFromQueued() {
        let acknowledged = SentMessageReceipt(
            clientMessageId: MessageID("cid_1"),
            delivery: .acknowledged(serverId: MessageID("s1"), at: Date(timeIntervalSince1970: 1), via: .rest)
        )
        let queued = SentMessageReceipt(clientMessageId: MessageID("cid_1"), delivery: .queuedOffline)

        #expect(acknowledged != queued)
    }
}
